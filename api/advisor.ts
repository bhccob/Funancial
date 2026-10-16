import {
  AdvisorAskSchema,
  AdvisorRequestSchema,
  type AdvisorAnswer,
} from './_lib/advisorSchema.js';
import { askClaude } from './_lib/claude.js';
import { badRequest, guard, json, preflight, upstream } from './_lib/http.js';

export const OPTIONS = preflight;

const MAX_BODY_BYTES = 64 * 1024;
// The client may send the whole debate (up to 40 turns); Claude is shown the newest 20.
const DEBATE_TURNS = 20;
// How far the answer may move the meter from what the rules said.
const BAND = 30;
// The top of the wait zone: with a guard, the meter never reaches Buy.
const WAIT_CAP = 66;

type Rules = { meter: number; guards: { capAtWait: boolean } };

/**
 * The answer held within the guards. The meter stays within the rules meter ± 30 and 0–100; under
 * `capAtWait` it is also at most 66 (which wins over the band) and a Buy becomes a Wait. `clamped`
 * says a guard changed something; rounding to a whole number is not one.
 */
function withGuards(answer: AdvisorAnswer, { meter: base, guards }: Rules) {
  const lowest = Math.max(0, base - BAND);
  const highest = Math.min(100, base + BAND, guards.capAtWait ? WAIT_CAP : 100);
  const meter = Math.min(highest, Math.max(lowest, answer.meter));
  const recommendation =
    guards.capAtWait && answer.recommendation === 'buy' ? 'wait' : answer.recommendation;
  return {
    ...answer,
    recommendation,
    meter: Math.round(meter),
    clamped: meter !== answer.meter || recommendation !== answer.recommendation,
  };
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  // Bytes, not characters. The platform caps a body far above this, so reading it first is bounded.
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new RangeError('body too big');
  return JSON.parse(text);
}

export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) return json(req, { error: 'advisor off' }, 'no-store', 503);

  let parsed;
  try {
    parsed = AdvisorRequestSchema.safeParse(await readBody(req));
  } catch {
    return badRequest(req);
  }
  if (!parsed.success) return badRequest(req);

  const { ask, debate, rules, ...rest } = parsed.data;
  try {
    const answer = await askClaude({
      ...rest,
      rules,
      ask: AdvisorAskSchema.parse(ask),
      debate: debate.slice(-DEBATE_TURNS),
    });
    return json(req, withGuards(answer, rules), 'no-store');
  } catch (err) {
    return upstream(req, err);
  }
}
