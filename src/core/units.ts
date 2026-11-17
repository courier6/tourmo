// Miles and gallons, or kilometres and litres.
//
// A tour's distances, mileage and fuel price are always stored in miles,
// miles per gallon and cents per gallon. Every estimate, road lookup and
// kept drive is in those already, tours saved before there was a choice
// need nothing done to them, and a tour can change units without a figure
// moving. The tour's units only decide what is typed and shown; this module
// converts at that edge.

import type { Money, Units } from './types';

export const KM_PER_MILE = 1.609344;
export const LITRES_PER_GALLON = 3.785411784;
/** Miles per gallon times litres per 100 km is always this. */
const MPG_TIMES_L100 = (100 * LITRES_PER_GALLON) / KM_PER_MILE;

/** The units a tour is shown in. A tour saved before there was a choice is in miles. */
export const unitsOf = (tour: { units?: Units }): Units => tour.units ?? 'us';

/** The words for each choice. `mileage` names the figure a driver knows their van by. */
export const UNIT_WORDS: Record<Units, { distance: string; distances: string; Distances: string; volume: string; mileage: string; label: string }> = {
  us: { distance: 'mi', distances: 'miles', Distances: 'Miles', volume: 'gallon', mileage: 'mpg', label: 'Miles and gallons' },
  metric: { distance: 'km', distances: 'kilometres', Distances: 'Kilometres', volume: 'litre', mileage: 'L/100 km', label: 'Kilometres and litres' },
};

/** Both choices with their labels, for a select. */
export const UNITS_OPTIONS = (Object.keys(UNIT_WORDS) as Units[]).map((u): [Units, string] => [u, UNIT_WORDS[u].label]);

/**
 * A converted figure, steadied to six decimals: 350 km stored as miles comes
 * back as 350, not 350.00000000000006, so a field does not rewrite what is
 * being typed into it.
 */
const steady = (n: number) => Math.round(n * 1e6) / 1e6;

/** Stored miles as the figure a field shows. */
export const distanceIn = (miles: number, units: Units): number => (units === 'metric' ? steady(miles * KM_PER_MILE) : miles);

/** A typed distance as the miles that are stored. */
export const milesFrom = (typed: number, units: Units): number => (units === 'metric' ? typed / KM_PER_MILE : typed);

/** "1,240" miles as they are, or "1,996" whole kilometres. */
export const distanceNumber = (miles: number, units: Units = 'us'): string => (units === 'metric' ? Math.round(miles * KM_PER_MILE) : miles).toLocaleString('en-US');

/** "1,240 mi" or "1,996 km". */
export const formatDistance = (miles: number, units: Units = 'us'): string => `${distanceNumber(miles, units)} ${UNIT_WORDS[units].distance}`;

/**
 * Stored miles per gallon as the figure a field shows: the same, or litres
 * per 100 km. 0 is 0 either way: a van planned to use no fuel.
 */
export const mileageIn = (mpg: number, units: Units): number => (units === 'metric' ? (mpg > 0 ? steady(MPG_TIMES_L100 / mpg) : 0) : mpg);

/** A typed mileage as the miles per gallon that are stored. Never infinite: 0 L/100 km is 0 mpg. */
export const mpgFrom = (typed: number, units: Units): number => (units === 'metric' ? (typed > 0 ? MPG_TIMES_L100 / typed : 0) : typed);

/** "15 mpg" or "15.7 L/100 km", litres to one decimal. */
export const formatMileage = (mpg: number, units: Units = 'us'): string =>
  `${(units === 'metric' ? Math.round(mileageIn(mpg, units) * 10) / 10 : mpg).toLocaleString('en-US')} ${UNIT_WORDS[units].mileage}`;

/** A stored price per gallon as the price a field shows: the same, or whole cents a litre. */
export const fuelPriceIn = (centsPerGallon: Money, units: Units): Money => (units === 'metric' ? Math.round(centsPerGallon / LITRES_PER_GALLON) : centsPerGallon);

/**
 * A typed fuel price as the cents per gallon that are stored. A price per
 * litre is kept unrounded, so the plan comes to exactly kilometres × litres
 * per 100 km × the price per litre.
 */
export const perGallonFrom = (cents: Money, units: Units): Money => (units === 'metric' ? cents * LITRES_PER_GALLON : cents);
