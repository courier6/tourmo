import { CURRENCIES, dollars, formatMoney, formatPercent } from './money';
import type { Currency, Money, Offer, OfferBasis, OfferType } from './types';

export interface ParsedOffer {
  raw: string;
  /**
   * True only when the whole text was read as a deal with nothing left over.
   * False when it could not be read, or was read with doubts. Saving is still
   * allowed either way.
   */
  ok: boolean;
  type?: OfferType;
  guarantee?: Money;
  percentage?: number;
  threshold?: Money;
  basis: OfferBasis;
  /** True when neither "gross" nor "net" was written and gross was assumed. */
  basisAssumed: boolean;
  /** Fields the deal type needs that the text did not give. */
  missing: ('guarantee' | 'percentage' | 'threshold')[];
  /** Why the reading may be wrong, in plain words. The fields hold the best guess. */
  doubts: string[];
}

/** A number found in the text, with what was written around it. */
interface Found {
  text: string;
  value: number;
  start: number;
  /** Written with a currency sign or word, "k" or "grand", so it is certainly money. */
  marked: boolean;
  /** The currency its sign or word names, when it has one. */
  currency?: Currency;
  percent: boolean;
  /** Letters run straight on from the digits, as in "8pm". */
  attached: boolean;
  /** The word after it, when only spaces sit between. */
  follower?: string;
}

// A figure with what can be written around it: "$1k", "1.5 grand", "800 €",
// "1000 eur", "70%". A sign after the figure counts only when no digit
// follows it, so "800 $100" is still 800 and $100.
const NUMBER = /(%\s*)?([$€£]\s*)?(\d+(?:\.\d+)?)(k\b|\s*grand\b)?(\s*(?:[$€£](?!\s*\d)|(?:usd|eur|gbp|dollars?|euros?|pounds?)\b))?(\s*(?:%|percent\b|pct\b))?/g;

/** The currency a sign or word names. */
const NAMED: [RegExp, Currency][] = [
  [/\$|usd|dollar/, 'USD'],
  [/€|eur/, 'EUR'],
  [/£|gbp|pound/, 'GBP'],
];
const named = (mark: string | undefined): Currency | undefined => (mark === undefined ? undefined : NAMED.find(([sign]) => sign.test(mark))?.[1]);

/** Words that can follow a figure in a deal. Anything else gets a second look. */
const DEAL_WORDS = new Set('vs v versus against plus flat guarantee guaranteed of after over above net gross nbor gbor door and or split deal expenses costs the a'.split(' '));

/**
 * Ways a promoter writes that the percentage is taken after deductions:
 * "net", "NBOR" (net box office receipts), or "after expenses", "after costs"
 * and "after the house nut" with no figure in between. "After $2,250" is a
 * threshold instead, and is read as one.
 */
const NET_WORDS = /\b(?:net|nbor)\b|\bafter\s+(?:(?:the|all|house|show|venue|promoter)\s+)*(?:expenses|costs|nut)\b/;
const GROSS_WORDS = /\b(?:gross|gbor)\b/;

function findNumbers(text: string): Found[] {
  const found: Found[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const end = m.index + m[0].length;
    const multiplier = m[4] ? 1000 : 1;
    found.push({
      text: m[0].trim(),
      value: Number(m[3]) * multiplier,
      start: m.index,
      marked: Boolean(m[2] || m[4] || m[5]),
      currency: named(m[2]) ?? named(m[5]),
      percent: Boolean(m[1] || m[6]),
      attached: /^[a-z]/.test(text.slice(end)),
      follower: /^ +([a-z]+)/.exec(text.slice(end))?.[1],
    });
  }
  return found;
}

const list = (items: Found[]) => items.map((n) => `"${n.text}"`).join(' and ');

/**
 * Reads promoter shorthand such as "$1K + 70% < $2250" or "80% of door".
 * Case, spacing, currency signs and thousands commas do not matter.
 *
 * Amounts are taken to be in `currency`, the tour's. "$", "€" and "£", and
 * the words for them, all mark a figure as money; one that names another
 * currency is read as the same number, since nothing is ever converted, and
 * a doubt says so. "1.000" is one thousand, as promoters in Europe write it:
 * no deal is written to a thousandth.
 *
 * Every number in the text has to be accounted for. When one is left over,
 * or a figure is followed by a word that is not part of a deal, the reading
 * is a best guess: `ok` is false and `doubts` says why.
 */
export function parseOffer(raw: string, currency: Currency = 'USD'): ParsedOffer {
  const money = (amount: number) => formatMoney(dollars(amount), currency);
  const text = raw
    .toLowerCase()
    // A comma is dropped only where it groups thousands: "2,250", not "1,5k".
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    // So is a dot: "1.000" and "12.500", not "1.5k" or "1234.567".
    .replace(/(?<![\d.,])(\d{1,3})((?:\.\d{3})+)(?!\d)/g, (_, head: string, groups: string) => head + groups.replace(/\./g, ''))
    // "70/30" is a split, band's share first.
    .replace(/(?<![\d.\/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d.\/])/g, (whole, a, b) => (Number(a) + Number(b) === 100 ? `${a}%` : whole));

  const basis: OfferBasis = NET_WORDS.test(text) ? 'net' : 'gross';
  const basisAssumed = !NET_WORDS.test(text) && !GROSS_WORDS.test(text);
  const result: ParsedOffer = { raw, ok: false, basis, basisAssumed, missing: [], doubts: [] };
  const doubt = (words: string) => result.doubts.push(words);

  const numbers = findNumbers(text);
  const isVersus = /\b(?:vs|v|versus|against)\b/.test(text);

  // Percentages. With more than one, the one written after "vs" or "+" is the deal's.
  const percents = numbers.filter((n) => n.percent);
  const afterJoiner = (n: Found) => /(?:\bvs\.?|\bv\.?|\bversus|\bagainst|\+|\bplus)\s*$/.test(text.slice(0, n.start));
  const pct = percents.find(afterJoiner) ?? percents[0];
  if (percents.length > 1) {
    doubt(`More than one percentage. ${formatPercent(pct.value / 100)} was used and ${list(percents.filter((n) => n !== pct))} left out.`);
  }

  // Plain numbers: one may be a threshold, one the guarantee. "8pm" is neither.
  const plain = numbers.filter((n) => !n.percent);
  const stray = plain.filter((n) => n.attached);
  const usable = plain.filter((n) => !n.attached);
  const isThreshold = (n: Found) => /(?:<|>|\bafter|\bover|\babove)\s*$/.test(text.slice(0, n.start));
  const thresholds = usable.filter(isThreshold);
  const amounts = usable.filter((n) => !isThreshold(n));
  const thr = thresholds[0];

  let amt = amounts[0];
  if (amounts.length > 1) {
    const marked = amounts.filter((n) => n.marked);
    if (marked.length === 1) amt = marked[0];
    doubt(`More than one number could be the guarantee. ${money(amt.value)} was used and ${list(amounts.filter((n) => n !== amt))} left out.`);
  }
  const unused = [...stray, ...thresholds.slice(1)];
  if (unused.length) doubt(`${list(unused)} was left out.`);

  for (const n of [amt, thr]) {
    if (n?.follower && !DEAL_WORDS.has(n.follower)) doubt(`"${n.text} ${n.follower}" was read as ${money(n.value)}. Check that it is a ${CURRENCIES[currency].one} amount.`);
    if (n?.currency && n.currency !== currency) {
      doubt(`"${n.text}" is written in ${CURRENCIES[n.currency].name}, and this tour is in ${CURRENCIES[currency].name}. It was read as ${money(n.value)}; nothing is converted.`);
    }
  }
  if (pct?.follower && !DEAL_WORDS.has(pct.follower)) doubt(`"${pct.text} ${pct.follower}" was read as the deal's percentage. Check that it is.`);

  const percentage = pct ? pct.value / 100 : undefined;
  const guarantee = amt ? dollars(amt.value) : undefined;
  const threshold = thr ? dollars(thr.value) : undefined;
  const isPlus = /\+|\bplus\b/.test(text) || threshold !== undefined;

  if (isVersus) {
    result.type = 'versus';
    result.guarantee = guarantee;
    result.percentage = percentage;
    if (guarantee === undefined) result.missing.push('guarantee');
    if (percentage === undefined) result.missing.push('percentage');
    if (thr) doubt(`"${thr.text}" was left out, because a versus deal has no threshold. If expenses come off first, set "Taken of" to Net.`);
  } else if (isPlus) {
    result.type = 'plus';
    result.guarantee = guarantee;
    result.percentage = percentage;
    result.threshold = threshold;
    if (guarantee === undefined) result.missing.push('guarantee');
    if (percentage === undefined) result.missing.push('percentage');
    if (threshold === undefined) result.missing.push('threshold');
  } else if (percentage !== undefined && guarantee === undefined) {
    result.type = 'percentage';
    result.guarantee = 0;
    result.percentage = percentage;
  } else if (guarantee !== undefined && percentage === undefined) {
    result.type = 'flat';
    result.guarantee = guarantee;
  } else {
    // Nothing readable, or an amount and a percentage with no word joining them.
    return result;
  }

  result.ok = result.doubts.length === 0;
  return result;
}

/** Turn a reading (or hand-filled fields) into an Offer. Never throws. */
export function toOffer(fields: {
  raw: string;
  type?: OfferType;
  guarantee?: Money;
  percentage?: number;
  threshold?: Money;
  basis: OfferBasis;
}): Offer {
  const type = fields.type ?? 'flat';
  const offer: Offer = {
    raw: fields.raw,
    type,
    guarantee: type === 'percentage' ? 0 : (fields.guarantee ?? 0),
    basis: fields.basis,
  };
  if (type !== 'flat' && fields.percentage !== undefined) offer.percentage = fields.percentage;
  if (type === 'plus' && fields.threshold !== undefined) offer.threshold = fields.threshold;
  return offer;
}

export const SHORTHAND_EXAMPLES = ['$1K vs 70%', '$1K + 70% < $2250', '1k plus 70% after 2,250', '$800 flat', '80% of door', '70/30 split', '70% of net'];

/** The same examples, written in a tour's currency. */
export const shorthandExamples = (currency: Currency = 'USD'): string[] => SHORTHAND_EXAMPLES.map((example) => example.replaceAll('$', CURRENCIES[currency].symbol));
