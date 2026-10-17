/** Privacy, terms and the three disclaimers. The facts here are what the app does; change them with it. */
export const LEGAL: {
  privacy: string[];
  terms: string[];
  disclaimers: Array<{ title: string; text: string }>;
} = {
  privacy: [
    'Your data lives on your phone, encrypted.',
    'There is no account and no analytics. Funancial does not know who you are, and it does not track how you use it.',
    "The only network calls go to the app's own price service. They fetch prices, exchange rates, dividends, news, symbol searches and price history, and they read a product link when you paste one. They carry only what is needed to look something up: a symbol, the text you type in search, a currency pair, a start date, or a pasted link. Never your amounts, balances or notes.",
    'An app installed from the download page also checks that page for a newer version. That check carries nothing about you.',
    "A backup is a file you choose where to save, encrypted with your passphrase. Funancial doesn't keep your passphrase, so if you lose it, nobody can open the backup.",
  ],
  terms: [
    'Funancial is a personal app, provided as is, with no warranty.',
    "It isn't financial advice. It shows your own numbers, and you decide.",
    'Prices, exchange rates, dividend dates and news come from outside sources and can be late or wrong. Check anything that matters before you act on it.',
    'Your backups and your passphrase are yours to keep safe, because only you have them.',
  ],
  disclaimers: [
    {
      title: 'Not financial advice',
      text: 'Funancial is not financial advice. It shows your own numbers so you can decide.',
    },
    {
      title: 'Prices can be late',
      text: 'Market prices are delayed and may be out of date.',
    },
    {
      title: 'News is from others',
      text: "Headlines come from a third party. Funancial doesn't check them.",
    },
  ],
};
