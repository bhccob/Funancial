import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(new URL('../../docs/accounts.md', import.meta.url), 'utf8');
const text = guide.replace(/\s+/g, ' ');

describe("the owner's setup guide", () => {
  it('holds names only: no 32-byte key, and no long random string', () => {
    expect(guide).not.toMatch(/[A-Za-z0-9+/]{43}=/);
    expect(guide).not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });

  it('ends by telling the owner to tell Claude it is done', () => {
    expect(guide.trimEnd().split('\n').at(-1)).toBe("Then tell Claude it's done.");
  });

  it('says a leaked database token reads locked copies it cannot unlock, can delete or block them, and is serious', () => {
    const row = guide.split('\n').find((line) => line.startsWith('| `KV_REST_API_URL`'))!;
    expect(row).toMatch(/read every copy, but the copies stay locked/);
    expect(row).toMatch(/can't unlock one without the master key/);
    expect(row).toMatch(/delete the copies, or block them/);
    expect(row).toMatch(/\*\*Serious\.\*\*.*Tell Claude at once/);
    expect(row).not.toMatch(/as serious as a leaked master key|make the service unlock/i);
    expect(text).not.toContain('a leak of the database password is as serious');
  });

  it("tells the owner to say so if Vercel's variable names differ", () => {
    expect(text).toContain(
      "If the variables Vercel added aren't named `KV_REST_API_URL` and `KV_REST_API_TOKEN` (for example, a prefix was added), tell Claude.",
    );
  });

  it('says what the last search finds and misses, and that it matches other names', () => {
    expect(text).toContain("It can't see `acct:t:`, `acct:e:` or `acct:r:`");
    expect(text).toContain("matches other people's names that contain the text");
    expect(text).not.toContain('Nothing of theirs should be left');
  });

  it("calls the friend's email left in the database personal data", () => {
    expect(text).toContain("entry's name is the friend's email address");
    expect(text).toContain('personal data');
  });
});
