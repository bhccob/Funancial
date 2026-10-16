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

// shortcut: common regions only, so anyone elsewhere starts on USD; widen these two tables when
// someone from another region uses the app. Australian zones are matched by prefix.
const words = (list: string) => list.split(/\s+/);
/** Exported so a test can check every entry. */
export const ZONES: Record<string, string[]> = {
  EUR: words(`Europe/Amsterdam Europe/Brussels Europe/Paris Europe/Berlin Europe/Madrid Europe/Rome
    Europe/Lisbon Europe/Vienna Europe/Dublin Europe/Helsinki Europe/Athens Europe/Luxembourg
    Europe/Bratislava Europe/Ljubljana Europe/Tallinn Europe/Riga Europe/Vilnius Europe/Valletta
    Europe/Zagreb Europe/Sofia Europe/Nicosia Asia/Nicosia`),
  GBP: ['Europe/London'],
  CHF: ['Europe/Zurich'],
  SEK: ['Europe/Stockholm'],
  NOK: ['Europe/Oslo'],
  DKK: ['Europe/Copenhagen'],
  PLN: ['Europe/Warsaw'],
  CZK: ['Europe/Prague'],
  HUF: ['Europe/Budapest'],
  JPY: ['Asia/Tokyo'],
  SGD: ['Asia/Singapore'],
  INR: ['Asia/Kolkata'],
  ZAR: ['Africa/Johannesburg'],
  CAD: words('America/Toronto America/Vancouver America/Edmonton America/Winnipeg America/Halifax'),
  USD: words(`America/New_York America/Chicago America/Denver America/Los_Angeles America/Phoenix
    America/Anchorage Pacific/Honolulu`),
};
export const REGIONS: Record<string, string[]> = {
  EUR: words('AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'),
  GBP: ['GB'],
  CHF: ['CH'],
  SEK: ['SE'],
  NOK: ['NO'],
  DKK: ['DK'],
  PLN: ['PL'],
  CZK: ['CZ'],
  HUF: ['HU'],
  JPY: ['JP'],
  SGD: ['SG'],
  INR: ['IN'],
  ZAR: ['ZA'],
  AUD: ['AU'],
  CAD: ['CA'],
  USD: ['US'],
};

const find = (table: Record<string, string[]>, key: string | undefined) =>
  key ? Object.keys(table).find((currency) => table[currency]?.includes(key)) : undefined;

function regionOf(locale: string | undefined): string | undefined {
  try {
    return locale ? new Intl.Locale(locale).maximize().region : undefined;
  } catch {
    return undefined; // not a locale tag
  }
}

/**
 * The currency to start setup on. The time zone is the better location signal (an English (US)
 * phone is often in the Netherlands), then the language's region, then USD.
 */
export function defaultCurrency(timeZone: string | undefined, locale: string | undefined): string {
  if (timeZone?.startsWith('Australia/')) return 'AUD';
  return find(ZONES, timeZone) ?? find(REGIONS, regionOf(locale)) ?? 'USD';
}
