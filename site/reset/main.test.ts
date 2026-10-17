// @vitest-environment jsdom
// Types for the matchers; the test setup file loads them.
import '@testing-library/jest-dom/vitest';
import { configure, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys, exportKek } from '@/data/accountCrypto';
import page from './index.html?raw';

const TOKEN = 'x'.repeat(43);
const EXPIRED = 'This link has expired. Ask for a new one in the app.';
const DONE = 'Your password is changed. Log in on your phone with the new one.';
const LATER = 'Something went wrong. Try again in a moment.';
const PASSWORD = 'a brand new password';

// The page's own markup, which main.ts finds its parts in.
const markup = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;

type Answer = { status: number; body?: unknown };
const reply = ({ status, body }: Answer) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

let info: Answer | Error;
let change: Answer | Error;
const fetchMock = vi.fn<typeof fetch>();

/** Opens the page as the emailed link would, with the service answering `info` and then `change`. */
async function open(search = `?token=${TOKEN}`) {
  vi.resetModules();
  document.body.innerHTML = markup;
  history.replaceState(null, '', `/reset${search}`);
  await import('./main');
}

const field = (label: string) => screen.getByLabelText(label);
const submit = () => screen.getByRole('button', { name: /password/i });
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

function fill(first: string, second = first) {
  fireEvent.input(field('New password'), { target: { value: first } });
  fireEvent.input(field('Type it again'), { target: { value: second } });
}

// Choosing a password stretches the key 600,000 times, which a loaded machine can take a while over.
configure({ asyncUtilTimeout: 10_000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  info = { status: 200, body: { username: 'ada' } };
  change = { status: 204 };
  fetchMock.mockReset().mockImplementation(async (_url, init) => {
    const answer = init?.method === 'POST' ? change : info;
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
    expect(url).toBe(`/api/reset?token=${TOKEN}`);
    expect(init?.headers).toBeUndefined();
    expect(field('New password')).toHaveAttribute('type', 'password');
    expect(field('Type it again')).toHaveAttribute('type', 'password');
    expect(field('New password')).toHaveFocus();
    expect(submit()).toBeEnabled();
  });

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
    expect(posts()).toHaveLength(0);
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
    expect(posts()).toHaveLength(0);

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

    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0] ?? [];
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
    expect(posts()).toHaveLength(1);
  });

  it('says the link has expired when the service says 410', async () => {
    info = { status: 410, body: { error: 'gone' } };
    await open();
    expect(await screen.findByText(EXPIRED)).toBeVisible();
    expect(screen.queryByLabelText('New password')).not.toBeVisible();
  });

  it('says the link has expired, without asking, when there is no token', async () => {
    await open('');
    expect(await screen.findByText(EXPIRED)).toBeVisible();
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
    expect(posts()).toHaveLength(3);
  });
});

describe('the reset page markup', () => {
  it('keeps itself out of search engines and does not pass the link on as a referrer', () => {
    expect(page).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(page).toMatch(/<meta name="referrer" content="no-referrer"/);
  });
});
