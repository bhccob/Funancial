import { accountRoute } from '../_lib/accountRoute.js';
import { preflight } from '../_lib/http.js';

export const OPTIONS = preflight;
export const POST = accountRoute((accounts, { body, ip }) => accounts.signup(body, ip));
