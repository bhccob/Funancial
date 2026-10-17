import nodemailer from 'nodemailer';

/** Sends one plain-text email. */
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/**
 * The owner's Gmail, from `GMAIL_USER` and a Google app password (`GMAIL_APP_PASSWORD`), read when this
 * is called, as everything here is. Null when either is missing.
 */
export function gmailMailerFromEnv(): Mailer | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return {
    async send(to, subject, text) {
      await transport.sendMail({ from: `Funancial <${user}>`, to, subject, text });
    },
  };
}

export type SentMail = { to: string; subject: string; text: string };

/** Keeps what it is asked to send instead of sending it; for tests. */
export function fakeMailer(): Mailer & { sent: SentMail[] } {
  const sent: SentMail[] = [];
  return {
    sent,
    async send(to, subject, text) {
      sent.push({ to, subject, text });
    },
  };
}
