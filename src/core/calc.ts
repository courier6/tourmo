// Every number the screens show comes from this module. It has no UI or
// storage dependencies; calc.test.ts checks it against the handoff's worked
// example.

import { addDays, cityName, daysBetween } from './dates';
import { floorToDollar, formatMoney, formatNumber, formatPercent, percentOf, roundToDollar } from './money';
import { guaranteedMinimum, payout } from './payout';
import { tourDays, tourRates } from './rates';
import { legInto, routeMiles, unknownLegs } from './route';
import type { Commission, ExtraLine, Money, Tour, TourDate } from './types';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- per-date amounts ----------

export const showDates = (tour: Tour) => tour.dates.filter((d) => d.kind === 'show');

export function showPlan(date: TourDate): Money {
  return date.kind === 'show' && date.offer ? guaranteedMinimum(date.offer) : 0;
}

/** The show payout once it is known, otherwise undefined. */
export function showActual(date: TourDate): Money | undefined {
  if (date.kind !== 'show') return undefined;
  if (date.showActualOverride !== undefined) return date.showActualOverride;
  if (!date.offer) return undefined;
  if (date.boxOffice !== undefined) return payout(date.offer, date.boxOffice);
  // A flat deal needs no box office figure: once settled it paid the guarantee.
  if (date.offer.type === 'flat' && date.settled) return date.offer.guarantee;
  return undefined;
}

/**
 * True for a show ticked settled whose payout is still not known: it has no
 * offer, or its deal needs the box office and none was entered, and no amount
 * paid was typed in its place. Such a show goes on counting at its plan, so
 * the screens say that the figure is missing.
 */
export function settledWithoutPayout(date: TourDate): boolean {
  return date.kind === 'show' && date.settled && showActual(date) === undefined;
}

export const fuelOnDate = (date: TourDate): Money => sum(date.fuelFillUps);

const track = (plan: Money, actual: Money | undefined) => actual ?? plan;

/** Tour-wide lines: the larger of plan and actual so far; the actual once final. */
function trackTourWide(plan: Money, actual: Money | undefined, final: boolean | undefined): Money {
  if (final && actual !== undefined) return actual;
  return Math.max(plan, actual ?? 0);
}

// ---------- route and fuel ----------

export function fuelPlan(tour: Tour): Money {
  const { mpg, gasPrice } = tourRates(tour);
  if (mpg.value <= 0) return 0;
  return roundToDollar((routeMiles(tour) / mpg.value) * gasPrice.value);
}

export const fuelSpent = (tour: Tour): Money => sum(tour.dates.map(fuelOnDate));

/** What the drive into a date should cost in fuel, for a figure to buy against. 0 when there is no drive. */
export function fuelForDrive(tour: Tour, date: TourDate): { miles: number; cost: Money } {
  const { mpg, gasPrice } = tourRates(tour);
  const miles = legInto(tour, date).miles;
  return { miles, cost: mpg.value > 0 ? roundToDollar((miles / mpg.value) * gasPrice.value) : 0 };
}

// ---------- food ----------

/** Everyone who travels, fed every day from the first date to the last. */
export function foodPlan(tour: Tour): Money {
  const { perDiem, people } = tourRates(tour);
  return roundToDollar(perDiem.value * people * tourDays(tour));
}

export const foodSpent = (tour: Tour): Money => sum(tour.dates.map((d) => d.food ?? 0));

// ---------- commissions ----------

function commissionBase(c: Commission, show: Money, merch: Money): Money {
  return c.base === 'show+merch' ? show + merch : show;
}

export const commissionLabel = (c: Commission) => `${c.name}, ${formatPercent(c.rate)}`;

/** A commission on one show: its plan, and what it comes to on the figures so far. */
function commissionOnDate(c: Commission, date: TourDate): { plan: Money; now: Money } {
  const plan = showPlan(date);
  return {
    plan: percentOf(c.rate, commissionBase(c, plan, date.merch.plan)),
    now: percentOf(c.rate, commissionBase(c, track(plan, showActual(date)), track(date.merch.plan, date.merch.actual))),
  };
}

// ---------- merch costs ----------

/**
 * What a date's merch costs the band: a share of what it sells, covering the
 * goods, card fees and any venue cut. It follows the sales, as a commission
 * follows the payout, and is rounded date by date for the same reason.
 */
function merchCostOnDate(rate: number, date: TourDate): { plan: Money; now: Money } {
  if (date.kind !== 'show') return { plan: 0, now: 0 };
  return { plan: percentOf(rate, date.merch.plan), now: percentOf(rate, track(date.merch.plan, date.merch.actual)) };
}

// ---------- the budget: one list of lines, each with plan and now ----------

export type LineKind = 'shows' | 'merch' | 'additional' | 'commission' | 'merchCost' | 'vehicle' | 'fuel' | 'lodging' | 'food' | 'extra' | 'dateExtras';

export interface BudgetLine {
  id: string;
  kind: LineKind;
  label: string;
  direction: 'in' | 'out';
  plan: Money;
  now: Money;
  /** How the plan amount was worked out. */
  how: string;
  /** Where the line stands mid-tour. */
  progress: string;
}

export interface Totals {
  revenue: Money;
  expenses: Money;
  net: Money;
}

export interface Budget {
  revenue: BudgetLine[];
  expenses: BudgetLine[];
  plan: Totals;
  now: Totals;
  showCount: number;
  settledCount: number;
}

export function budget(tour: Tour): Budget {
  const rates = tourRates(tour);
  const shows = showDates(tour);
  const settledCount = shows.filter((d) => d.settled).length;

  // Revenue
  const planShows = sum(shows.map(showPlan));
  const nowShows = sum(shows.map((d) => track(showPlan(d), showActual(d))));

  // Merch belongs to show days. A date changed to an off day keeps what was
  // typed, in case it is changed back, but it no longer counts.
  const planMerch = sum(shows.map((d) => d.merch.plan));
  const nowMerch = sum(shows.map((d) => track(d.merch.plan, d.merch.actual)));
  const merchIn = shows.filter((d) => d.merch.actual !== undefined).length;
  const merchUniform = shows.length > 0 && shows.every((d) => d.merch.plan === rates.merchPerShow.value);

  // Income added on dates is one line. Tour-wide income, such as tour support
  // from a label, is a line of its own each, so it can be opened and changed.
  const dateIn = tour.dates.flatMap((d) => d.lines.filter((l) => l.direction === 'in').map((l) => ({ line: l, date: d })));
  const additional: BudgetLine[] = dateIn.length
    ? [
        {
          id: 'additional',
          kind: 'additional',
          label: 'Additional revenue',
          direction: 'in',
          plan: sum(dateIn.map((x) => x.line.plan)),
          now: sum(dateIn.map((x) => track(x.line.plan, x.line.actual))),
          how: dateIn.map((x) => `${x.line.label}, ${cityName(x.date.city)}`).join('; '),
          progress: `${dateIn.filter((x) => x.line.actual !== undefined).length} of ${dateIn.length} in`,
        },
      ]
    : [];
  const tourIn: BudgetLine[] = tour.lines
    .filter((l) => l.direction === 'in')
    .map((l) => ({
      id: `line:${l.id}`,
      kind: 'extra',
      label: l.label,
      direction: 'in',
      plan: l.plan,
      now: trackTourWide(l.plan, l.actual, l.final),
      how: 'Added by you',
      progress: l.actual === undefined ? 'Not received yet' : `${formatMoney(l.actual)} received${l.final ? ', final' : ' so far'}`,
    }));

  const revenue: BudgetLine[] = [
    {
      id: 'shows',
      kind: 'shows',
      label: 'Show guarantees',
      direction: 'in',
      plan: planShows,
      now: nowShows,
      how: shows.length ? `${plural(shows.length, 'show')} at guaranteed minimums` : 'No shows yet',
      progress: `${settledCount} of ${shows.length} settled`,
    },
    {
      id: 'merch',
      kind: 'merch',
      label: 'Merch',
      direction: 'in',
      plan: planMerch,
      now: nowMerch,
      how: merchUniform ? `${formatMoney(rates.merchPerShow.value)} × ${plural(shows.length, 'show')}` : plural(shows.length, 'show'),
      progress: `${merchIn} of ${plural(shows.length, 'show')} in`,
    },
    ...additional,
    ...tourIn,
  ];

  // Expenses
  // Each commission is rounded date by date and then added up, so the By date
  // differences always sum to the tour's difference.
  const commissions: BudgetLine[] = tour.commissions.map((c) => {
    const planBase = commissionBase(c, planShows, planMerch);
    const nowBase = commissionBase(c, nowShows, nowMerch);
    const of = c.base === 'show+merch' ? 'show and merch income' : 'show income';
    const perDate = shows.map((d) => commissionOnDate(c, d));
    return {
      id: `commission:${c.id}`,
      kind: 'commission',
      label: commissionLabel(c),
      direction: 'out',
      plan: sum(perDate.map((x) => x.plan)),
      now: sum(perDate.map((x) => x.now)),
      how: `${formatPercent(c.rate)} of ${formatMoney(planBase)} ${of}`,
      progress: `${formatPercent(c.rate)} of ${formatMoney(nowBase)}`,
    };
  });

  // A tour that plans no merch cost, or sells no merch, has no line for it.
  const costRate = rates.merchCost.value;
  const costs = shows.map((d) => merchCostOnDate(costRate, d));
  const merchCost: BudgetLine[] =
    costRate > 0 && (planMerch > 0 || nowMerch > 0)
      ? [
          {
            id: 'merchCost',
            kind: 'merchCost',
            label: `Merch costs, ${formatPercent(costRate)}`,
            direction: 'out',
            plan: sum(costs.map((x) => x.plan)),
            now: sum(costs.map((x) => x.now)),
            how: `${formatPercent(costRate)}${rates.merchCost.estimated ? ' (estimate)' : ''} of ${formatMoney(planMerch)} merch sales`,
            progress: `${formatPercent(costRate)} of ${formatMoney(nowMerch)}`,
          },
        ]
      : [];

  const v = tour.vehicle;
  const planVan = roundToDollar(rates.vanDailyRate.value * rates.vanDays.value);
  // A van that is not rented, with nothing paid for one, has no rental line.
  const vehicle: BudgetLine[] =
    planVan === 0 && v.actual === undefined
      ? []
      : [
          {
            id: 'vehicle',
            kind: 'vehicle',
            label: 'Van rental',
            direction: 'out',
            plan: planVan,
            now: trackTourWide(planVan, v.actual, v.final),
            how: `${formatMoney(rates.vanDailyRate.value)}${rates.vanDailyRate.estimated ? ' (estimate)' : ''} × ${plural(rates.vanDays.value, 'day')}`,
            progress: v.actual === undefined ? 'Not paid yet' : `${formatMoney(v.actual)} paid${v.final ? ', final' : ' so far'}`,
          },
        ];

  const planFuel = fuelPlan(tour);
  const spent = fuelSpent(tour);
  const fuel: BudgetLine = {
    id: 'fuel',
    kind: 'fuel',
    label: 'Fuel',
    direction: 'out',
    plan: planFuel,
    now: trackTourWide(planFuel, spent, tour.fuel.final),
    how:
      `Route: ${formatNumber(routeMiles(tour))} mi ÷ ${formatNumber(rates.mpg.value)} mpg × ${formatMoney(rates.gasPrice.value)}${rates.gasPrice.estimated ? ' (estimate)' : ''}` +
      (unknownLegs(tour) ? `. ${plural(unknownLegs(tour), 'drive')} not counted: miles not known` : ''),
    progress:
      spent > planFuel
        ? `${formatMoney(spent)} spent, ${formatMoney(spent - planFuel)} over`
        : `${formatMoney(spent)} spent, ${formatMoney(planFuel - spent)} left`,
  };

  const nights = tour.dates.filter((d) => d.lodging.plan > 0 || d.lodging.actual !== undefined);
  const nightsIn = nights.filter((d) => d.lodging.actual !== undefined).length;
  const plannedNights = tour.dates.filter((d) => d.lodging.plan > 0);
  const lodgingUniform = plannedNights.length > 0 && plannedNights.every((d) => d.lodging.plan === rates.lodgingPerNight.value);
  const lodging: BudgetLine = {
    id: 'lodging',
    kind: 'lodging',
    label: 'Lodging',
    direction: 'out',
    plan: sum(tour.dates.map((d) => d.lodging.plan)),
    now: sum(tour.dates.map((d) => track(d.lodging.plan, d.lodging.actual))),
    how: lodgingUniform
      ? `${formatMoney(rates.lodgingPerNight.value)}${rates.lodgingPerNight.estimated ? ' (estimate)' : ''} × ${plural(plannedNights.length, 'night')}`
      : plural(plannedNights.length, 'night') + (rates.lodgingPerNight.estimated && plannedNights.length ? ', each estimated for its city' : ''),
    progress: `${nightsIn} of ${plural(nights.length, 'night')} in`,
  };

  // Food is bought day by day against one figure for the tour, as fuel is.
  // A tour planned with no food figure and nothing spent has no food line.
  const planFood = foodPlan(tour);
  const eaten = foodSpent(tour);
  const days = tourDays(tour);
  const food: BudgetLine[] =
    planFood > 0 || eaten > 0
      ? [
          {
            id: 'food',
            kind: 'food',
            label: 'Food',
            direction: 'out',
            plan: planFood,
            now: trackTourWide(planFood, eaten, tour.foodFinal),
            how: `${formatMoney(rates.perDiem.value)}${rates.perDiem.estimated ? ' (estimate)' : ''} × ${rates.people} ${rates.people === 1 ? 'person' : 'people'} × ${plural(days, 'day')}`,
            progress: eaten > planFood ? `${formatMoney(eaten)} spent, ${formatMoney(eaten - planFood)} over` : `${formatMoney(eaten)} spent, ${formatMoney(planFood - eaten)} left`,
          },
        ]
      : [];

  const tourOut: BudgetLine[] = tour.lines
    .filter((l) => l.direction === 'out')
    .map((l) => ({
      id: `line:${l.id}`,
      kind: 'extra',
      label: l.label,
      direction: 'out',
      plan: l.plan,
      now: trackTourWide(l.plan, l.actual, l.final),
      how: 'Added by you',
      progress: l.actual === undefined ? 'Not paid yet' : `${formatMoney(l.actual)} paid${l.final ? ', final' : ' so far'}`,
    }));

  const dateOut = tour.dates.flatMap((d) => d.lines.filter((l) => l.direction === 'out'));
  const dateExtras: BudgetLine[] = dateOut.length
    ? [
        {
          id: 'dateExtras',
          kind: 'dateExtras',
          label: 'Expenses added on dates',
          direction: 'out',
          plan: sum(dateOut.map((l) => l.plan)),
          now: sum(dateOut.map((l) => track(l.plan, l.actual))),
          how: plural(dateOut.length, 'line'),
          progress: `${dateOut.filter((l) => l.actual !== undefined).length} of ${dateOut.length} in`,
        },
      ]
    : [];

  const expenses = [...commissions, ...merchCost, ...vehicle, fuel, lodging, ...food, ...tourOut, ...dateExtras];

  // Totals are sums of the rounded lines, so the screen always adds up.
  const totals = (pick: (l: BudgetLine) => Money): Totals => {
    const r = sum(revenue.map(pick));
    const e = sum(expenses.map(pick));
    return { revenue: r, expenses: e, net: r - e };
  };

  return {
    revenue,
    expenses,
    plan: totals((l) => l.plan),
    now: totals((l) => l.now),
    showCount: shows.length,
    settledCount,
  };
}

// ---------- differences from plan ----------

export type Tone = 'good' | 'bad' | 'flat';
export interface Diff {
  text: string;
  tone: Tone;
}

/** Revenue lines show a signed amount: +$280, −$35, on plan. */
export function revenueDiff(plan: Money, now: Money): Diff {
  const d = now - plan;
  if (d === 0) return { text: 'on plan', tone: 'flat' };
  return d > 0 ? { text: `+${formatMoney(d)}`, tone: 'good' } : { text: formatMoney(d), tone: 'bad' };
}

/** Expense lines show words: $50 over, $20 under, on plan. */
export function expenseDiff(plan: Money, now: Money): Diff {
  const d = now - plan;
  if (d === 0) return { text: 'on plan', tone: 'flat' };
  return d > 0 ? { text: `${formatMoney(d)} over`, tone: 'bad' } : { text: `${formatMoney(-d)} under`, tone: 'good' };
}

/** Net: $275 ahead, $85 behind, on plan. */
export function netDiff(plan: Money, now: Money): Diff {
  const d = now - plan;
  if (d === 0) return { text: 'on plan', tone: 'flat' };
  return d > 0 ? { text: `${formatMoney(d)} ahead`, tone: 'good' } : { text: `${formatMoney(-d)} behind`, tone: 'bad' };
}

export const lineDiff = (line: BudgetLine): Diff =>
  line.direction === 'in' ? revenueDiff(line.plan, line.now) : expenseDiff(line.plan, line.now);

// ---------- one date ----------

export interface DateCommission {
  id: string;
  label: string;
  plan: Money;
  actual?: Money;
}

/** Per-date commissions, worked out from that date's payout. */
export function dateCommissions(tour: Tour, date: TourDate): DateCommission[] {
  if (date.kind !== 'show') return [];
  const sActual = showActual(date);
  return tour.commissions.map((c) => {
    const { plan, now } = commissionOnDate(c, date);
    const entered = c.base === 'show+merch' ? sActual !== undefined || date.merch.actual !== undefined : sActual !== undefined;
    return { id: c.id, label: commissionLabel(c), plan, actual: entered ? now : undefined };
  });
}

/** A date's merch cost, worked out from what it sold. Undefined when the tour plans none. */
export function dateMerchCost(tour: Tour, date: TourDate): DateCommission | undefined {
  const rate = tourRates(tour).merchCost.value;
  if (date.kind !== 'show' || rate <= 0) return undefined;
  const { plan, now } = merchCostOnDate(rate, date);
  return { id: 'merchCost', label: `Merch costs, ${formatPercent(rate)}`, plan, actual: date.merch.actual === undefined ? undefined : now };
}

export interface Cause {
  label: string;
  direction: 'in' | 'out';
  /** actual − plan for that line. */
  change: Money;
  diff: Diff;
}

export interface DateResult {
  /** Positive = ahead of plan. Fuel and food are left out: they have no per-date plan. */
  vsPlan: Money;
  causes: Cause[];
  /** False until any actual is entered for the date. */
  hasActuals: boolean;
}

/**
 * One date against plan: the change in the date's revenue, minus the change
 * in its lodging, extras, commissions and merch costs. Only lines with an actual count.
 */
export function dateAgainstPlan(tour: Tour, date: TourDate): DateResult {
  const causes: Cause[] = [];
  let entered = 0;
  const add = (label: string, direction: 'in' | 'out', plan: Money, actual: Money | undefined) => {
    if (actual === undefined) return;
    entered += 1;
    const change = actual - plan;
    if (change === 0) return;
    causes.push({ label, direction, change, diff: direction === 'in' ? revenueDiff(plan, actual) : expenseDiff(plan, actual) });
  };

  if (date.kind === 'show') {
    add('Show', 'in', showPlan(date), showActual(date));
    add('Merch', 'in', date.merch.plan, date.merch.actual);
  }
  for (const l of date.lines.filter((x) => x.direction === 'in')) add(l.label, 'in', l.plan, l.actual);

  const comms = dateCommissions(tour, date);
  if (comms.some((c) => c.actual !== undefined)) {
    add('Commissions', 'out', sum(comms.map((c) => c.plan)), sum(comms.map((c) => c.actual ?? c.plan)));
    entered -= 1; // commissions follow the payout; they are not an entry of their own
  }
  const cost = dateMerchCost(tour, date);
  if (cost?.actual !== undefined) {
    add('Merch costs', 'out', cost.plan, cost.actual);
    entered -= 1; // they follow the merch sold; they are not an entry of their own
  }
  add('Lodging', 'out', date.lodging.plan, date.lodging.actual);
  for (const l of date.lines.filter((x) => x.direction === 'out')) add(l.label, 'out', l.plan, l.actual);

  const vsPlan = sum(causes.map((c) => (c.direction === 'in' ? c.change : -c.change)));
  return { vsPlan, causes, hasActuals: entered > 0 || date.fuelFillUps.length > 0 || date.food !== undefined };
}

export type DateStatus = 'settled' | 'tonight' | 'upcoming' | 'unsettled';

export function dateStatus(date: TourDate, today: string): DateStatus {
  if (date.settled) return 'settled';
  if (date.date === today) return 'tonight';
  return date.date > today ? 'upcoming' : 'unsettled';
}

export const STATUS_LABEL: Record<DateStatus, string> = {
  settled: 'Settled',
  tonight: 'Tonight',
  upcoming: 'Upcoming',
  unsettled: 'Not settled',
};

// ---------- safe to spend (from the whiteboard, not in the handoff doc) ----------

export interface SafeToSpend {
  /** Unplanned spending per day that still leaves the tour at break-even. */
  perDay: Money;
  daysLeft: number;
}

/** First date to the day the van goes back. */
export function tourSpan(tour: Tour): { start: string; end: string } | undefined {
  if (!tour.dates.length) return undefined;
  const start = tour.dates[0].date;
  const last = tour.dates[tour.dates.length - 1].date;
  const vanBack = addDays(start, Math.max(1, tourRates(tour).vanDays.value) - 1);
  return { start, end: vanBack > last ? vanBack : last };
}

/**
 * The tracking net spread over the days left. Undefined once the tour is
 * over, or when it is tracking to a loss and nothing is spare.
 */
export function safeToSpend(tour: Tour, today: string): SafeToSpend | undefined {
  const span = tourSpan(tour);
  if (!span || today > span.end) return undefined;
  const from = today > span.start ? today : span.start;
  const daysLeft = daysBetween(from, span.end) + 1;
  const net = budget(tour).now.net;
  if (net <= 0) return undefined;
  return { perDay: floorToDollar(net / daysLeft), daysLeft };
}

// ---------- small helpers the screens share ----------

/** A new extra line's id, also used for dates and commissions. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function findLine(tour: Tour, id: string): ExtraLine | undefined {
  return tour.lines.find((l) => l.id === id);
}
