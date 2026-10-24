// @vitest-environment jsdom
// Types for the matchers; the test setup file loads them.
import '@testing-library/jest-dom/vitest';
import { configure, fireEvent, screen, waitFor } from '@testing-library/react';
import { sha256 } from 'hash-wasm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys, exportKek } from '@/data/accountCrypto';
import page from './index.html?raw';

const TOKEN = 'x'.repeat(43);
const EXPIRED = 'This link has expired. Ask for a new one in the app.';
const NO_TOKEN = 'Open the link in your email again to choose a new password.';
const DONE = 'Your password is changed. Log in on your phone with the new one.';
const LATER = 'Something went wrong. Try again in a moment.';
const PASSWORD = 'a brand new password';
/**
 * What 'ada' and PASSWORD derive, as `independently` in api/_lib/accounts.test.ts computes it: the
 * SHA-256 of `${newAuthKey} ${kek}`, so the keys, which look like real secrets, are not in the repo.
 */
const ADA_ANSWER = '69f1094909f5a745ce82f5ea776857362a933fe598357171df5c24836722b7b4';

// The page's own markup, which main.ts finds its parts in.
const markup = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;

type Answer = { status: number; body?: unknown };
const reply = ({ status, body }: Answer) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

let info: Answer | Error;
let change: Answer | Error;
const fetchMock = vi.fn<typeof fetch>();

/**
 * Opens the page as the emailed link would, the token in its fragment (links sent before that have it
 * in the query), with the service answering `info` and then `change`.
 */
async function open(after = `#token=${TOKEN}`) {
  vi.resetModules();
  document.body.innerHTML = markup;
  history.replaceState(null, '', `/reset${after}`);
  await import('./main');
}

const field = (label: string) => screen.getByLabelText(label);
const submit = () => screen.getByRole('button', { name: /password/i });
/** A request's JSON body; `{}` for one with none. */
const bodyOf = (init?: RequestInit) =>
  JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
/** The calls that sent new keys; asking whose link it is sends the token alone. */
const changes = () => fetchMock.mock.calls.filter(([, init]) => 'newAuthKey' in bodyOf(init));

function fill(first: string, second = first) {
  fireEvent.input(field('New password'), { target: { value: first } });
  fireEvent.input(field('Type it again'), { target: { value: second } });
}

// Choosing a password runs Argon2id at 64 MiB, which a loaded machine can take a while over.
configure({ asyncUtilTimeout: 10_000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  info = { status: 200, body: { username: 'ada' } };
  change = { status: 204 };
  fetchMock.mockReset().mockImplementation(async (_url, init) => {
    const answer = 'newAuthKey' in bodyOf(init) ? change : info;
    if (answer instanceof Error) throw answer;
    return reply(answer);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

describe('the reset page', () => {
  it('asks the service whose link it is, without the shared token, then offers two password fields', async () => {
    await open();
    expect(await screen.findByText('Choose a new password for ada')).toBeVisible();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    // The token goes in a POST body, never in a URL a request log could keep.
    expect(url).toBe('/api/reset');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ token: TOKEN });
    expect(field('New password')).toHaveAttribute('type', 'password');
    expect(field('Type it again')).toHaveAttribute('type', 'password');
    expect(field('New password')).toHaveFocus();
    expect(submit()).toBeEnabled();
  });

  it.each([
    ['its fragment', `#token=${TOKEN}`],
    ['the query, as links already sent have it', `?token=${TOKEN}`],
  ])(
    'reads the token from %s, and takes it out of the address bar before asking about it',
    async (_, after) => {
      let seen = '';
      fetchMock.mockImplementation(async (_url, init) => {
        seen = location.href;
        return reply(bodyOf(init).token === TOKEN ? (info as Answer) : { status: 410 });
      });
      await open(after);
      await screen.findByText('Choose a new password for ada');

      // The request's body carried it; the address bar no longer does (nor does history), nor any URL.
      expect(bodyOf(fetchMock.mock.calls[0]?.[1])).toEqual({ token: TOKEN });
      expect(fetchMock.mock.calls.map(([url]) => String(url)).join()).not.toContain(TOKEN);
      expect(seen).not.toContain(TOKEN);
      expect(location.pathname).toBe('/reset');
      expect(location.search).toBe('');
      expect(location.hash).toBe('');
      expect(location.href).not.toContain(TOKEN);
    },
  );

  it('shows the name as the service spells it, in the form the keys are derived from', async () => {
    info = { status: 200, body: { username: 'ＡＤＡ' } };
    await open();
    expect(await screen.findByText('Choose a new password for ada')).toBeVisible();
  });

  it('refuses a password under 10 characters inline, and sends nothing', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill('only9char');
    fireEvent.click(submit());

    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters.');
    expect(field('New password')).toHaveAttribute('aria-invalid', 'true');
    expect(field('New password')).toHaveFocus();
    expect(changes()).toHaveLength(0);
  });

  it('refuses a common password inline, and sends nothing', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill('password123');
    fireEvent.click(submit());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That password is too common. Pick another one.',
    );
    expect(field('New password')).toHaveAttribute('aria-invalid', 'true');
    expect(field('New password')).toHaveFocus();
    expect(changes()).toHaveLength(0);
  });

  it('refuses one character repeated, in any case, and sends nothing', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill('zzzzzzzzzzzz');
    fireEvent.click(submit());

    expect(screen.getByRole('alert')).toHaveTextContent('Use more than one character.');
    expect(changes()).toHaveLength(0);
  });

  it('refuses the name the password is for, however it is spelled, and sends nothing', async () => {
    info = { status: 200, body: { username: 'robin.smith1' } };
    await open();
    await screen.findByText('Choose a new password for robin.smith1');
    fill('Robin.Smith1');
    fireEvent.click(submit());

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Don't use your username or email as your password.",
    );
    expect(field('New password')).toHaveAttribute('aria-invalid', 'true');
    expect(changes()).toHaveLength(0);
  });

  it('takes a password of exactly 10 characters', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill('ten chars!');
    fireEvent.click(submit());
    expect(await screen.findByText(DONE)).toBeVisible();
  });

  it('refuses two passwords that do not match inline, and clears the message once they are edited', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD, `${PASSWORD}!`);
    fireEvent.click(submit());

    expect(screen.getByRole('alert')).toHaveTextContent("The two passwords don't match.");
    expect(field('Type it again')).toHaveAttribute('aria-invalid', 'true');
    expect(changes()).toHaveLength(0);

    fireEvent.input(field('Type it again'), { target: { value: PASSWORD } });
    expect(screen.getByRole('alert', { hidden: true })).not.toBeVisible();
    expect(screen.getByRole('alert', { hidden: true })).toBeEmptyDOMElement();
    expect(field('Type it again')).not.toHaveAttribute('aria-invalid');
  });

  it('sends the new keys, never the password, and says it is done', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD);
    fireEvent.click(submit());

    expect(await screen.findByText(DONE)).toBeVisible();
    expect(screen.queryByLabelText('New password')).not.toBeVisible();

    expect(changes()).toHaveLength(1);
    const [url, init] = changes()[0] ?? [];
    expect(url).toBe('/api/reset');
    // Only what the service needs: no shared token.
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const sent = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(Object.keys(sent).sort()).toEqual(['kek', 'newAuthKey', 'token']);
    expect(sent.token).toBe(TOKEN);

    // The keys the phone derives from the same name and password, kek as raw base64 (32 bytes).
    const keys = await deriveAccountKeys('ada', PASSWORD);
    expect(sent.newAuthKey).toBe(keys.authKey);
    expect(sent.kek).toBe(await exportKek(keys.kek));
    expect(atob(sent.kek ?? '')).toHaveLength(32);
    // And the known answer, from Node's own Argon2id (64 MiB, 3 passes) and HKDF, apart from both.
    expect(await sha256(`${sent.newAuthKey} ${sent.kek}`)).toBe(ADA_ANSWER);
    expect(String(init?.body)).not.toContain(PASSWORD);
    expect(String(init?.body)).not.toContain(encodeURIComponent(PASSWORD));
    // And the fields are emptied.
    expect([...document.querySelectorAll('input')].map((input) => input.value)).toEqual(['', '']);
  });

  it('shows that it is working, and sends once however many times it is pressed', async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD);

    // Straight after the press, before the key stretching has finished.
    fireEvent.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent('Changing password…');
    fireEvent.submit(submit().closest('form')!);

    expect(await screen.findByText(DONE)).toBeVisible();
    expect(changes()).toHaveLength(1);
  });

  it('says the link has expired when the service says 410', async () => {
    info = { status: 410, body: { error: 'gone' } };
    await open();
    expect(await screen.findByText(EXPIRED)).toBeVisible();
    expect(screen.queryByLabelText('New password')).not.toBeVisible();
  });

  it('asks to open the link in the email again, without asking the service, when there is no token', async () => {
    await open('');
    expect(await screen.findByText(NO_TOKEN)).toBeVisible();
    expect(screen.queryByText(EXPIRED)).toBeNull();
    expect(screen.queryByLabelText('New password')).not.toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it has expired too when the link is used up between opening the page and choosing', async () => {
    change = { status: 410, body: { error: 'gone' } };
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD);
    fireEvent.click(submit());
    expect(await screen.findByText(EXPIRED)).toBeVisible();
  });

  it('asks to try again when the service cannot be reached, and when it does not answer well', async () => {
    info = new Error('offline');
    await open();
    expect(await screen.findByText(LATER)).toBeVisible();

    info = { status: 503, body: { error: 'unavailable' } };
    await open();
    expect(await screen.findByText(LATER)).toBeVisible();
  });

  it("says plainly when this browser couldn't make the keys, sends nothing, and lets it try again", async () => {
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD);
    const instantiate = vi
      .spyOn(WebAssembly, 'instantiate')
      .mockRejectedValueOnce(new RangeError('WebAssembly.instantiate(): Out of memory'));
    fireEvent.click(submit());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "This browser couldn't make your new keys. Close other tabs and apps, then try again.",
      ),
    );
    instantiate.mockRestore();
    expect(changes()).toHaveLength(0);
    expect(submit()).toBeEnabled();

    fireEvent.click(submit());
    expect(await screen.findByText(DONE)).toBeVisible();
  });

  it('keeps the form after a failed change, so it can be tried again', async () => {
    change = { status: 503, body: { error: 'unavailable' } };
    await open();
    await screen.findByText('Choose a new password for ada');
    fill(PASSWORD);
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(LATER));
    expect(submit()).toBeEnabled();
    expect(submit()).toHaveTextContent('Change password');
    expect(field('New password')).toHaveValue(PASSWORD);

    change = { status: 429, body: { error: 'too many attempts' } };
    fireEvent.click(submit());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Too many tries. Wait a while'),
    );

    change = { status: 204 };
    fireEvent.click(submit());
    expect(await screen.findByText(DONE)).toBeVisible();
    expect(changes()).toHaveLength(3);
  });
});

describe('the reset page markup', () => {
  it('keeps itself out of search engines and does not pass the link on as a referrer', () => {
    expect(page).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(page).toMatch(/<meta name="referrer" content="no-referrer"/);
  });
});
