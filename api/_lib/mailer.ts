/** Sends one plain-text email. The Gmail implementation and a fake for tests are added with forgot-password. */
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}
