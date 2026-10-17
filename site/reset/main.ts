import '../get/page.css';
import { canonicalUsername, deriveAccountKeys, exportKek } from '@/data/accountCrypto';

/*
 * The page an emailed reset link opens. The friend chooses a new password here; this derives the new
 * keys, exactly as the phone does, and hands the service `authKey` and `kek`, which it uses to set the
 * new password and lock the data key again. The password itself never leaves this page.
 */

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = el('reset-status');
const form = el<HTMLFormElement>('reset-form');
const title = el('reset-title');
const password = el<HTMLInputElement>('reset-password');
const again = el<HTMLInputElement>('reset-again');
const error = el('reset-error');
const submit = el<HTMLButtonElement>('reset-submit');

const MIN_LENGTH = 10;
const EXPIRED = 'This link has expired. Ask for a new one in the app.';
// The address has no token: the link is opened again from the email (a reload gets here, as the token is taken out).
const NO_TOKEN = 'Open the link in your email again to choose a new password.';
const DONE = 'Your password is changed. Log in on your phone with the new one.';
const LATER = 'Something went wrong. Try again in a moment.';

const token = new URLSearchParams(location.search).get('token');
// Read, so no longer needed in the address bar: not in the history, a screenshot, or a copied link.
history.replaceState(null, '', location.pathname);
let username = '';
let busy = false;

/** Replaces the form with a line. */
function say(text: string) {
  status.textContent = text;
  status.hidden = false;
  form.hidden = true;
}

function complain(text: string, ...fields: HTMLInputElement[]) {
  error.textContent = text;
  error.hidden = false;
  clearInvalid();
  for (const field of fields) field.setAttribute('aria-invalid', 'true');
  fields[0]?.focus();
}

function clearInvalid() {
  password.removeAttribute('aria-invalid');
  again.removeAttribute('aria-invalid');
}

function clearComplaint() {
  error.hidden = true;
  // Both fields point at it as their description, and a hidden line is still read out.
  error.textContent = '';
  clearInvalid();
}

async function open() {
  if (!token) return say(NO_TOKEN);
  try {
    const res = await fetch(`/api/reset?token=${encodeURIComponent(token)}`);
    if (res.status === 410) return say(EXPIRED);
    const body = (await res.json()) as { username?: unknown };
    if (!res.ok || typeof body.username !== 'string') return say(LATER);
    username = canonicalUsername(body.username);
  } catch {
    return say(LATER);
  }
  title.textContent = `Choose a new password for ${username}`;
  status.hidden = true;
  form.hidden = false;
  password.focus();
}

async function change(event: SubmitEvent) {
  event.preventDefault();
  if (busy) return;
  if (password.value.length < MIN_LENGTH) {
    return complain(`Use at least ${MIN_LENGTH} characters.`, password);
  }
  if (password.value !== again.value) {
    return complain("The two passwords don't match.", again);
  }
  clearComplaint();

  // Deriving takes a moment (the key stretching is slow on purpose): show it, and allow one go.
  busy = true;
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  submit.textContent = 'Changing password…';
  try {
    const { authKey, kek } = await deriveAccountKeys(username, password.value);
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newAuthKey: authKey, kek: await exportKek(kek) }),
    });
    if (res.status === 204) {
      form.reset();
      return say(DONE);
    }
    if (res.status === 410) return say(EXPIRED);
    complain(res.status === 429 ? 'Too many tries. Wait a while, then try again.' : LATER);
  } catch {
    complain(LATER);
  } finally {
    busy = false;
    submit.disabled = false;
    form.removeAttribute('aria-busy');
    submit.textContent = 'Change password';
  }
}

form.addEventListener('submit', (event) => void change(event));
password.addEventListener('input', clearComplaint);
again.addEventListener('input', clearComplaint);
void open();
