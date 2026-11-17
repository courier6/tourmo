// Sample tours. "Spring run" is the tests' worked example, mid-tour with
// three of five shows settled. The two before it are finished tours, so the
// tour list has past runs to look back on. All figures are invented. The
// worked example plans no food and no share of merch as its cost, so each
// sample sets both to 0.

import { dollars } from './money';
import { parseOffer, toOffer } from './parser';
import type { Offer, Tour, TourDate } from './types';

const offer = (raw: string): Offer => toOffer(parseOffer(raw));
const $ = dollars;

export function seedTour(): Tour {
  return {
    id: 'tour-spring-run',
    name: 'Spring run',
    homeCity: 'Dallas, TX',
    commissions: [
      { id: 'agent', name: 'Agent', rate: 0.1, base: 'show' },
      { id: 'manager', name: 'Manager', rate: 0.15, base: 'show' },
    ],
    vehicle: { dailyRate: $(120), actual: $(720) },
    fuel: { mpg: 15, pricePerGallon: $(3.2) },
    perDiem: 0,
    merchCostRate: 0,
    merchPerShowDefault: $(300),
    lodgingPerNightDefault: $(200),
    milesHome: 660,
    demoToday: '2027-03-07',
    lines: [{ id: 'merch-cost', label: 'Merch cost reimbursement', direction: 'out', plan: $(400) }],
    dates: [
      {
        id: 'd1',
        date: '2027-03-04',
        city: 'Dallas, TX',
        kind: 'show',
        offer: offer('$1K + 70% < $2250'),
        boxOffice: $(2650),
        merch: { plan: $(300), actual: $(410) },
        lodging: { plan: 0 },
        fuelFillUps: [$(62)],
        lines: [],
        settled: true,
      },
      {
        id: 'd2',
        date: '2027-03-05',
        city: 'Oklahoma City, OK',
        kind: 'show',
        milesFromPrevious: 205,
        offer: offer('$1K vs 70%'),
        boxOffice: $(1300),
        merch: { plan: $(300), actual: $(265) },
        lodging: { plan: $(200), actual: $(250) },
        fuelFillUps: [$(58)],
        lines: [],
        settled: true,
      },
      {
        id: 'd3',
        date: '2027-03-06',
        city: 'Wichita, KS',
        kind: 'show',
        milesFromPrevious: 160,
        offer: offer('$800 flat'),
        merch: { plan: $(300), actual: $(340) },
        lodging: { plan: $(200), actual: $(200) },
        fuelFillUps: [$(45)],
        lines: [{ id: 'buyout', label: 'Lodging buyout', direction: 'in', plan: $(150), actual: $(150) }],
        settled: true,
      },
      {
        id: 'd4',
        date: '2027-03-07',
        city: 'Kansas City, MO',
        kind: 'show',
        milesFromPrevious: 200,
        offer: offer('$1.2K vs 80%'),
        merch: { plan: $(300) },
        lodging: { plan: $(200) },
        fuelFillUps: [],
        lines: [],
        settled: false,
      },
      {
        id: 'd5',
        date: '2027-03-08',
        city: 'Omaha, NE',
        kind: 'show',
        milesFromPrevious: 185,
        offer: offer('$1K flat'),
        merch: { plan: $(300) },
        lodging: { plan: $(200) },
        fuelFillUps: [],
        lines: [],
        settled: false,
      },
    ],
  };
}

/** A finished show: settled, with every actual entered. */
function played(
  id: string,
  date: string,
  city: string,
  miles: number,
  raw: string,
  boxOffice: number | undefined,
  merch: [plan: number, actual: number],
  lodging: [plan: number, actual: number] | undefined,
  fuel: number[],
): TourDate {
  return {
    id,
    date,
    city,
    kind: 'show',
    milesFromPrevious: miles,
    offer: offer(raw),
    boxOffice: boxOffice === undefined ? undefined : $(boxOffice),
    merch: { plan: $(merch[0]), actual: $(merch[1]) },
    lodging: lodging ? { plan: $(lodging[0]), actual: $(lodging[1]) } : { plan: 0 },
    fuelFillUps: fuel.map($),
    lines: [],
    settled: true,
  };
}

function fallRun(): Tour {
  return {
    id: 'tour-fall-run',
    name: 'Fall run',
    homeCity: 'Dallas, TX',
    commissions: [
      { id: 'agent', name: 'Agent', rate: 0.1, base: 'show' },
      { id: 'manager', name: 'Manager', rate: 0.15, base: 'show' },
    ],
    vehicle: { dailyRate: $(120), actual: $(600), final: true },
    fuel: { mpg: 15, pricePerGallon: $(3.05), final: true },
    perDiem: 0,
    merchCostRate: 0,
    merchPerShowDefault: $(250),
    lodgingPerNightDefault: $(180),
    milesHome: 190,
    lines: [],
    dates: [
      played('f1', '2026-10-15', 'Austin, TX', 195, '$900 vs 70%', 1600, [250, 310], [180, 165], [48]),
      played('f2', '2026-10-16', 'San Antonio, TX', 80, '$750 flat', undefined, [250, 190], [180, 180], []),
      played('f3', '2026-10-17', 'Houston, TX', 200, '$1K + 70% < $2000', 2400, [250, 420], [180, 210], [61]),
      played('f4', '2026-10-18', 'Shreveport, LA', 240, '$600 vs 80%', 640, [250, 150], undefined, [55, 40]),
    ],
  };
}

function summerWeekender(): Tour {
  return {
    id: 'tour-summer-weekender',
    name: 'Summer weekender',
    homeCity: 'Dallas, TX',
    commissions: [
      { id: 'agent', name: 'Agent', rate: 0.1, base: 'show' },
      { id: 'manager', name: 'Manager', rate: 0.15, base: 'show' },
    ],
    vehicle: { dailyRate: $(110), actual: $(495), final: true },
    fuel: { mpg: 15, pricePerGallon: $(3.4), final: true },
    perDiem: 0,
    merchCostRate: 0,
    merchPerShowDefault: $(200),
    lodgingPerNightDefault: $(170),
    milesHome: 180,
    lines: [{ id: 'tyre', label: 'Tyre replacement', direction: 'out', plan: 0, actual: $(450), final: true }],
    dates: [
      played('s1', '2026-07-10', 'Tulsa, OK', 260, '$700 flat', undefined, [200, 140], [170, 185], [70]),
      played('s2', '2026-07-11', 'Little Rock, AR', 275, '$500 vs 80%', 480, [200, 120], [170, 170], [66]),
      played('s3', '2026-07-12', 'Texarkana, TX', 145, '80% of door', 300, [200, 90], undefined, [52]),
    ],
  };
}

/** Every sample tour, oldest first. */
export function seedTours(): Tour[] {
  return [summerWeekender(), fallRun(), seedTour()];
}

export const SAMPLE_TOUR_IDS = ['tour-summer-weekender', 'tour-fall-run', 'tour-spring-run'];
