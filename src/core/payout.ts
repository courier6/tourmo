import { formatMoney, formatPercent, percentOf } from './money';
import type { Currency, Money, Offer } from './types';

/** What the offer puts into the plan. */
export function guaranteedMinimum(offer: Offer): Money {
  return offer.type === 'percentage' ? 0 : offer.guarantee;
}

/**
 * What the deal pays for a given box office figure. "basis" is gross or net
 * as the offer says; the caller passes whichever figure was entered.
 */
export function payout(offer: Offer, basis: Money): Money {
  const rate = offer.percentage ?? 0;
  switch (offer.type) {
    case 'flat':
      return offer.guarantee;
    case 'versus':
      return Math.max(offer.guarantee, percentOf(rate, basis));
    case 'plus': {
      // An incomplete plus deal (no threshold yet) pays the guarantee only.
      if (offer.threshold === undefined) return offer.guarantee;
      const over = Math.max(0, basis - offer.threshold);
      return offer.guarantee + percentOf(rate, over);
    }
    case 'percentage':
      return percentOf(rate, basis);
  }
}

/** One sentence saying how the payout came out, for the One date screen. */
export function explainPayout(offer: Offer, basis: Money, currency: Currency = 'USD'): string {
  const money = (cents: Money) => formatMoney(cents, currency);
  const rate = offer.percentage ?? 0;
  const pct = formatPercent(rate);
  switch (offer.type) {
    case 'flat':
      return `Flat deal: ${money(offer.guarantee)} whatever the door does.`;
    case 'versus': {
      const share = percentOf(rate, basis);
      return share > offer.guarantee
        ? `${pct} is ${money(share)}, which beats the ${money(offer.guarantee)} guarantee.`
        : `${pct} is ${money(share)}, so the ${money(offer.guarantee)} guarantee pays.`;
    }
    case 'plus': {
      if (offer.threshold === undefined) {
        return `No threshold entered yet, so only the ${money(offer.guarantee)} guarantee counts.`;
      }
      const over = Math.max(0, basis - offer.threshold);
      if (over === 0) {
        return `The ${offer.basis} is not over ${money(offer.threshold)}, so the ${money(offer.guarantee)} guarantee pays.`;
      }
      return `${pct} of the ${money(over)} over ${money(offer.threshold)} is ${money(percentOf(rate, over))}, on top of the ${money(offer.guarantee)} guarantee.`;
    }
    case 'percentage':
      return `${pct} of ${money(basis)} is ${money(percentOf(rate, basis))}.`;
  }
}

/** The offer in plain words, for the "Read as" panel. */
export function describeOffer(offer: Omit<Offer, 'raw'>, currency: Currency = 'USD'): string {
  const money = (cents: Money) => formatMoney(cents, currency);
  const pct = offer.percentage === undefined ? 'a percentage' : formatPercent(offer.percentage);
  const g = money(offer.guarantee);
  switch (offer.type) {
    case 'flat':
      return `${g} flat guarantee.`;
    case 'versus':
      return `${g} guarantee or ${pct} of the ${offer.basis}, whichever is greater.`;
    case 'plus':
      return offer.threshold === undefined
        ? `${g} guarantee, plus ${pct} of the ${offer.basis} over an amount that still needs entering.`
        : `${g} guarantee, plus ${pct} of the ${offer.basis} over ${money(offer.threshold)}.`;
    case 'percentage':
      return `${pct} of the ${offer.basis}, no guarantee.`;
  }
}

/** Three box office figures that show how the deal behaves. */
export function examplePayouts(offer: Offer): { basis: Money; payout: Money }[] {
  const rate = offer.percentage ?? 0;
  let pivot: Money;
  if (offer.type === 'plus' && offer.threshold !== undefined) pivot = offer.threshold;
  else if (offer.type === 'versus' && rate > 0) pivot = offer.guarantee / rate;
  else if (offer.guarantee > 0) pivot = offer.guarantee;
  else pivot = 100000;
  const step = 25000; // examples land on multiples of $250
  const nice = (n: number) => Math.max(step, Math.round(n / step) * step);
  const figures = [nice(pivot * 0.75), nice(pivot * 1.25), nice(pivot * 1.75)];
  return figures.map((basis) => ({ basis, payout: payout(offer, basis) }));
}
