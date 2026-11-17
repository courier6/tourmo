// Acceptance tests from the handoff doc: parse tests, payout tests and the
// "Spring run" worked example. Amounts in the tables are dollars.

import { describe, expect, it } from 'vitest';
import {
  budget,
  dateAgainstPlan,
  dateCommissions,
  dollars,
  examplePayouts,
  expenseDiff,
  fuelPlan,
  fuelSpent,
  guaranteedMinimum,
  lineDiff,
  netDiff,
  parseOffer,
  parseTyped,
  payout,
  percentOf,
  revenueDiff,
  roundToDollar,
  routeMiles,
  safeToSpend,
  seedTour,
  SHORTHAND_EXAMPLES,
  showActual,
  toOffer,
} from './index';

const $ = dollars;
const offer = (raw: string) => toOffer(parseOffer(raw));

describe('offer parser', () => {
  const cases: [string, string, number, number | undefined, number | undefined][] = [
    ['$1K + 70% < $2250', 'plus', 1000, 0.7, 2250],
    ['1k plus 70% after 2,250', 'plus', 1000, 0.7, 2250],
    ['$1K VS 70%', 'versus', 1000, 0.7, undefined],
    ['$1.2K vs 80%', 'versus', 1200, 0.8, undefined],
    ['$800 flat', 'flat', 800, undefined, undefined],
    ['1000', 'flat', 1000, undefined, undefined],
    ['80% of door', 'percentage', 0, 0.8, undefined],
  ];
  it.each(cases)('%s', (raw, type, guarantee, percentage, threshold) => {
    const p = parseOffer(raw);
    expect(p.ok).toBe(true);
    expect(p.type).toBe(type);
    expect(p.guarantee).toBe($(guarantee));
    expect(p.percentage).toBe(percentage);
    expect(p.threshold).toBe(threshold === undefined ? undefined : $(threshold));
    expect(p.raw).toBe(raw);
    expect(p.missing).toEqual([]);
  });

  it('defaults to gross and says so', () => {
    expect(parseOffer('$1K vs 70%')).toMatchObject({ basis: 'gross', basisAssumed: true });
    expect(parseOffer('$1K vs 70% of net')).toMatchObject({ basis: 'net', basisAssumed: false });
    expect(parseOffer('70% of gross')).toMatchObject({ basis: 'gross', basisAssumed: false });
  });

  it('reads the other ways net and gross are written', () => {
    const net = { ok: true, basis: 'net', basisAssumed: false };
    expect(parseOffer('$1,000 vs. 70% of NBOR')).toMatchObject({ ...net, type: 'versus', guarantee: $(1000), percentage: 0.7 });
    expect(parseOffer('$500 vs 85% of NBOR, whichever is greater')).toMatchObject({ ...net, type: 'versus', percentage: 0.85 });
    expect(parseOffer('85/15 after expenses')).toMatchObject({ ...net, type: 'percentage', percentage: 0.85 });
    expect(parseOffer('70% after costs')).toMatchObject({ ...net, type: 'percentage', percentage: 0.7 });
    expect(parseOffer('80% of door after the house nut')).toMatchObject({ ...net, type: 'percentage', percentage: 0.8 });
    expect(parseOffer('$1K vs 80% of GBOR')).toMatchObject({ ok: true, basis: 'gross', basisAssumed: false });
    // A figure after "after" is a threshold, not a word for net.
    expect(parseOffer('1k plus 70% after 2,250')).toMatchObject({ ok: true, type: 'plus', threshold: $(2250), basis: 'gross', basisAssumed: true });
    expect(parseOffer('70% after $300')).toMatchObject({ type: 'plus', threshold: $(300), basis: 'gross' });
  });

  it('reads other spellings', () => {
    expect(parseOffer('1,000 v 70%')).toMatchObject({ type: 'versus', guarantee: $(1000), percentage: 0.7 });
    expect(parseOffer('$1,000 versus 70%')).toMatchObject({ type: 'versus', guarantee: $(1000) });
    expect(parseOffer('1k + 70% over 2.25k')).toMatchObject({ type: 'plus', threshold: $(2250) });
    expect(parseOffer('1k + 70% above $2,250')).toMatchObject({ type: 'plus', threshold: $(2250) });
    expect(parseOffer('$800 guarantee')).toMatchObject({ type: 'flat', guarantee: $(800) });
  });

  it('shows a plus deal with no threshold as incomplete', () => {
    const p = parseOffer('$1K + 70%');
    expect(p).toMatchObject({ ok: true, type: 'plus', guarantee: $(1000), percentage: 0.7 });
    expect(p.threshold).toBeUndefined();
    expect(p.missing).toEqual(['threshold']);
  });

  it('reads splits and percentages written other ways', () => {
    expect(parseOffer('70/30')).toMatchObject({ ok: true, type: 'percentage', percentage: 0.7 });
    expect(parseOffer('70/30 split of door')).toMatchObject({ ok: true, type: 'percentage', percentage: 0.7 });
    expect(parseOffer('%80 of door')).toMatchObject({ ok: true, type: 'percentage', percentage: 0.8 });
    expect(parseOffer('80 pct of door')).toMatchObject({ ok: true, type: 'percentage', percentage: 0.8 });
    expect(parseOffer('$1.5 grand')).toMatchObject({ ok: true, type: 'flat', guarantee: $(1500) });
  });

  // Text that was not fully understood is never passed off as read: ok is
  // false, a doubt says why, and the fields hold the best guess.
  const doubted: [string, string, number, number | undefined, number | undefined][] = [
    ['Mar 7: $1K vs 70%', 'versus', 1000, 0.7, undefined],
    ['3/7 $1K vs 70%', 'versus', 1000, 0.7, undefined],
    ['doors 8pm, $800 flat', 'flat', 800, undefined, undefined],
    ['$1K vs 70% after $2,250 expenses', 'versus', 1000, 0.7, undefined],
    ['$1K vs 70% of net over $500', 'versus', 1000, 0.7, undefined],
    ['20% merch, $1K vs 70%', 'versus', 1000, 0.7, undefined],
    ['$1K + 70% over 225 tickets', 'plus', 1000, 0.7, 225],
    ['1,5k', 'flat', 5000, undefined, undefined],
    ['$800 k.c.', 'flat', 800, undefined, undefined],
  ];
  it.each(doubted)('doubts %s', (raw, type, guarantee, percentage, threshold) => {
    const p = parseOffer(raw);
    expect(p.ok).toBe(false);
    expect(p.doubts.length).toBeGreaterThan(0);
    expect(p.type).toBe(type);
    expect(p.guarantee).toBe($(guarantee));
    expect(p.percentage).toBe(percentage);
    expect(p.threshold).toBe(threshold === undefined ? undefined : $(threshold));
  });

  it('has no doubts about the forms it reads', () => {
    for (const raw of SHORTHAND_EXAMPLES) expect(parseOffer(raw)).toMatchObject({ ok: true, doubts: [] });
  });

  it('never blocks saving on a failed parse', () => {
    const p = parseOffer('door deal, tbd');
    expect(p.ok).toBe(false);
    expect(p.raw).toBe('door deal, tbd');
    const saved = toOffer(p);
    expect(saved).toMatchObject({ raw: 'door deal, tbd', type: 'flat', guarantee: 0 });
  });
});

describe('show payout', () => {
  const cases: [string, number, number][] = [
    ['$1K + 70% < $2250', 2000, 1000],
    ['$1K + 70% < $2250', 2250, 1000],
    ['$1K + 70% < $2250', 2650, 1280],
    ['$1K + 70% < $2250', 3000, 1525],
    ['$1K + 70% < $2250', 4000, 2225],
    ['$1K vs 70%', 1300, 1000],
    ['$1K vs 70%', 2000, 1400],
    ['$800 flat', 0, 800],
    ['$800 flat', 5000, 800],
    ['80% of door', 1500, 1200],
  ];
  it.each(cases)('%s at %d pays %d', (raw, basis, expected) => {
    expect(payout(offer(raw), $(basis))).toBe($(expected));
  });

  it('guaranteed minimums', () => {
    expect(guaranteedMinimum(offer('$1K + 70% < $2250'))).toBe($(1000));
    expect(guaranteedMinimum(offer('$1.2K vs 80%'))).toBe($(1200));
    expect(guaranteedMinimum(offer('$800 flat'))).toBe($(800));
    expect(guaranteedMinimum(offer('80% of door'))).toBe(0);
  });

  it('an override replaces the calculated payout', () => {
    const tour = seedTour();
    const dallas = { ...tour.dates[0], showActualOverride: $(1100) };
    expect(showActual(dallas)).toBe($(1100));
  });

  it('gives three example payouts', () => {
    const rows = examplePayouts(offer('$1K + 70% < $2250'));
    expect(rows).toHaveLength(3);
    expect(rows[0].payout).toBe($(1000));
    expect(rows[2].payout).toBeGreaterThan($(1000));
  });
});

describe('rounding', () => {
  it('rounds half up to whole dollars', () => {
    expect(roundToDollar(30080)).toBe($(301));
    expect(roundToDollar(30050)).toBe($(301));
    expect(roundToDollar(30049)).toBe($(300));
    expect(percentOf(0.7, $(1005))).toBe($(704)); // 703.50
    expect(percentOf(0.15, $(5280))).toBe($(792));
  });
});

describe('worked example: Spring run', () => {
  const tour = seedTour();
  const b = budget(tour);
  const line = (id: string) => [...b.revenue, ...b.expenses].find((l) => l.id === id)!;

  const expected: [string, number, number, string][] = [
    ['shows', 5000, 5280, '+$280'],
    ['merch', 1500, 1615, '+$115'],
    ['additional', 150, 150, 'on plan'],
    ['commission:agent', 500, 528, '$28 over'],
    ['commission:manager', 750, 792, '$42 over'],
    ['vehicle', 720, 720, 'on plan'],
    ['fuel', 301, 301, 'on plan'],
    ['lodging', 800, 850, '$50 over'],
    ['line:merch-cost', 400, 400, 'on plan'],
  ];
  it.each(expected)('%s: plan %d, now %d, %s', (id, plan, now, diff) => {
    const l = line(id);
    expect(l.plan).toBe($(plan));
    expect(l.now).toBe($(now));
    expect(lineDiff(l).text).toBe(diff);
  });

  it('totals', () => {
    expect(b.plan).toEqual({ revenue: $(6650), expenses: $(3471), net: $(3179) });
    expect(b.now).toEqual({ revenue: $(7045), expenses: $(3591), net: $(3454) });
    expect(revenueDiff(b.plan.revenue, b.now.revenue).text).toBe('+$395');
    expect(expenseDiff(b.plan.expenses, b.now.expenses).text).toBe('$120 over');
    expect(netDiff(b.plan.net, b.now.net).text).toBe('$275 ahead');
    expect(b.showCount).toBe(5);
    expect(b.settledCount).toBe(3);
  });

  it('the lines on screen add up to the totals on screen', () => {
    const add = (ls: { plan: number; now: number }[], k: 'plan' | 'now') => ls.reduce((a, l) => a + l[k], 0);
    expect(add(b.revenue, 'plan')).toBe(b.plan.revenue);
    expect(add(b.expenses, 'plan')).toBe(b.plan.expenses);
    expect(add(b.revenue, 'now')).toBe(b.now.revenue);
    expect(add(b.expenses, 'now')).toBe(b.now.expenses);
  });

  it('fuel', () => {
    expect(routeMiles(tour)).toBe(1410);
    expect(fuelPlan(tour)).toBe($(301)); // 300.80
    expect(fuelSpent(tour)).toBe($(165));
    expect(line('fuel').progress).toBe('$165 spent, $136 left');
    expect(line('fuel').how).toBe('Route: 1,410 mi ÷ 15 mpg × $3.20');
  });

  it('notes under the lines', () => {
    expect(line('shows').progress).toBe('3 of 5 settled');
    expect(line('lodging').progress).toBe('2 of 4 nights in');
    expect(line('vehicle').how).toBe('$120 × 6 days');
    expect(line('merch').how).toBe('$300 × 5 shows');
    expect(line('lodging').how).toBe('$200 × 4 nights');
  });

  it('Dallas is 320 ahead: show +280, merch +110, commissions 70 higher', () => {
    const r = dateAgainstPlan(tour, tour.dates[0]);
    expect(r.vsPlan).toBe($(320));
    expect(r.causes.map((c) => [c.label, c.change])).toEqual([
      ['Show', $(280)],
      ['Merch', $(110)],
      ['Commissions', $(70)],
    ]);
    expect(dateCommissions(tour, tour.dates[0]).map((c) => c.actual)).toEqual([$(128), $(192)]);
  });

  it('Oklahoma City is 85 behind: merch 35 under, lodging 50 over', () => {
    const r = dateAgainstPlan(tour, tour.dates[1]);
    expect(r.vsPlan).toBe($(-85));
    expect(r.causes.map((c) => [c.label, c.change])).toEqual([
      ['Merch', $(-35)],
      ['Lodging', $(50)],
    ]);
  });

  it('Wichita is 40 ahead: merch +40', () => {
    const r = dateAgainstPlan(tour, tour.dates[2]);
    expect(r.vsPlan).toBe($(40));
    expect(r.causes.map((c) => [c.label, c.change])).toEqual([['Merch', $(40)]]);
  });

  it('dates with nothing entered do not count', () => {
    expect(dateAgainstPlan(tour, tour.dates[3])).toMatchObject({ vsPlan: 0, hasActuals: false });
    expect(dateAgainstPlan(tour, tour.dates[4])).toMatchObject({ vsPlan: 0, hasActuals: false });
  });

  it('the date results sum to the tour-level difference', () => {
    const total = tour.dates.reduce((a, d) => a + dateAgainstPlan(tour, d).vsPlan, 0);
    expect(total).toBe($(275));
    expect(total).toBe(b.now.net - b.plan.net);
  });
});

describe('tracking rules', () => {
  it('an actual of 0 is not the same as no actual', () => {
    const tour = seedTour();
    tour.dates[3].merch.actual = 0;
    expect(budget(tour).revenue[1].now).toBe($(1615 - 300));
  });

  it('tour-wide lines hold the larger of plan and actual until final', () => {
    const tour = seedTour();
    const extra = tour.lines[0];
    extra.actual = $(250);
    expect(budget(tour).expenses.find((l) => l.id === 'line:merch-cost')!.now).toBe($(400));
    extra.final = true;
    expect(budget(tour).expenses.find((l) => l.id === 'line:merch-cost')!.now).toBe($(250));
    extra.actual = $(520);
    extra.final = false;
    expect(budget(tour).expenses.find((l) => l.id === 'line:merch-cost')!.now).toBe($(520));
  });

  it('fuel over budget pushes the tracking number up', () => {
    const tour = seedTour();
    tour.dates[3].fuelFillUps = [$(200)];
    const fuel = budget(tour).expenses.find((l) => l.id === 'fuel')!;
    expect(fuel.now).toBe($(365));
    expect(fuel.progress).toBe('$365 spent, $64 over');
  });

  it('commissions rise when a show beats its guarantee', () => {
    const tour = seedTour();
    tour.dates[3].boxOffice = $(2000); // 80% is 1,600, beats 1,200
    const b = budget(tour);
    expect(b.revenue[0].now).toBe($(5680));
    expect(b.expenses[0].now).toBe($(568));
  });

  it('a short plan reads as short', () => {
    const tour = seedTour();
    tour.lines.push({ id: 'x', label: 'Trailer', direction: 'out', plan: $(4000) });
    expect(budget(tour).plan.net).toBe($(-821));
  });
});

describe('figures that are not round', () => {
  it('the date results still sum to the tour-level difference', () => {
    const tour = seedTour();
    tour.commissions[1].base = 'show+merch';
    tour.dates[0].boxOffice = $(2651.4);
    tour.dates[1].merch.actual = $(263);
    tour.dates[3].showActualOverride = $(1203);
    tour.dates[4].showActualOverride = $(1003);
    const b = budget(tour);
    const byDate = tour.dates.reduce((total, d) => total + dateAgainstPlan(tour, d).vsPlan, 0);
    const tourWide = b.expenses.filter((l) => l.kind === 'fuel' || l.kind === 'vehicle' || l.kind === 'extra').reduce((total, l) => total + (l.now - l.plan), 0);
    expect(byDate - tourWide).toBe(b.now.net - b.plan.net);
  });

  it('a commission line is the sum of its dates', () => {
    const tour = seedTour();
    tour.dates[3].showActualOverride = $(1203);
    tour.dates[4].showActualOverride = $(1003);
    const agent = budget(tour).expenses[0];
    const perDate = tour.dates.map((d) => dateCommissions(tour, d)[0]);
    expect(agent.plan).toBe(perDate.reduce((total, c) => total + c.plan, 0));
    expect(agent.now).toBe(perDate.reduce((total, c) => total + (c.actual ?? c.plan), 0));
  });
});

describe('a show changed to an off day', () => {
  it('no longer counts its merch, in the plan or now', () => {
    const tour = seedTour();
    const before = budget(tour).revenue[1];
    tour.dates[2].kind = 'off'; // Wichita: merch plan 300, actual 340
    const merch = budget(tour).revenue[1];
    expect(merch.plan).toBe(before.plan - $(300));
    expect(merch.now).toBe(before.now - $(340));
    expect(merch.progress).toBe('2 of 4 shows in');
  });
});

describe('typed figures', () => {
  const cases: [string, number | undefined | 'invalid'][] = [
    ['', undefined],
    ['  ', undefined],
    ['$', undefined],
    ['1200', 1200],
    ['$1,200', 1200],
    ['1,200.50', 1200.5],
    ['1,234,567', 1234567],
    ['12.', 12],
    ['1,', 1],
    ['.5', 0.5],
    ['1.5k', 1500],
    ['3.459', 3.459],
    ['15%', 15],
    ['12,50', 12.5], // a decimal comma, as typed on phones set to other regions
    ['0,5', 0.5],
    ['1,2OO', 'invalid'], // letter O
    ['1,2345', 'invalid'],
    ['12,50,3', 'invalid'],
    ['1.200,50', 'invalid'],
    ['-5', 'invalid'],
    ['1e5', 'invalid'],
    ['k', 'invalid'],
    ['abc', 'invalid'],
  ];
  it.each(cases)('%j', (text, expected) => {
    expect(parseTyped(text)).toBe(expected);
  });
});

describe('safe to spend', () => {
  it('spreads the tracking net over the days left', () => {
    const tour = seedTour();
    // Mar 7, 8 and 9 are left; the van goes back on day 6. 3,454 / 3 = 1,151.33
    expect(safeToSpend(tour, '2027-03-07')).toEqual({ perDay: $(1151), daysLeft: 3 });
    expect(safeToSpend(tour, '2027-01-01')).toEqual({ perDay: $(575), daysLeft: 6 });
    expect(safeToSpend(tour, '2027-03-10')).toBeUndefined();
  });
});
