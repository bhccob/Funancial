/**
 * What Home's two first-time cards keep on this phone once they are answered (Not now, or a balance
 * saved as 0), under `safeStorage`: `'1'` for answered. Not in the data, so a restored copy does not
 * bring a card back. Their names sit here, apart from the cards, so Delete all data can forget the
 * answers with the data (`FIRST_STEP_KEYS`) and setup, started again, asks again.
 */
export const FIRST_BALANCE_KEY = 'funancial.first.balance';
export const FIRST_SUBSCRIPTIONS_KEY = 'funancial.first.subscriptions';

export const FIRST_STEP_KEYS = [FIRST_BALANCE_KEY, FIRST_SUBSCRIPTIONS_KEY] as const;

export type FirstStepKey = (typeof FIRST_STEP_KEYS)[number];
