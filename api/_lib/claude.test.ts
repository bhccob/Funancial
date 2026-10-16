import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvisorInput } from './advisorSchema.js';
import { askClaude } from './claude.js';

// The SDK is the one thing replaced: what the route sends it and what it does with the answer are
// the point. `create` is what a request to Claude would be.
const { create, client } = vi.hoisted(() => ({ create: vi.fn(), client: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } };
    constructor(options: unknown) {
      client(options);
    }
  },
}));

const input = {
  snapshot: { currency: 'USD', cash: 150_000 },
  ask: { item: 'Headphones', price: 19_999 },
  facts: { total: 19_999 },
  rules: { meter: 40, verdict: 'wait', confidence: 'low', guards: { capAtWait: false } },
  about: { situation: 'Student', matters: '', overspend: '', facts: ['Has a cat'] },
  debate: [{ role: 'you', text: 'It broke' }],
} as unknown as AdvisorInput;

const model = {
  recommendation: 'wait',
  meter: 45,
  confidence: 'low',
  summary: 'Hold off for now.',
  pros: ['You need them'],
  cons: ['Over the limit'],
  alternatives: ['A cheaper pair'],
  coolingOffHours: 48,
  reply: 'Fair point.',
  question: 'Would you still want them in a week?',
  remember: null,
};

const text = (value: unknown) => ({ type: 'text', text: JSON.stringify(value) });
const message = (content: unknown[], stop_reason = 'end_turn') => ({
  content,
  stop_reason,
  stop_details: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.ANTHROPIC_MODEL;
  create.mockResolvedValue(message([text(model)]));
});

afterEach(() => {
  delete process.env.ANTHROPIC_MODEL;
});

const sent = () => create.mock.calls[0]![0];

describe('askClaude', () => {
  it('asks Opus 5.5 for JSON, 4000 tokens at most, with the input as the user message', async () => {
    await askClaude(input);
    expect(create).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    });
    // Nothing the person typed rides in the system prompt.
    expect(sent().system).not.toContain('Student');
    expect(sent().system).not.toContain('Headphones');

    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    await askClaude(input);
    expect(create.mock.calls[1]![0].model).toBe('claude-sonnet-5-5');
    // A blank setting (a copied .env.example) is no setting.
    process.env.ANTHROPIC_MODEL = '';
    await askClaude(input);
    expect(create.mock.calls[2]![0].model).toBe('claude-opus-5-5');
  });

  it('uses the SDK for structured output and refusal fallback, and stays inside the function time', async () => {
    await askClaude(input);
    const { output_config } = sent();
    expect(output_config.format.type).toBe('json_schema');
    const schema = output_config.format.schema;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(model).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(model).sort());
    expect(schema.properties.recommendation.enum).toEqual(['buy', 'wait', 'cheaper', 'skip']);
    expect(schema.properties.confidence.enum).toEqual(['low', 'medium', 'high']);
    expect(schema.properties.coolingOffHours.type).toEqual(['number', 'null']);
    expect(schema.properties.pros).toEqual({ type: 'array', items: { type: 'string' } });
    // Structured output refuses a schema with limits or a draft marker, so none is sent.
    expect(schema.$schema).toBeUndefined();
    expect(JSON.stringify(schema)).not.toMatch(/minLength|maxLength|minimum|maximum/);
    // Thinking cannot be switched off on this model and counts against max_tokens, so it runs light.
    expect(output_config.effort).toBe('low');
    expect(sent().betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(sent().fallbacks).toBe('default');
    // One attempt, ended before the 30 s the function is given and when the app stops waiting.
    expect(client).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 20_000, maxRetries: 0 }),
    );
  });

  it('states the guardrails in the system prompt', async () => {
    await askClaude(input);
    const system: string = sent().system.toLowerCase();
    for (const rule of [
      'no licensed financial advice',
      'never encourage debt or risky spending',
      'transparent and non-manipulative',
      'never shame',
      'every figure comes from the app',
      'end with one pointed question or counterargument',
      'only for a new, durable personal fact',
      'capatwait',
    ]) {
      expect(system, rule).toContain(rule);
    }
  });

  it('returns the answer, taking the last text block and ignoring the rest', async () => {
    create.mockResolvedValue(
      message([
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'not the answer' },
        { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
        text(model),
      ]),
    );
    expect(await askClaude(input)).toEqual(model);
  });

  it('treats a refusal as a failure, even with text beside it, and keeps the text out of the error', async () => {
    create.mockResolvedValue({
      ...message([text(model)], 'refusal'),
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'secret explanation' },
    });
    const err = await askClaude(input).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('refus');
    expect(err!.message).not.toContain('secret');
  });

  it('treats invalid JSON, a wrong shape, a cut-off answer or no text as a failure', async () => {
    const failures: unknown[] = [
      message([{ type: 'text', text: 'Sure! Here is my advice.' }]),
      message([{ type: 'text', text: '{"recommendation":"wait"' }]),
      message([{ type: 'text', text: '' }]),
      message([text({ ...model, recommendation: 'maybe' })]),
      message([text({ ...model, meter: '45' })]),
      message([text({ ...model, question: '' })]),
      message([text({ ...model, pros: 'You need them' })]),
      message([text({ ...model, remember: undefined })]),
      message([text([model])]),
      message([text(null)]),
      message([{ type: 'thinking', thinking: '' }]),
      message([]),
      // Cut at max_tokens: not an answer even if what came before parses.
      message([text(model)], 'max_tokens'),
    ];
    for (const failure of failures) {
      create.mockResolvedValue(failure);
      await expect(askClaude(input), JSON.stringify(failure)).rejects.toThrow();
    }
  });

  it('lets what the SDK throws through, for the route to report as upstream', async () => {
    const boom = Object.assign(new Error('429 rate limited'), { status: 429 });
    create.mockRejectedValue(boom);
    await expect(askClaude(input)).rejects.toBe(boom);
  });

  it('keeps cooling-off hours at zero or more, and none when they are no number', async () => {
    const hours = async (value: unknown) => {
      create.mockResolvedValue(message([text({ ...model, coolingOffHours: value })]));
      return (await askClaude(input)).coolingOffHours;
    };
    expect(await hours(48)).toBe(48);
    expect(await hours(0)).toBe(0);
    expect(await hours(1.5)).toBe(1.5);
    expect(await hours(-24)).toBe(0);
    expect(await hours(null)).toBeNull();
    for (const odd of ['soon', '24', true, {}, [], [24]]) {
      expect(await hours(odd), JSON.stringify(odd)).toBeNull();
    }
    // Left out altogether (JSON drops an undefined).
    create.mockResolvedValue(message([text({ ...model, coolingOffHours: undefined })]));
    expect((await askClaude(input)).coolingOffHours).toBeNull();
  });

  it('reads a remembered fact longer than 200 characters as none', async () => {
    // An About-you fact holds 200 characters, and a longer one would fail the person's next ask.
    const remember = async (value: unknown) => {
      create.mockResolvedValue(message([text({ ...model, remember: value })]));
      return (await askClaude(input)).remember;
    };
    expect(await remember('Has a cat')).toBe('Has a cat');
    expect(await remember('r'.repeat(200))).toBe('r'.repeat(200));
    expect(await remember('r'.repeat(201))).toBeNull();
    expect(await remember(null)).toBeNull();
  });

  it('passes a meter through as given, for the route to hold within the guards', async () => {
    create.mockResolvedValue(message([text({ ...model, meter: 95.5 })]));
    expect((await askClaude(input)).meter).toBe(95.5);
  });
});
