import { accountRoute } from './_lib/accountRoute.js';
import { preflight } from './_lib/http.js';

export const OPTIONS = preflight;
export const PUT = accountRoute((accounts, { token, body }) => accounts.putCopy(token, body));
// Deleting the copy deletes the whole account.
export const DELETE = accountRoute((accounts, { token }) => accounts.deleteAccount(token), false);
