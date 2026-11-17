// Offers as promoters outside the United States write them: other currency
// signs, the sign after the figure, currency words and dotted thousands.

import { describe, expect, it } from 'vitest';
import { dollars, parseOffer, shorthandExamples, SHORTHAND_EXAMPLES } from './index';

const $ = dollars;

describe('offers in other currencies', () => {
  it('reads a euro or pound sign as it reads a dollar sign', () => {
    expect(parseOffer('€1K vs 70%', 'EUR')).toMatchObject({ ok: true, type: 'versus', guarantee: $(1000), percentage: 0.7 });
    expect(parseOffer('£800 flat', 'GBP')).toMatchObject({ ok: true, type: 'flat', guarantee: $(800) });
    expect(parseOffer('€1K + 70% < €2250', 'EUR')).toMatchObject({ ok: true, type: 'plus', guarantee: $(1000), threshold: $(2250) });
  });

  it('reads the sign or the word after the figure', () => {
    expect(parseOffer('800 € flat', 'EUR')).toMatchObject({ ok: true, type: 'flat', guarantee: $(800) });
    expect(parseOffer('1000€ vs 70%', 'EUR')).toMatchObject({ ok: true, type: 'versus', guarantee: $(1000) });
    expect(parseOffer('1000 EUR vs 70%', 'EUR')).toMatchObject({ ok: true, type: 'versus', guarantee: $(1000) });
    expect(parseOffer('1k euros plus 70% after 2500 euro', 'EUR')).toMatchObject({ ok: true, type: 'plus', guarantee: $(1000), threshold: $(2500) });
    expect(parseOffer('500 pounds guarantee', 'GBP')).toMatchObject({ ok: true, type: 'flat', guarantee: $(500) });
    expect(parseOffer('800 dollars flat')).toMatchObject({ ok: true, type: 'flat', guarantee: $(800) });
  });

  it('reads a dot before three digits as thousands', () => {
    expect(parseOffer('1.000 € + 70% after 2.500 €', 'EUR')).toMatchObject({ ok: true, type: 'plus', guarantee: $(1000), threshold: $(2500) });
    expect(parseOffer('€12.500 flat', 'EUR')).toMatchObject({ ok: true, guarantee: $(12500) });
    expect(parseOffer('1.500 vs 80%')).toMatchObject({ ok: true, guarantee: $(1500) });
    // A decimal is still a decimal.
    expect(parseOffer('€1.5k flat', 'EUR')).toMatchObject({ ok: true, guarantee: $(1500) });
    expect(parseOffer('€12.50 flat', 'EUR')).toMatchObject({ ok: true, guarantee: $(12.5) });
    expect(parseOffer('1,500 vs 72.5%', 'EUR')).toMatchObject({ ok: true, guarantee: $(1500), percentage: 0.725 });
  });

  it('takes a figure with no sign to be in the currency of the tour', () => {
    expect(parseOffer('1k vs 70%', 'EUR')).toMatchObject({ ok: true, guarantee: $(1000), doubts: [] });
  });

  it('reads a figure written in another currency as the same number, and says so', () => {
    const read = parseOffer('$1K vs 70%', 'EUR');
    expect(read).toMatchObject({ ok: false, type: 'versus', guarantee: $(1000), percentage: 0.7 });
    expect(read.doubts).toEqual(['"$1k" is written in dollars, and this tour is in euros. It was read as €1,000; nothing is converted.']);
    expect(parseOffer('€800 flat').doubts).toEqual(['"€800" is written in euros, and this tour is in dollars. It was read as $800; nothing is converted.']);
    expect(parseOffer('1k + 70% over 2000 gbp', 'EUR').doubts).toHaveLength(1);
  });

  it('writes its doubts in the currency of the tour', () => {
    expect(parseOffer('€500 250 flat', 'EUR').doubts[0]).toContain('€500 was used');
    expect(parseOffer('500 tickets', 'EUR').doubts).toEqual(['"500 tickets" was read as €500. Check that it is a euro amount.']);
    expect(parseOffer('500 tickets').doubts).toEqual(['"500 tickets" was read as $500. Check that it is a dollar amount.']);
  });

  it('still reads two dollar figures side by side as two figures', () => {
    const read = parseOffer('800 $100');
    expect(read.guarantee).toBe($(100));
    expect(read.ok).toBe(false);
  });

  it('gives the examples in the currency of the tour, and each reads cleanly', () => {
    expect(shorthandExamples()).toEqual(SHORTHAND_EXAMPLES);
    expect(shorthandExamples('EUR')[1]).toBe('€1K + 70% < €2250');
    for (const raw of shorthandExamples('GBP')) expect(parseOffer(raw, 'GBP')).toMatchObject({ ok: true, doubts: [] });
  });
});
