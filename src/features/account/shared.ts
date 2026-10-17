import { useRef, useState } from 'react';

export const BIOMETRIC_FAILED =
  "Fingerprint or face unlock couldn't be turned on. You can try again in Settings.";

export const FORGOT_LEAD =
  "Type your username or the email you signed up with. We'll email you a link to choose a new password.";

export const errorMessage = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'Something went wrong.';

/** `busy` while a job runs. A second tap before it ends does nothing: state would still read idle in it. */
export function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  async function guard(job: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await job();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, guard };
}
