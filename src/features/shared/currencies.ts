const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR', 'SGD', 'ZAR'];

/** Select options for a currency: the common ones first, then every other ISO code. */
export function currencyOptions(
  keep: (code: string) => boolean = () => true,
): Array<{ value: string; label: string }> {
  const names = new Intl.DisplayNames(undefined, { type: 'currency' });
  const rest = Intl.supportedValuesOf('currency').filter((c) => !COMMON_CURRENCIES.includes(c));
  return [...COMMON_CURRENCIES, ...rest].filter(keep).map((code) => ({
    value: code,
    label: `${code} · ${names.of(code) ?? code}`,
  }));
}
