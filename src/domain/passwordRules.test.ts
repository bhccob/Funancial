import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from './commonPasswords';
import { passwordProblem, passwordStrength } from './passwordRules';

const SHORT = 'Use at least 10 characters.';
const ONE_CHARACTER = 'Use more than one character.';
const COMMON = 'That password is too common. Pick another one.';
const OWN_NAME = "Don't use your username or email as your password.";

describe('passwordProblem', () => {
  it('asks for at least 10 characters', () => {
    expect(passwordProblem('short')).toBe(SHORT);
    expect(passwordProblem('')).toBe(SHORT);
    expect(passwordProblem('nine char')).toBe(SHORT);
    expect(passwordProblem('ten chars!')).toBeNull();
  });

  it('refuses one character repeated', () => {
    expect(passwordProblem('aaaaaaaaaaaa')).toBe(ONE_CHARACTER);
    expect(passwordProblem('          ')).toBe(ONE_CHARACTER);
    expect(passwordProblem('😀😀😀😀😀😀')).toBe(ONE_CHARACTER);
    expect(passwordProblem('aaaaaaaaaab')).toBeNull();
  });

  it('refuses a common password, whatever its case', () => {
    expect(passwordProblem('Password123')).toBe(COMMON);
    expect(passwordProblem('PASSWORD123')).toBe(COMMON);
    expect(passwordProblem('password123')).toBe(COMMON);
    expect(passwordProblem('1234567890')).toBe(COMMON);
    expect(passwordProblem('qwertyuiop')).toBe(COMMON);
  });

  it('refuses the username, or the name part of the email, whatever its case', () => {
    expect(passwordProblem('robin.smith1', { username: 'robin.smith1' })).toBe(OWN_NAME);
    expect(passwordProblem('Robin.Smith1', { username: 'robin.smith1' })).toBe(OWN_NAME);
    expect(passwordProblem('robin.smith1', { username: ' Robin.Smith1 ' })).toBe(OWN_NAME);
    expect(passwordProblem('LongerName1', { email: 'longername1@x.io' })).toBe(OWN_NAME);
    expect(passwordProblem('longername1', { email: ' LongerName1@X.io ' })).toBe(OWN_NAME);
    // The whole address is no better than its name.
    expect(passwordProblem('Robin@Example.com', { email: 'robin@example.com' })).toBe(OWN_NAME);
    // The service reads a username in NFKC, so a full-width spelling is the same name.
    expect(passwordProblem('robin.smith1', { username: 'ＲＯＢＩＮ.smith1' })).toBe(OWN_NAME);
  });

  it('leaves a password that only contains the name, or a name that is not given, alone', () => {
    expect(passwordProblem('robin.smith1 and more', { username: 'robin.smith1' })).toBeNull();
    expect(passwordProblem('robin.smith1', { email: 'robin.smith1@x.io' })).toBe(OWN_NAME);
    expect(passwordProblem('robin.smith1', {})).toBeNull();
    expect(passwordProblem('robin.smith1', { username: '', email: '' })).toBeNull();
    expect(passwordProblem('robin.smith1', { email: 'not an address' })).toBeNull();
    expect(passwordProblem('robin.smith1')).toBeNull();
  });

  it('takes a long password of words', () => {
    expect(passwordProblem('correct horse battery')).toBeNull();
    expect(passwordProblem('a long enough password')).toBeNull();
    expect(passwordProblem('a brand new password', { username: 'ada' })).toBeNull();
  });

  it('says the first thing wrong when several are', () => {
    // Too short beats common; one character beats common; common beats the name.
    expect(passwordProblem('aaaa')).toBe(SHORT);
    expect(passwordProblem('1111111111')).toBe(ONE_CHARACTER);
    expect(passwordProblem('password123', { username: 'password123' })).toBe(COMMON);
  });
});

describe('passwordStrength', () => {
  it('is weak for a password that is refused', () => {
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('')).toBe('weak');
    expect(passwordStrength('aaaaaaaaaaaa')).toBe('weak');
    expect(passwordStrength('Password123')).toBe('weak');
    // One of the common ones, so refused whatever its letters: weak, not okay.
    expect(passwordStrength('abcdefghij')).toBe('weak');
  });

  it('is okay when it is allowed but not both long and mixed', () => {
    // 10 to 13 characters, however mixed.
    expect(passwordStrength('abcdefghijk')).toBe('okay');
    expect(passwordStrength('Tr0ub4dor&3x')).toBe('okay');
    // 14 characters or more, but of one kind, or two.
    expect(passwordStrength('correcthorsebattery')).toBe('okay');
    expect(passwordStrength('CorrectHorseBattery')).toBe('okay');
    expect(passwordStrength('correct12345678')).toBe('okay');
    expect(passwordStrength('correct horse battery')).toBe('okay');
  });

  it('is strong at 14 characters with at least 3 of lower, upper, digit and symbol', () => {
    expect(passwordStrength('Tr0ub4dor&3xyz')).toBe('strong');
    // Lower, upper and digit; lower, digit and symbol; lower, upper and symbol.
    expect(passwordStrength('CorrectHorse123')).toBe('strong');
    expect(passwordStrength('correct-horse-1')).toBe('strong');
    expect(passwordStrength('Correct-Horse-Battery')).toBe('strong');
    // The 14th character is the one that counts.
    expect(passwordStrength('Tr0ub4dor&3xy')).toBe('okay');
  });

  it('counts a space, or a letter of another script, as a symbol, and an accented letter as a letter', () => {
    expect(passwordStrength('Correct Horse 1')).toBe('strong');
    expect(passwordStrength('correct horse 12345')).toBe('strong');
    expect(passwordStrength('ünïcödé wörds äöü')).toBe('okay');
    expect(passwordStrength('Ünïcödé wörds 12')).toBe('strong');
    expect(passwordStrength('パスワードパスワードパスワード')).toBe('okay');
    expect(passwordStrength('パスワードパスワードパスワ1a')).toBe('strong');
  });
});

describe('COMMON_PASSWORDS', () => {
  it('is about a thousand passwords of 10 or more characters, lower-cased', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(900);
    expect(COMMON_PASSWORDS.size).toBeLessThanOrEqual(1100);
    for (const word of COMMON_PASSWORDS) {
      expect(word.length, word).toBeGreaterThanOrEqual(10);
      expect(word, word).toBe(word.toLowerCase());
    }
  });

  it('holds the best-known ones', () => {
    for (const word of ['password123', '1234567890', 'qwertyuiop']) {
      expect(COMMON_PASSWORDS.has(word), word).toBe(true);
    }
  });
});
