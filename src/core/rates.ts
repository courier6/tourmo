// The figures a tour's plan is worked out from, and where each one comes from.
//
// A rate the band typed is used as it is. A rate left empty is estimated from
// the tour itself: van days from its dates, gas from the states it drives
// through, lodging from the cities it sleeps in. The outside figures come
// from src/data/estimates.json, which `npm run estimates` refreshes.

import bundled from '../data/estimates.json';
import { daysBetween, formatMonth, formatRange, sameCity } from './dates';
import { dollars, formatMoney } from './money';
import { legs } from './route';
import type { EstimatedRate, Money, Tour, TourDate } from './types';

export interface Estimates {
  gas: {
    asOf: string; // the week the prices are for, as an ISO date
    source: string;
    us: number; // dollars a gallon
    regions: Record<string, number>; // by EIA region code
    states: Record<string, number>; // the few states the EIA reports on their own
  };
  lodging: {
    fiscalYear: number;
    source: string;
    standard: number; // dollars a room, a night, wherever no area has its own rate
    areas: { name: string; state: string; counties: string; months: number[] }[];
  };
  van: {
    asOf: string; // "2026-08"
    source: string;
    dailyRate: number;
    mpg: number;
  };
}

/** The figures saved with the app, used until fresher ones arrive. */
export const ESTIMATES: Estimates = bundled;

let current: Estimates = bundled;

/** The figures in use: the freshest the app has been given. */
export const currentEstimates = (): Estimates => current;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether figures from outside (the lookup server, or a saved copy) have every part the estimates read. */
export function isEstimates(v: unknown): v is Estimates {
  if (!isRecord(v) || !isRecord(v.gas) || !isRecord(v.lodging) || !isRecord(v.van)) return false;
  const { gas, lodging, van } = v;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(String(gas.asOf)) &&
    isNumber(gas.us) &&
    gas.us > 0 &&
    isRecord(gas.regions) &&
    Object.values(gas.regions).every(isNumber) &&
    isRecord(gas.states) &&
    Object.values(gas.states).every(isNumber) &&
    isNumber(lodging.fiscalYear) &&
    isNumber(lodging.standard) &&
    lodging.standard > 0 &&
    Array.isArray(lodging.areas) &&
    lodging.areas.every((a) => isRecord(a) && typeof a.name === 'string' && typeof a.state === 'string' && Array.isArray(a.months) && a.months.length === 12 && a.months.every(isNumber)) &&
    /^\d{4}-\d{2}$/.test(String(van.asOf)) &&
    isNumber(van.dailyRate) &&
    isNumber(van.mpg) &&
    van.mpg > 0
  );
}

/** Switches to fresher figures. Refused, leaving things as they are, when they are not complete. */
export function setFigures(next: unknown): boolean {
  if (!isEstimates(next)) return false;
  current = next;
  return true;
}

/** Back to the figures saved with the app. */
export function resetFigures(): void {
  current = bundled;
}

/** A new tour is planned for this many people until the band says otherwise. */
export const DEFAULT_PEOPLE = 4;

/** Dollars for one person's food for one day, until the band sets its own per diem. */
export const DEFAULT_PER_DIEM = 20;

/** The share of merch sales planned as its cost, until the band sets its own. */
export const DEFAULT_MERCH_COST = 0.4;

/** Everyone who travels: the figure behind the food plan and the rooms. */
export const peopleOn = (tour: Tour): number => tour.people ?? DEFAULT_PEOPLE;

/** Rooms a night: the band's own count, otherwise one for every two people. */
export const roomsFor = (tour: Tour): number => tour.lodgingRooms ?? Math.ceil(peopleOn(tour) / 2);

// ---------- gas, by where the tour drives ----------

// The EIA's regions (PADDs). California is reported on its own.
const REGIONS: Record<string, { states: string; name: string }> = {
  R1X: { states: 'CT ME MA NH RI VT', name: 'New England' },
  R1Y: { states: 'DE DC MD NJ NY PA', name: 'the Central Atlantic' },
  R1Z: { states: 'FL GA NC SC VA WV', name: 'the Lower Atlantic' },
  R20: { states: 'IL IN IA KS KY MI MN MO NE ND OH OK SD TN WI', name: 'the Midwest' },
  R30: { states: 'AL AR LA MS NM TX', name: 'the Gulf Coast' },
  R40: { states: 'CO ID MT UT WY', name: 'the Rocky Mountains' },
  R5XCA: { states: 'AK AZ HI NV OR WA', name: 'the West Coast' },
  R50: { states: 'CA', name: 'the West Coast' },
};

/** "Tulsa, OK" to "OK". Undefined when the city was not written with a state. */
export function stateOf(city: string): string | undefined {
  const state = /,\s*([A-Za-z]{2})\s*$/.exec(city)?.[1];
  return state?.toUpperCase();
}

/** Dollars a gallon for regular in a state: its own figure, else its region's, else the U.S. average. */
export function gasPriceIn(state: string | undefined, data: Estimates = current): number {
  if (!state) return data.gas.us;
  const own = data.gas.states[state];
  if (own !== undefined) return own;
  const region = Object.keys(REGIONS).find((code) => REGIONS[code].states.split(' ').includes(state));
  return (region && data.gas.regions[region]) || data.gas.us;
}

const roundUp = (amount: number, step: number) => Math.ceil(amount / step - 1e-9) * step;
const listed = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const week = (data: Estimates) => formatRange(data.gas.asOf, data.gas.asOf);

/**
 * The gas price for a tour: each drive is priced at the dearer of its two
 * ends, the drives are averaged by their miles, and the result is rounded up
 * to the next 5 cents. So a tour that crosses California is planned higher
 * than one that stays in Texas, and the plan errs high rather than low.
 */
function gasEstimate(tour: Tour, data: Estimates): { value: Money; basis: string } {
  const drives = legs(tour).filter((l) => l.miles > 0);
  const miles = drives.reduce((total, l) => total + l.miles, 0);
  const states = [...new Set(drives.flatMap((l) => [stateOf(l.from), stateOf(l.to)]).filter((s): s is string => s !== undefined))];
  const home = stateOf(tour.homeCity);
  const average = miles
    ? drives.reduce((total, l) => total + Math.max(gasPriceIn(stateOf(l.from), data), gasPriceIn(stateOf(l.to), data)) * l.miles, 0) / miles
    : gasPriceIn(home, data);
  const where = miles && states.length ? (states.length > 5 ? `the ${states.length} states on this route` : listed(states)) : (home ?? 'the U.S.');
  return { value: roundUp(average * 100, 5), basis: `regular gas in ${where}, week of ${week(data)}, rounded up` };
}

// ---------- lodging, by where the tour sleeps ----------

/** Dollars for one room for one night: the area's rate for that month, else the standard rate. */
export function roomRate(area: string | undefined, state: string | undefined, isoDate: string, data: Estimates = current): number {
  const month = Number(isoDate.slice(5, 7)) - 1;
  const found = area === undefined ? undefined : data.lodging.areas.find((a) => a.name === area && a.state === state);
  return found?.months[month] ?? data.lodging.standard;
}

/** Rooms a night, times the room rate averaged over the nights away from home, rounded up to $5. */
function lodgingEstimate(tour: Tour, data: Estimates): { value: Money; basis: string } {
  const rooms = roomsFor(tour);
  const nights = tour.dates.filter((d) => !sameCity(d.city, tour.homeCity));
  const rates = nights.map((d) => roomRate(d.place?.area, stateOf(d.city), d.date, data));
  const room = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : data.lodging.standard;
  const over = rates.length ? `averaged over ${rates.length === 1 ? 'the night' : `the ${rates.length} nights`} away` : 'the standard rate';
  return {
    value: dollars(roundUp(room * rooms, 5)),
    basis: `${rooms} ${rooms === 1 ? 'room' : 'rooms'} at about ${formatMoney(dollars(Math.round(room)))} each, the federal lodging rate ${over}`,
  };
}

/**
 * The lodging plan for one night. A figure the band typed applies to every
 * night away. Otherwise each night is estimated for its own city and month,
 * so a night in New York is planned dearer than a night in Tulsa. A night in
 * the home city costs nothing.
 */
export function lodgingFor(tour: Tour, date: Pick<TourDate, 'city' | 'place' | 'date'>, data: Estimates = current): Money {
  if (sameCity(date.city, tour.homeCity)) return 0;
  const own = tour.lodgingPerNightDefault !== undefined && !(tour.estimated ?? []).includes('lodgingPerNight');
  if (own) return tour.lodgingPerNightDefault ?? 0;
  const rooms = roomsFor(tour);
  return dollars(roundUp(roomRate(date.place?.area, stateOf(date.city), date.date, data) * rooms, 5));
}

// ---------- van ----------

/** Van days for the dates entered so far: every day out, plus one to take it back. */
export function suggestedVanDays(tour: Tour): number {
  const first = tour.dates[0];
  const last = tour.dates.at(-1);
  if (!first || !last) return 0;
  return daysBetween(first.date, last.date) + 2;
}

/** Days fed on the road: the first date to the last, both counted. */
export function tourDays(tour: Tour): number {
  const first = tour.dates[0];
  const last = tour.dates.at(-1);
  return first && last ? daysBetween(first.date, last.date) + 1 : 0;
}

// ---------- every rate, typed or estimated ----------

export interface Rate {
  /** The figure the plan uses. */
  value: number;
  /** True when the tour holds a figure. False when the estimate is being used live. */
  typed: boolean;
  /** True when the plan's figure is an estimate: used live, or kept from when the tour was set up. */
  estimated: boolean;
  /** What the estimate is today, whether or not it is the one in use. */
  estimate: number;
  /** Where the estimate comes from, in plain words. */
  basis: string;
}

export interface TourRates {
  vanDailyRate: Rate; // cents
  vanDays: Rate;
  mpg: Rate;
  gasPrice: Rate; // cents
  merchPerShow: Rate; // cents
  lodgingPerNight: Rate; // cents
  /** Rooms a night behind the lodging estimate. */
  rooms: number;
  /** Food for one person for one day. */
  perDiem: Rate; // cents
  /** Everyone who travels. */
  people: number;
  /** The share of merch sales that is its cost: 0.40 = 40%. */
  merchCost: Rate;
}

export function tourRates(tour: Tour, data: Estimates = current): TourRates {
  const kept = tour.estimated ?? [];
  const rate = (typed: number | undefined, key: EstimatedRate | undefined, estimate: number, basis: string): Rate => ({
    value: typed ?? estimate,
    typed: typed !== undefined,
    estimated: typed === undefined ? true : key !== undefined && kept.includes(key),
    estimate,
    basis,
  });

  const first = tour.dates[0];
  const last = tour.dates.at(-1);
  const gas = gasEstimate(tour, data);
  const lodging = lodgingEstimate(tour, data);

  const days = rate(tour.vehicle.days, undefined, suggestedVanDays(tour), first && last ? `${formatRange(first.date, last.date)}, plus a day to take it back` : 'no dates yet');
  days.estimated = false; // worked out from the dates, not a guess

  const merch = rate(tour.merchPerShowDefault, undefined, 0, 'nothing to go on yet, so merch is left out of the plan');
  merch.estimated = false; // left out, not guessed

  return {
    vanDailyRate: rate(tour.vehicle.dailyRate, 'vanDailyRate', dollars(data.van.dailyRate), `the upper end of average passenger-van listings before tax, ${formatMonth(data.van.asOf)}`),
    vanDays: days,
    mpg: rate(tour.fuel.mpg, 'mpg', data.van.mpg, 'a loaded gasoline passenger van'),
    gasPrice: rate(tour.fuel.pricePerGallon, 'gasPrice', gas.value, gas.basis),
    merchPerShow: merch,
    lodgingPerNight: rate(tour.lodgingPerNightDefault, 'lodgingPerNight', lodging.value, lodging.basis),
    rooms: roomsFor(tour),
    perDiem: rate(tour.perDiem, 'perDiem', dollars(DEFAULT_PER_DIEM), 'a common per diem on a van tour'),
    people: peopleOn(tour),
    merchCost: rate(tour.merchCostRate, 'merchCost', DEFAULT_MERCH_COST, 'about what the goods and card fees take of a sale; add any venue cut'),
  };
}

const KEPT: [EstimatedRate, (r: TourRates) => Rate, (tour: Tour, value: number) => void][] = [
  ['vanDailyRate', (r) => r.vanDailyRate, (t, v) => (t.vehicle.dailyRate = v)],
  ['mpg', (r) => r.mpg, (t, v) => (t.fuel.mpg = v)],
  ['gasPrice', (r) => r.gasPrice, (t, v) => (t.fuel.pricePerGallon = v)],
  ['lodgingPerNight', (r) => r.lodgingPerNight, (t, v) => (t.lodgingPerNightDefault = v)],
  ['perDiem', (r) => r.perDiem, (t, v) => (t.perDiem = v)],
  ['merchCost', (r) => r.merchCost, (t, v) => (t.merchCostRate = v)],
];

/**
 * Writes today's estimates into the tour, for every outside figure still left
 * empty, and remembers which ones they were. Done when a tour's setup ends,
 * so its plan does not move when the estimates are refreshed later. Van days
 * stay worked out from the dates. Changes the tour passed in.
 */
export function keepEstimates(tour: Tour, data: Estimates = current): void {
  const rates = tourRates(tour, data);
  const kept = new Set(tour.estimated ?? []);
  for (const [key, read, write] of KEPT) {
    const r = read(rates);
    if (r.typed) continue;
    write(tour, r.estimate);
    kept.add(key);
  }
  if (tour.merchPerShowDefault === undefined) tour.merchPerShowDefault = 0;
  tour.estimated = [...kept];
}
