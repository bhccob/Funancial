import { useCallback, useState } from 'react';
import { FIRST_STEP_KEYS, type FirstStepKey } from '@/lib/firstSteps';
import { safeStorage } from '@/lib/safeStorage';

/**
 * Which of Home's first-time cards have been answered, read from this phone once, and a way to
 * answer one: it is written to `safeStorage` and held here too, so the card goes at once even where
 * the phone cannot keep it. The cards and the sheet that sets a balance share one, as Home holds it.
 */
export function useFirstStepAnswers() {
  const [answered, setAnswered] = useState<readonly FirstStepKey[]>(() =>
    FIRST_STEP_KEYS.filter((key) => safeStorage.get(key) === '1'),
  );
  const answer = useCallback((key: FirstStepKey) => {
    safeStorage.set(key, '1');
    setAnswered((now) => (now.includes(key) ? now : [...now, key]));
  }, []);
  return { has: (key: FirstStepKey) => answered.includes(key), answer };
}

export type FirstStepAnswers = ReturnType<typeof useFirstStepAnswers>;
