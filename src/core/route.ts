// The drives of a tour: home to the first date, date to date, and home again.
// Miles typed by hand are used as they are. Otherwise a drive is estimated
// from where the two cities are, when both were picked from the city list.

import { sameCity } from './dates';
import type { KeptDrive, Place, Tour, TourDate, Units } from './types';
import { formatDistance } from './units';

/**
 * Roads are longer than the straight line between two cities. Between cities
 * in the United States the drive is usually 5 to 20 percent longer; 1.15 sits
 * in the middle. It runs a little high on straight interstates and low through
 * mountains or around water, where typing the real miles is worth it.
 */
export const ROAD_FACTOR = 1.15;

const EARTH_RADIUS_MILES = 3958.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line miles between two places (great circle). */
export function straightMiles(a: Place, b: Place): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** Estimated driving miles, to the nearest 5. It is an estimate, not a route. */
export function drivingMiles(a: Place, b: Place): number {
  return Math.round((straightMiles(a, b) * ROAD_FACTOR) / 5) * 5;
}

// ---------- road miles that have been looked up ----------

/** A drive as a routing service gives it. */
export interface Road {
  miles: number;
  minutes: number;
}

const roads = new Map<string, Road>();
const roadKey = (a: Place, b: Place) => `${a.lat},${a.lon};${b.lat},${b.lon}`;

/** Keeps a looked-up drive, so it is used in place of the estimate from now on. */
export function rememberRoad(from: Place, to: Place, road: Road): void {
  roads.set(roadKey(from, to), road);
}

/** A looked-up drive between two places. The way back counts as the same drive. */
export function knownRoad(from: Place, to: Place): Road | undefined {
  return roads.get(roadKey(from, to)) ?? roads.get(roadKey(to, from));
}

/** Every looked-up drive, for saving. */
export const roadsTable = (): Record<string, Road> => Object.fromEntries(roads);

/** Puts saved drives back. Anything that is not a drive is skipped. */
export function loadRoads(table: unknown): void {
  if (typeof table !== 'object' || table === null) return;
  for (const [key, road] of Object.entries(table as Record<string, Partial<Road> | null>)) {
    if (road && Number.isFinite(road.miles) && Number.isFinite(road.minutes)) roads.set(key, { miles: Number(road.miles), minutes: Number(road.minutes) });
  }
}

export const forgetRoads = (): void => roads.clear();

/** "4 h 50 min", to the nearest 5 minutes. */
export function formatDrive(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

export interface Leg {
  /** The miles counted for this drive. 0 when not known. */
  miles: number;
  /** typed by hand, road miles looked up, estimated from the two places, none (same city), or unknown. */
  source: 'typed' | 'road' | 'estimated' | 'none' | 'unknown';
  /** The city the drive starts from. */
  from: string;
  /** The city the drive ends in. */
  to: string;
  /** The road miles or, failing those, the estimate, whenever either exists, even if typed miles are used. */
  estimate?: number;
  /** True when `estimate` is looked-up road miles rather than a straight-line estimate. */
  exact?: boolean;
  /** Driving time, when the road has been looked up. */
  minutes?: number;
  /** The two places, when both are known and differ: what a road lookup needs. */
  ends?: [Place, Place];
}

interface Stop {
  city: string;
  place?: Place;
}

/** A drive is kept under its two city names, so a changed city makes it a new drive. */
const driveKey = (from: string, to: string) => `${from.trim().toLowerCase()}>${to.trim().toLowerCase()}`;

function leg(from: Stop, to: Stop, typed: number | undefined, kept?: Record<string, KeptDrive>): Leg {
  const same = sameCity(from.city, to.city);
  const places: [Place, Place] | undefined = !same && from.place && to.place ? [from.place, to.place] : undefined;
  const road = places && knownRoad(...places);
  const estimate = same ? 0 : road ? road.miles : places ? drivingMiles(...places) : undefined;
  const common = { from: from.city, to: to.city, estimate, exact: road !== undefined, minutes: road?.minutes, ends: places };
  if (typed !== undefined) return { ...common, miles: typed, source: 'typed' };
  if (same) return { ...common, miles: 0, source: 'none' };
  // Once setup has ended the plan holds its own miles for the drive.
  const held = kept?.[driveKey(from.city, to.city)];
  if (held && Number.isFinite(held.miles)) return { ...common, miles: held.miles, source: held.exact ? 'road' : 'estimated' };
  if (estimate !== undefined) return { ...common, miles: estimate, source: road ? 'road' : 'estimated' };
  return { ...common, miles: 0, source: 'unknown' };
}

const home = (tour: Tour): Stop => ({ city: tour.homeCity, place: tour.homePlace });

/**
 * The drive into a date, from the date before it or from home. Also works for
 * a date that is not on the tour yet: it is placed by its day.
 */
export function legInto(tour: Tour, date: Pick<TourDate, 'date' | 'city' | 'place' | 'milesFromPrevious'> & { id?: string }): Leg {
  const index = date.id === undefined ? -1 : tour.dates.findIndex((d) => d.id === date.id);
  const previous = index >= 0 ? tour.dates[index - 1] : tour.dates.filter((d) => d.date <= date.date).at(-1);
  return leg(previous ?? home(tour), date, date.milesFromPrevious, tour.drives);
}

/** The drive home from the last date. */
export function legHome(tour: Tour): Leg {
  const last = tour.dates.at(-1);
  if (!last) return { miles: tour.milesHome ?? 0, source: tour.milesHome === undefined ? 'none' : 'typed', from: tour.homeCity, to: tour.homeCity };
  return leg(last, home(tour), tour.milesHome, tour.drives);
}

/** Every drive of the tour, in order, ending with the drive home. */
export const legs = (tour: Tour): Leg[] => [...tour.dates.map((d) => legInto(tour, d)), legHome(tour)];

/**
 * Writes the miles of every untyped drive into the tour, so the fuel plan
 * stays where it is when a road lookup arrives later, or when the device's
 * kept lookups are gone. A drive already held keeps its figure; a drive that
 * is new (a date added, a city changed) takes the best figure known now.
 * With `sharpen`, a held straight-line estimate gives way to road miles that
 * have since been looked up: for a tour that is not over yet. Typed miles
 * are the band's own and are not kept here. Changes the tour passed in and
 * says whether anything changed.
 */
export function keepDrives(tour: Tour, sharpen = false): boolean {
  const before = JSON.stringify(tour.drives ?? null);
  const kept: Record<string, KeptDrive> = {};
  for (const l of legs(tour)) {
    if (l.source !== 'road' && l.source !== 'estimated') continue;
    const key = driveKey(l.from, l.to);
    const held = tour.drives?.[key];
    const road = l.exact && l.estimate !== undefined ? l.estimate : undefined;
    if (road !== undefined && (!held || (sharpen && !held.exact))) kept[key] = { miles: road, exact: true };
    else kept[key] = held ?? { miles: l.miles };
  }
  tour.drives = kept;
  return JSON.stringify(kept) !== before;
}

export function routeMiles(tour: Tour): number {
  return legs(tour).reduce((total, l) => total + l.miles, 0);
}

/** How many drives have no miles, typed or estimated. They count as 0 in the fuel plan. */
export function unknownLegs(tour: Tour): number {
  return legs(tour).filter((l) => l.source === 'unknown').length;
}

/**
 * "256 mi drive, allow 4 h 50 min", "about 275 mi drive" for an estimate, or
 * nothing when there is no drive. In kilometres for a tour shown in them. The routing service's times assume modest
 * speeds and no stops, so they are given as time to allow, not a forecast.
 */
export function describeLeg(l: Leg, units: Units = 'us'): string {
  const time = l.minutes ? `, allow ${formatDrive(l.minutes)}` : '';
  if (l.source === 'typed') return l.miles > 0 ? `${formatDistance(l.miles, units)} drive${time}` : '';
  if (l.source === 'road') return `${formatDistance(l.miles, units)} drive${time}`;
  if (l.source === 'estimated') return `about ${formatDistance(l.miles, units)} drive`;
  return l.source === 'unknown' ? 'drive not known' : '';
}
