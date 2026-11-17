// A tour kept in a currency other than dollars: what its amounts read as,
// what a new tour brings over from it, and how it is saved and read back.

import { describe, expect, it } from 'vitest';
import {
  blankTour,
  budget,
  carryOver,
  currencyOf,
  dateAgainstPlan,
  describeOffer,
  dollars,
  expenseDiff,
  explainPayout,
  formatMoney,
  isTour,
  lineDiff,
  netDiff,
  parseOffer,
  revenueDiff,
  seedTour,
  setCurrency,
  toOffer,
  type Tour,
} from './core';
import { backupOf, readSaved } from './store';

const $ = dollars;

/** The Spring run sample, kept in euros. Its figures are the same numbers. */
const euroRun = (): Tour => ({ ...seedTour(), id: 'euro-run', currency: 'EUR' });

/** A finished tour of the band's own, with figures it typed. */
const lastTour = (currency?: Tour['currency']): Tour => {
  const t = blankTour('last', 'Winter run', 'Dallas, TX');
  delete t.setup;
  if (currency) t.currency = currency;
  t.commissions = [{ id: 'agent', name: 'Agent', rate: 0.1, base: 'show' }];
  t.vehicle.dailyRate = $(140);
  t.fuel.mpg = 18;
  t.merchPerShowDefault = $(200);
  t.lodgingPerNightDefault = $(180);
  t.perDiem = $(25);
  t.people = 5;
  t.lodgingRooms = 3;
  t.merchCostRate = 0.3;
  t.splitBetween = 4;
  return t;
};

describe('writing an amount', () => {
  it('puts the symbol of the currency in front, and dollars when none is given', () => {
    expect(formatMoney($(1280))).toBe('$1,280');
    expect(formatMoney($(1280), 'USD')).toBe('$1,280');
    expect(formatMoney($(1280), 'EUR')).toBe('€1,280');
    expect(formatMoney($(-35.5), 'GBP')).toBe('−£35.50');
  });

  it('takes a tour with no currency to be in dollars', () => {
    expect(currencyOf(seedTour())).toBe('USD');
    expect(currencyOf(euroRun())).toBe('EUR');
  });

  it('writes differences from plan in the currency', () => {
    expect(revenueDiff(0, $(280), 'EUR')).toEqual({ text: '+€280', tone: 'good' });
    expect(revenueDiff($(35), 0, 'EUR')).toEqual({ text: '−€35', tone: 'bad' });
    expect(expenseDiff(0, $(50), 'GBP')).toEqual({ text: '£50 over', tone: 'bad' });
    expect(netDiff($(85), 0, 'EUR')).toEqual({ text: '€85 behind', tone: 'bad' });
    expect(netDiff(0, $(275))).toEqual({ text: '$275 ahead', tone: 'good' });
  });

  it('writes an offer and its payout in the currency', () => {
    const offer = toOffer(parseOffer('1K + 70% < 2250'));
    expect(describeOffer(offer, 'EUR')).toBe('€1,000 guarantee, plus 70% of the gross over €2,250.');
    expect(explainPayout(offer, $(2650), 'GBP')).toBe('70% of the £400 over £2,250 is £280, on top of the £1,000 guarantee.');
    expect(describeOffer(offer)).toBe('$1,000 guarantee, plus 70% of the gross over $2,250.');
  });
});

describe('a tour kept in euros', () => {
  it('has the same figures as the dollar tour, with no dollar sign in any line', () => {
    const dollarsRun = budget(seedTour());
    const euros = budget(euroRun());
    expect(euros.plan).toEqual(dollarsRun.plan);
    expect(euros.now).toEqual(dollarsRun.now);
    const words = [...euros.revenue, ...euros.expenses].map((l) => `${l.how} ${l.progress}`).join(' ');
    expect(words).not.toContain('$');
    expect(words).toContain('€');
    expect(euros.expenses.find((l) => l.kind === 'fuel')?.how).toBe('Route: 1,410 mi ÷ 15 mpg × €3.20');
    expect(euros.revenue.find((l) => l.kind === 'merch')?.how).toBe('€300 × 5 shows');
  });

  it('leaves the lines of a dollar tour as they were', () => {
    const b = budget(seedTour());
    expect(b.expenses.find((l) => l.kind === 'fuel')?.how).toBe('Route: 1,410 mi ÷ 15 mpg × $3.20');
    expect(lineDiff(b.revenue[0])).toEqual(lineDiff(b.revenue[0], 'USD'));
  });

  it('says what moved a date in euros', () => {
    const tour = euroRun();
    const causes = dateAgainstPlan(tour, tour.dates[0]).causes;
    expect(causes.length).toBeGreaterThan(0);
    for (const c of causes) expect(c.diff.text).toMatch(/€/);
  });
});

describe('changing the currency of a tour', () => {
  it('changes the symbol and converts nothing', () => {
    const tour = seedTour();
    const before = budget(tour);
    setCurrency(tour, 'GBP');
    expect(tour.currency).toBe('GBP');
    expect(budget(tour).plan).toEqual(before.plan);
    expect(tour.vehicle.dailyRate).toBe($(120));
  });

  it('leaves no field behind when it goes back to dollars', () => {
    const tour = seedTour();
    setCurrency(tour, 'EUR');
    setCurrency(tour, 'USD');
    expect('currency' in tour).toBe(false);
    expect(tour).toEqual(seedTour());
  });
});

describe('a new tour and its currency', () => {
  it('is in dollars, with no currency field, unless one is chosen', () => {
    expect('currency' in blankTour('t1', 'Summer run')).toBe(false);
    expect('currency' in blankTour('t1', 'Summer run', '', undefined, undefined, { currency: 'USD' })).toBe(false);
    expect(blankTour('t1', 'Europe run', '', undefined, undefined, { currency: 'EUR' }).currency).toBe('EUR');
  });

  it('is in the currency of the last tour until another is chosen', () => {
    const carried = carryOver([lastTour('EUR')]);
    expect(carried?.currency).toBe('EUR');
    expect(blankTour('t2', 'Next', '', undefined, carried).currency).toBe('EUR');
    expect('currency' in blankTour('t2', 'Next', '', undefined, carried, { currency: 'USD' })).toBe(false);
  });

  it('brings over money and van figures from a tour in the same currency', () => {
    const next = blankTour('t2', 'Europe again', '', undefined, carryOver([lastTour('EUR')]), { currency: 'EUR' });
    expect(next.vehicle.dailyRate).toBe($(140));
    expect(next.fuel.mpg).toBe(18);
    expect(next.merchPerShowDefault).toBe($(200));
    expect(next.lodgingPerNightDefault).toBe($(180));
    expect(next.perDiem).toBe($(25));
  });

  it('brings over only who travels and who takes a cut from a tour in another currency', () => {
    const next = blankTour('t2', 'Europe run', '', undefined, carryOver([lastTour()]), { currency: 'EUR' });
    expect(next.vehicle.dailyRate).toBeUndefined();
    expect(next.fuel.mpg).toBeUndefined();
    expect(next.merchPerShowDefault).toBeUndefined();
    expect(next.lodgingPerNightDefault).toBeUndefined();
    expect(next.perDiem).toBeUndefined();
    expect(next).toMatchObject({ people: 5, lodgingRooms: 3, merchCostRate: 0.3, splitBetween: 4, ratesFrom: 'Winter run' });
    expect(next.commissions).toEqual([{ id: 'agent', name: 'Agent', rate: 0.1, base: 'show' }]);
  });
});

describe('a saved tour and its currency', () => {
  it('is read back in the currency it was saved in', () => {
    const read = readSaved(backupOf([euroRun(), seedTour()]));
    expect(read?.complete).toBe(true);
    expect(read?.data.tours.map((t) => t.currency)).toEqual(['EUR', undefined]);
  });

  it('is refused when its currency is not one the app knows', () => {
    expect(isTour({ ...seedTour(), currency: 'EUR' })).toBe(true);
    expect(isTour({ ...seedTour(), currency: 'XBT' })).toBe(false);
    expect(isTour({ ...seedTour(), currency: 978 })).toBe(false);
  });
});
