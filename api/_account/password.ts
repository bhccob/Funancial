import { accountRoute } from '../_lib/accountRoute.js';
import { preflight } from '../_lib/http.js';

export const OPTIONS = preflight;
export const POST = accountRoute((accounts, { token, body }) =>
  accounts.changePassword(token, body),
);
