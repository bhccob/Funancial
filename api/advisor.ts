import {
  AdvisorAskSchema,
  AdvisorRequestSchema,
  type AdvisorAnswer,
  type AdvisorRequest,
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

type Checked = Pick<AdvisorRequest, 'rules' | 'facts'>;

/**
 * Whether the purchase hits a hard guard: the client's own flag, or either of the guards its facts
 * show (it needs debt, or leaves the available balance below zero), so a client that says "no
 * guard" about a purchase whose facts need one still gets the cap.
 */
const capAtWait = ({ rules, facts }: Checked) =>
  rules.guards.capAtWait || facts.requiresDebt || facts.availableAfter < 0;

/**
 * The answer held within the guards. The meter stays within the rules meter ± 30 and 0–100, and
 * under a guard at most 66 (which wins over the band), so a Buy never comes out of one. The verdict
 * and confidence then agree with the final, whole-number meter. `clamped` says something was
 * changed; rounding to a whole number is not a change.
 */
function withGuards(answer: AdvisorAnswer, request: Checked) {
  const base = request.rules.meter;
  const lowest = Math.max(0, base - BAND);
  const highest = Math.min(100, base + BAND, capAtWait(request) ? WAIT_CAP : 100);
  const held = Math.min(highest, Math.max(lowest, answer.meter));
  const meter = Math.round(held);

  // As the app reads a meter: skip to 33, wait 34–66, buy from 67. A verdict must fit its meter:
  // Buy in the buy zone, Skip in the skip zone, Cheaper in the wait zone, and any other is Wait.
  const zone = meter >= 67 ? 'buy' : meter >= 34 ? 'wait' : 'skip';
  const fits = { buy: zone === 'buy', skip: zone === 'skip', cheaper: zone === 'wait', wait: true };
  const recommendation = fits[answer.recommendation] ? answer.recommendation : 'wait';
  const away = Math.abs(meter - 50);
  const confidence = away >= 30 ? 'high' : away >= 15 ? 'medium' : 'low';

  return {
    ...answer,
    recommendation,
    meter,
    confidence,
    clamped:
      held !== answer.meter ||
      recommendation !== answer.recommendation ||
      confidence !== answer.confidence,
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
    return json(req, withGuards(answer, parsed.data), 'no-store');
  } catch (err) {
    return upstream(req, err);
  }
}
