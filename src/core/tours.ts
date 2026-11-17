// Starting a tour from nothing, and placing a tour in time for the tour list.

import { keepEstimates, lodgingFor, tourRates } from './rates';
import { SAMPLE_TOUR_IDS } from './seed';
import { showDates, tourSpan } from './calc';
import type { Commission, EstimatedRate, Money, Place, Tour, TourDate } from './types';

/** What a new tour starts with, taken from the band's own latest tour. */
export interface CarryOver {
  /** The tour the figures were taken from. */
  from: string;
  commissions: Commission[];
  dailyRate?: Money;
  mpg?: number;
  merchPerShow?: Money;
  lodgingPerNight?: Money;
  lodgingRooms?: number;
}

/**
 * The band's own latest finished tour says more about its van, its cut to
 * agents and what it sells than any outside figure, so a new tour starts
 * from it. Sample tours do not count. Gas is left to be estimated afresh,
 * since prices move and the route is different; so are the van days.
 */
export function carryOver(tours: Tour[]): CarryOver | undefined {
  const latest = tours
    .filter((t) => !SAMPLE_TOUR_IDS.includes(t.id) && !t.setup)
    .sort((a, b) => (a.dates[0]?.date ?? '').localeCompare(b.dates[0]?.date ?? ''))
    .at(-1);
  if (!latest) return undefined;
  const own = (key: EstimatedRate, value: number | undefined) => (latest.estimated?.includes(key) ? undefined : value);
  // What merch really brought in beats what was planned.
  const sold = showDates(latest).flatMap((d) => (d.merch.actual === undefined ? [] : [d.merch.actual]));
  const merch = sold.length ? Math.round(sold.reduce((a, b) => a + b, 0) / sold.length / 500) * 500 : latest.merchPerShowDefault;
  return {
    from: latest.name,
    commissions: structuredClone(latest.commissions),
    dailyRate: own('vanDailyRate', latest.vehicle.dailyRate),
    mpg: own('mpg', latest.fuel.mpg),
    merchPerShow: merch || undefined,
    lodgingPerNight: own('lodgingPerNight', latest.lodgingPerNightDefault),
    lodgingRooms: latest.lodgingRooms,
  };
}

/** A tour with a name and nothing else, at the first step after naming. */
export function blankTour(id: string, name: string, homeCity = '', homePlace?: Place, carried?: CarryOver): Tour {
  return {
    id,
    name,
    homeCity,
    ...(homePlace ? { homePlace } : {}),
    commissions: carried?.commissions ?? [],
    vehicle: { dailyRate: carried?.dailyRate },
    fuel: { mpg: carried?.mpg },
    merchPerShowDefault: carried?.merchPerShow,
    lodgingPerNightDefault: carried?.lodgingPerNight,
    lodgingRooms: carried?.lodgingRooms,
    ratesFrom: carried?.from,
    dates: [],
    lines: [],
    setup: 'dates',
  };
}

/**
 * Ends setup. Today's estimates are written into the tour, so its plan stays
 * put when the estimates are refreshed later. The dates were entered before
 * the rates, so each date's plan is filled in here: merch on show days, and
 * lodging on every night away from the home city, estimated for that city
 * unless the band set a figure. Changes the tour passed in.
 */
export function finishSetup(tour: Tour): void {
  keepEstimates(tour);
  const rates = tourRates(tour);
  for (const d of tour.dates) {
    d.merch.plan = d.kind === 'show' ? rates.merchPerShow.value : 0;
    d.lodging.plan = lodgingFor(tour, d);
  }
  delete tour.setup;
}

export type TourPhase = 'setup' | 'upcoming' | 'underway' | 'past';

/** Where a tour sits against today. A tour with no dates yet counts as upcoming. */
export function tourPhase(tour: Tour, today: string): TourPhase {
  if (tour.setup) return 'setup';
  const span = tourSpan(tour);
  if (!span || today < span.start) return 'upcoming';
  return today > span.end ? 'past' : 'underway';
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isMoney = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isOptionalMoney = (v: unknown) => v === undefined || isMoney(v);
const isPlanActual = (v: unknown) => isObject(v) && isMoney(v.plan) && isOptionalMoney(v.actual);

function isTourDate(v: unknown): v is TourDate {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.date === 'string' &&
    typeof v.city === 'string' &&
    (v.kind === 'show' || v.kind === 'off' || v.kind === 'travel') &&
    isPlanActual(v.merch) &&
    isPlanActual(v.lodging) &&
    Array.isArray(v.fuelFillUps) &&
    v.fuelFillUps.every(isMoney) &&
    Array.isArray(v.lines) &&
    typeof v.settled === 'boolean'
  );
}

/**
 * Whether saved data has every part of a tour the screens read. Data saved by
 * an older or newer version, or edited by hand, is checked with this before
 * it is shown.
 */
export function isTour(v: unknown): v is Tour {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.homeCity === 'string' &&
    Array.isArray(v.commissions) &&
    isObject(v.vehicle) &&
    isOptionalMoney(v.vehicle.dailyRate) &&
    isOptionalMoney(v.vehicle.days) &&
    isObject(v.fuel) &&
    isOptionalMoney(v.fuel.mpg) &&
    isOptionalMoney(v.fuel.pricePerGallon) &&
    isOptionalMoney(v.merchPerShowDefault) &&
    isOptionalMoney(v.lodgingPerNightDefault) &&
    Array.isArray(v.lines) &&
    Array.isArray(v.dates) &&
    v.dates.every(isTourDate)
  );
}
