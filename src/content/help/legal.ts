/** Privacy, terms and the three disclaimers. The facts here are what the app does; change them with it. */
export const LEGAL: {
  privacy: string[];
  terms: string[];
  disclaimers: Array<{ title: string; text: string }>;
} = {
  privacy: [
    'Your data lives on your phone, encrypted.',
    "There are no analytics, and Funcial doesn't track how you use it.",
    "Apart from the update check below, the only network calls go to the app's own service. Its lookups fetch prices, exchange rates, dividends, news, symbol searches, price history and company logos (by symbol), and read a product link when you paste one. A lookup carries only what is needed to look something up: a symbol, the text you type in search, a currency pair, a start date, or a pasted link. Never your amounts, balances or notes.",
    'If you have an account, the app also sends a locked copy of your data to that service, and keeps it there, so you can move to a new phone.',
    'Your email is used only for "forgot password".',
    'Because "forgot password" brings your data back, the service can unlock the copy, so the app\'s owner, who runs it, and anyone who got into the owner\'s Vercel account could read it.',
    '"Delete all data" erases everything you added. With an account, its locked copy starts over with the phone, keeping only your name, currency and settings. The account and that copy stay on the service until you delete them from the phone you use it on (Settings, Account, Turn off and delete my copy) or ask the app\'s owner to remove them.',
    'An app installed from the download page also checks that page for a newer version. That check carries nothing about you.',
  ],
  terms: [
    'Funcial is a personal app, provided as is, with no warranty.',
    "It isn't financial advice. It shows your own numbers, and you decide.",
    'Prices, exchange rates, dividend dates and news come from outside sources and can be late or wrong. Check anything that matters before you act on it.',
    'If you set a PIN or passphrase, it is yours to keep safe, because only you have it.',
    'If you make an account, its locked copy is kept on a service one person runs, as is, with no promise it will always be there.',
  ],
  disclaimers: [
    {
      title: 'Not financial advice',
      text: 'Funcial is not financial advice. It shows your own numbers so you can decide.',
    },
    {
      title: 'Prices can be late',
      text: 'Market prices are delayed and may be out of date.',
    },
    {
      title: 'News is from others',
      text: "Headlines come from a third party. Funcial doesn't check them.",
    },
  ],
};
