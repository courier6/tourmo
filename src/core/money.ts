import type { Currency, Money } from './types';

/** Whole dollars (may carry cents as a decimal) to stored cents. */
export const dollars = (n: number): Money => Math.round(n * 100);

/** Round a cent amount to whole dollars, half up. */
export function roundToDollar(cents: number): Money {
  // The small guard keeps binary float noise from pushing x.5 just under the line.
  return Math.floor(cents / 100 + 0.5 + 1e-9) * 100;
}

/** Round a cent amount down to whole dollars. */
export function floorToDollar(cents: number): Money {
  return Math.floor(cents / 100 + 1e-9) * 100;
}

/**
 * rate × amount, rounded to whole dollars half up. Done in integers
 * (rate as hundredths of a percent) so 70% of $1,005 is $704, not $703.
 */
export function percentOf(rate: number, amount: Money): Money {
  const basisPoints = Math.round(rate * 10000);
  return Math.floor((amount * basisPoints + 500000) / 1000000) * 100;
}

/**
 * What a typed figure means: a number, undefined for an empty field, or
 * 'invalid'. "$1,200", "1.5k" and "12." are numbers. A comma groups thousands
 * ("1,200") or, before one or two last digits, is a decimal point ("12,50"),
 * as phones set to other regions type it. Anything else is refused, never
 * read as part of what was typed.
 */
export function parseTyped(text: string): number | undefined | 'invalid' {
  let t = text.trim().replace(/[$%\s]/g, '');
  const k = /k$/i.test(t);
  if (k) t = t.slice(0, -1);
  t = t.replace(/[.,]$/, ''); // still typing: "12." or "1,"
  if (t === '') return k ? 'invalid' : undefined;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return 'invalid';
  const n = Number(t);
  return k ? n * 1000 : n;
}

/** How each currency is written. `one` and `name` are for sentences: "a euro amount", "the odd euros". */
export const CURRENCIES: Record<Currency, { symbol: string; one: string; name: string; label: string }> = {
  USD: { symbol: '$', one: 'dollar', name: 'dollars', label: 'US dollars ($)' },
  EUR: { symbol: '€', one: 'euro', name: 'euros', label: 'Euros (€)' },
  GBP: { symbol: '£', one: 'pound', name: 'pounds', label: 'Pounds (£)' },
};

/** Every currency with its label, for a select. */
export const CURRENCY_OPTIONS = (Object.keys(CURRENCIES) as Currency[]).map((c): [Currency, string] => [c, CURRENCIES[c].label]);

/** The currency a tour is kept in. A tour saved before there was a choice is in dollars. */
export const currencyOf = (tour: { currency?: Currency }): Currency => tour.currency ?? 'USD';

/**
 * "$1,280" or "€1,280". Cents are shown only when there are any. The currency
 * only picks the symbol: every currency is written the same way, symbol first.
 */
export function formatMoney(cents: Money, currency: Currency = 'USD'): string {
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const text = whole.toLocaleString('en-US') + (frac ? '.' + String(frac).padStart(2, '0') : '');
  return (cents < 0 ? '−' : '') + CURRENCIES[currency].symbol + text;
}

/** "70%" or "12.5%". */
export function formatPercent(rate: number): string {
  return String(Math.round(rate * 10000) / 100) + '%';
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
