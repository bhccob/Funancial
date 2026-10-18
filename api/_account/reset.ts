import { accountRoute } from '../_lib/accountRoute.js';

// Skips the shared X-Funancial-Token: the page at /reset is public, so it can't carry one. The emailed
// token is the proof (256 bits, one use, 30 minutes), behind a limit of 20 tries an hour per address.
// It travels in a POST body only, never in a URL a request log keeps (so there is no GET: 405):
// `{ token }` asks whose link it is, `{ token, newAuthKey, kek }` sets the new password.
const setsPassword = (body: unknown) =>
  typeof body === 'object' && body !== null && ('newAuthKey' in body || 'kek' in body);

export const POST = accountRoute(
  (accounts, { body, ip }) =>
    setsPassword(body) ? accounts.reset(body, ip) : accounts.resetInfo(body, ip),
  true,
  { sharedToken: false },
);
