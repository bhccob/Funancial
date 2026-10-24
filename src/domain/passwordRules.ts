import { COMMON_PASSWORDS } from './commonPasswords';

export { COMMON_PASSWORDS };

/*
 * The rules for a new password, kept in one place because a password is chosen in four: setup, the
 * Create-account sheet, Change password, and the reset page (site/reset), which imports this module
 * as it imports the account keys. The service only ever sees a key derived from the password, so
 * nothing there can refuse "password123": the check is the app's and the reset page's.
 */

/** The fewest characters a password can have. */
const MIN_LENGTH = 10;

/** The strength at which a password is called strong: this long, with at least three kinds of character. */
const STRONG_LENGTH = 14;
const STRONG_KINDS = 3;

export type PasswordStrength = 'weak' | 'okay' | 'strong';

/** Who the password is for: a password may not be their username, or their email's name part. */
export interface PasswordOwner {
  username?: string;
  email?: string;
}

/** How the service reads a username (NFKC, lower case), so a full-width or capitalised spelling is the same name. */
const fold = (text: string) => text.trim().normalize('NFKC').toLowerCase().normalize('NFKC');

/** The names a password may not be: the username, the email and the part of it before the `@`. */
function namesOf({ username, email }: PasswordOwner): string[] {
  const names = [username ?? '', email ?? '', (email ?? '').split('@')[0] ?? ''];
  return names.map(fold).filter((name) => name !== '');
}

/**
 * What is wrong with a password, as a sentence to show, or `null` when it is fine. The first of these
 * that applies: shorter than 10 characters; one character repeated; on the list of common passwords
 * (ignoring case); the username or the email's name part (ignoring case and spaces round them).
 */
export function passwordProblem(password: string, who: PasswordOwner = {}): string | null {
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (new Set(password).size === 1) return 'Use more than one character.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Pick another one.';
  }
  const typed = fold(password);
  if (namesOf(who).includes(typed)) return "Don't use your username or email as your password.";
  return null;
}

/**
 * How strong a password is: `weak` when it is refused (`passwordProblem`), `strong` at 14 characters
 * or more with at least three of lower case, upper case, digits and symbols, else `okay`. A symbol is
 * anything that is not a cased letter or a digit: a space, punctuation, or a letter of a script with
 * no case.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (passwordProblem(password) !== null) return 'weak';
  if (password.length < STRONG_LENGTH) return 'okay';
  const kinds = [/\p{Ll}/u, /[\p{Lu}\p{Lt}]/u, /\p{Nd}/u, /[^\p{Ll}\p{Lu}\p{Lt}\p{Nd}]/u];
  return kinds.filter((kind) => kind.test(password)).length >= STRONG_KINDS ? 'strong' : 'okay';
}
