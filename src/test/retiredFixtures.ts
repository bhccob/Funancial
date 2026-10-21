import type { AboutYou, BuyAsk, BuyDecision } from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';

/**
 * Builders for the rows of the two retired features, "Should I buy it?" and About you. No screen,
 * action or demo makes these rows any more; only the schema tests still do, because the schemas
 * stay until the v10 upgrade deletes the rows. Delete this file with them.
 */
const stamp = () => {
  const now = nowIso();
  return { createdAt: now, updatedAt: now };
};

export function makeBuyAsk(overrides: Partial<BuyAsk> = {}): BuyAsk {
  return {
    item: 'Headphones',
    price: 100_00,
    quantity: 1,
    category: 'entertainment',
    urgency: 'want',
    howSoon: 'month',
    payWith: 'debit',
    cardId: null,
    link: null,
    why: null,
    ...overrides,
  };
}

export function makeBuyDecision(overrides: Partial<BuyDecision> = {}): BuyDecision {
  return {
    id: newId(),
    ...stamp(),
    ask: makeBuyAsk(),
    facts: {
      total: 100_00,
      categoryAfter: null,
      overallAfter: null,
      overBy: 0,
      availableAfter: 400_00,
      emergencyBefore: null,
      emergencyAfter: null,
      goalDelay: null,
      requiresDebt: false,
      resetsOn: null,
    },
    rulesMeter: 50,
    rulesVerdict: 'wait',
    meter: 50,
    verdict: 'wait',
    confidence: 'low',
    guards: { capAtWait: false, reasons: [] },
    notes: [],
    status: 'open',
    remindOn: null,
    boughtOn: null,
    usage: null,
    ...overrides,
  };
}

export function makeAboutYou(overrides: Partial<AboutYou> = {}): AboutYou {
  return {
    id: 'about',
    ...stamp(),
    situation: '',
    matters: '',
    overspend: [],
    protectGoalId: null,
    ...overrides,
  };
}
