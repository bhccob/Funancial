import { accountRoute } from '../_lib/accountRoute.js';

// Both skip the shared X-Funancial-Token: the page at /reset is public, so it can't carry one. The
// emailed token is the proof (256 bits, one use, 30 minutes), behind a limit of 20 tries an hour per address.
const open = { sharedToken: false };

export const GET = accountRoute(
  (accounts, { query, ip }) => accounts.resetInfo(query.get('token'), ip),
  false,
  open,
);
export const POST = accountRoute((accounts, { body, ip }) => accounts.reset(body, ip), true, open);
