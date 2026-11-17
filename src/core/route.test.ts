// City lookup and drive estimates.
// The lookups run against the real bundled list.

import { afterEach, describe, expect, it } from 'vitest';
import rows from '../data/cities.json';
import {
  blankTour,
  budget,
  describeLeg,
  dollars,
  drivingMiles,
  forgetRoads,
  formatDrive,
  fuelForDrive,
  knownRoad,
  loadRoads,
  rememberRoad,
  roadsTable,
  fuelPlan,
  legHome,
  legInto,
  matchCity,
  prepareCities,
  routeMiles,
  searchCities,
  seedTour,
  straightMiles,
  unknownLegs,
  type Place,
  type Tour,
  type TourDate,
} from './index';

const cities = prepareCities(rows);
const at = (label: string): Place => {
  const c = matchCity(cities, label);
  if (!c) throw new Error(label + ' is not in the list');
  return { lat: c.lat, lon: c.lon };
};
const labels = (query: string) => searchCities(cities, query).map((c) => c.label);

const day = (id: string, date: string, city: string, known = true, miles?: number): TourDate => ({
  id,
  date,
  city,
  ...(known ? { place: at(city) } : {}),
  kind: 'show',
  milesFromPrevious: miles,
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
});

describe('city lookup', () => {
  it('finds cities as they are typed, largest first', () => {
    expect(labels('tul')[0]).toBe('Tulsa, OK');
    expect(labels('dal')[0]).toBe('Dallas, TX');
    expect(labels('okla')[0]).toBe('Oklahoma City, OK');
    expect(labels('marf')).toContain('Marfa, TX');
    expect(labels('toron')[0]).toBe('Toronto, ON');
    expect(searchCities(cities, 'san', 4)).toHaveLength(4);
  });

  it('narrows by state, with or without a comma', () => {
    expect(labels('springfield, mo')).toEqual(['Springfield, MO']);
    expect(labels('springfield, m')).toEqual(expect.arrayContaining(['Springfield, MO', 'Springfield, MA']));
    expect(labels('tulsa ok')).toEqual(['Tulsa, OK']);
    expect(labels('portland me')[0]).toBe('Portland, ME');
  });

  it('ignores case, accents and punctuation', () => {
    expect(labels('st louis')[0]).toBe('St. Louis, MO');
    expect(labels('Saint Louis, MO')[0]).toBe('St. Louis, MO');
    expect(labels('montreal')[0]).toBe('Montréal, QC');
    expect(labels("coeur d'alene")).toEqual(labels('coeur dalene'));
  });

  it('finds a later word when no name starts with it', () => {
    expect(labels('rapids')).toEqual(expect.arrayContaining(['Grand Rapids, MI', 'Cedar Rapids, IA']));
  });

  it('gives nothing for an empty or unknown entry', () => {
    expect(labels('')).toEqual([]);
    expect(labels('  ')).toEqual([]);
    expect(labels('zzzzqq')).toEqual([]);
  });

  it('matches a finished entry only when it means one city', () => {
    expect(matchCity(cities, 'tulsa, ok')?.label).toBe('Tulsa, OK');
    expect(matchCity(cities, 'Tulsa')?.label).toBe('Tulsa, OK');
    expect(matchCity(cities, 'Springfield')).toBeUndefined(); // several states have one
    expect(matchCity(cities, 'Springfield, ZZ')).toBeUndefined();
    expect(matchCity(cities, 'Nowhere at all')).toBeUndefined();
    expect(matchCity(cities, '')).toBeUndefined();
  });
});

describe('drive estimates', () => {
  it('lands near the road miles of the Spring run legs', () => {
    // The sample tour's typed miles, from a map: 205, 160, 200, 185 and 660 home.
    const real: [string, string, number][] = [
      ['Dallas, TX', 'Oklahoma City, OK', 205],
      ['Oklahoma City, OK', 'Wichita, KS', 160],
      ['Wichita, KS', 'Kansas City, MO', 200],
      ['Kansas City, MO', 'Omaha, NE', 185],
      ['Omaha, NE', 'Dallas, TX', 660],
    ];
    for (const [a, b, miles] of real) {
      const estimate = drivingMiles(at(a), at(b));
      expect(estimate % 5).toBe(0);
      expect(Math.abs(estimate - miles) / miles).toBeLessThan(0.15);
      expect(estimate).toBeGreaterThanOrEqual(straightMiles(at(a), at(b)));
    }
  });

  it('is the same both ways and zero for the same place', () => {
    expect(drivingMiles(at('Tulsa, OK'), at('Wichita, KS'))).toBe(drivingMiles(at('Wichita, KS'), at('Tulsa, OK')));
    expect(drivingMiles(at('Tulsa, OK'), at('Tulsa, OK'))).toBe(0);
  });
});

describe('the drives of a tour', () => {
  const tour = (): Tour => {
    const t = blankTour('t1', 'Summer run', 'Dallas, TX', at('Dallas, TX'));
    t.fuel = { mpg: 15, pricePerGallon: dollars(4) };
    t.dates = [day('a', '2027-06-04', 'Dallas, TX'), day('b', '2027-06-05', 'Tulsa, OK'), day('c', '2027-06-06', 'Wichita, KS')];
    return t;
  };

  it('keeps the sample tour on its typed miles', () => {
    expect(routeMiles(seedTour())).toBe(1410);
    expect(unknownLegs(seedTour())).toBe(0);
    expect(legInto(seedTour(), seedTour().dates[1])).toMatchObject({ miles: 205, source: 'typed', from: 'Dallas, TX' });
  });

  it('estimates every drive when the cities were picked from the list', () => {
    const t = tour();
    const toTulsa = drivingMiles(at('Dallas, TX'), at('Tulsa, OK'));
    const toWichita = drivingMiles(at('Tulsa, OK'), at('Wichita, KS'));
    const home = drivingMiles(at('Wichita, KS'), at('Dallas, TX'));
    expect(legInto(t, t.dates[0])).toMatchObject({ miles: 0, source: 'none' }); // a home-town show
    expect(legInto(t, t.dates[1])).toMatchObject({ miles: toTulsa, source: 'estimated', from: 'Dallas, TX' });
    expect(legInto(t, t.dates[2])).toMatchObject({ miles: toWichita, source: 'estimated', from: 'Tulsa, OK' });
    expect(legHome(t)).toMatchObject({ miles: home, source: 'estimated', from: 'Wichita, KS' });
    expect(routeMiles(t)).toBe(toTulsa + toWichita + home);
    expect(describeLeg(legInto(t, t.dates[1]))).toBe(`about ${toTulsa} mi drive`);
    expect(describeLeg(legInto(t, t.dates[0]))).toBe('');
  });

  it('starts from home when the first date is away', () => {
    const t = tour();
    t.dates.shift();
    expect(legInto(t, t.dates[0])).toMatchObject({ source: 'estimated', from: 'Dallas, TX', miles: drivingMiles(at('Dallas, TX'), at('Tulsa, OK')) });
  });

  it('uses typed miles over the estimate, and still says what the estimate is', () => {
    const t = tour();
    t.dates[1].milesFromPrevious = 260;
    t.milesHome = 365;
    expect(legInto(t, t.dates[1])).toMatchObject({ miles: 260, source: 'typed', estimate: drivingMiles(at('Dallas, TX'), at('Tulsa, OK')) });
    expect(legHome(t)).toMatchObject({ miles: 365, source: 'typed' });
    expect(describeLeg(legInto(t, t.dates[1]))).toBe('260 mi drive');
  });

  it('follows the dates when one is removed', () => {
    const t = tour();
    t.dates.splice(1, 1); // Tulsa goes; Wichita is now reached from Dallas
    expect(legInto(t, t.dates[1])).toMatchObject({ from: 'Dallas, TX', miles: drivingMiles(at('Dallas, TX'), at('Wichita, KS')) });
  });

  it('places a date that is not on the tour yet by its day', () => {
    const t = tour();
    const pending = { date: '2027-06-07', city: 'Omaha, NE', place: at('Omaha, NE'), milesFromPrevious: undefined };
    expect(legInto(t, pending)).toMatchObject({ from: 'Wichita, KS', source: 'estimated' });
    expect(legInto(blankTour('t2', 'Empty', 'Dallas, TX', at('Dallas, TX')), pending)).toMatchObject({ from: 'Dallas, TX', source: 'estimated' });
  });

  it('counts a drive it cannot estimate as unknown, and the budget says so', () => {
    const t = tour();
    t.dates[1] = day('b', '2027-06-05', 'Somewhere not listed', false);
    expect(legInto(t, t.dates[1])).toMatchObject({ miles: 0, source: 'unknown' });
    expect(legInto(t, t.dates[2])).toMatchObject({ miles: 0, source: 'unknown' });
    expect(unknownLegs(t)).toBe(2);
    expect(budget(t).expenses.find((l) => l.id === 'fuel')!.how).toContain('2 drives not counted: miles not known');
    t.dates[1].milesFromPrevious = 250;
    expect(unknownLegs(t)).toBe(1);
  });

  it('feeds the fuel plan', () => {
    const t = tour();
    expect(fuelPlan(t)).toBe(Math.floor(((routeMiles(t) / 15) * 400) / 100 + 0.5) * 100);
    expect(budget(t).expenses.find((l) => l.id === 'fuel')!.how).not.toContain('not counted');
  });
});

describe('road miles that have been looked up', () => {
  afterEach(forgetRoads);

  const tour = (): Tour => {
    const t = blankTour('t1', 'Summer run', 'Dallas, TX', at('Dallas, TX'));
    t.fuel = { mpg: 16, pricePerGallon: dollars(4) };
    t.dates = [day('b', '2027-06-05', 'Tulsa, OK'), day('c', '2027-06-06', 'Wichita, KS')];
    return t;
  };

  it('replace the straight-line estimate for that drive, and bring the driving time', () => {
    const t = tour();
    const estimate = drivingMiles(at('Dallas, TX'), at('Tulsa, OK'));
    expect(legInto(t, t.dates[0])).toMatchObject({ miles: estimate, source: 'estimated', exact: false });
    rememberRoad(at('Dallas, TX'), at('Tulsa, OK'), { miles: 256, minutes: 289 });
    expect(legInto(t, t.dates[0])).toMatchObject({ miles: 256, source: 'road', exact: true, minutes: 289, estimate: 256 });
    expect(describeLeg(legInto(t, t.dates[0]))).toBe('256 mi drive, allow 4 h 50 min');
    // The next drive has not been looked up, so it is still an estimate.
    expect(legInto(t, t.dates[1])).toMatchObject({ source: 'estimated' });
    expect(routeMiles(t)).toBe(256 + legInto(t, t.dates[1]).miles + legHome(t).miles);
  });

  it('count for the way back too', () => {
    rememberRoad(at('Dallas, TX'), at('Wichita, KS'), { miles: 365, minutes: 330 });
    expect(knownRoad(at('Wichita, KS'), at('Dallas, TX'))).toEqual({ miles: 365, minutes: 330 });
    expect(legHome(tour())).toMatchObject({ miles: 365, source: 'road', from: 'Wichita, KS' });
  });

  it('never replace miles the band typed, but are offered beside them', () => {
    const t = tour();
    t.dates[0].milesFromPrevious = 300;
    rememberRoad(at('Dallas, TX'), at('Tulsa, OK'), { miles: 256, minutes: 289 });
    expect(legInto(t, t.dates[0])).toMatchObject({ miles: 300, source: 'typed', estimate: 256, exact: true });
  });

  it('say which two places a lookup needs, and only when both are known and differ', () => {
    const t = tour();
    expect(legInto(t, t.dates[0]).ends).toEqual([at('Dallas, TX'), at('Tulsa, OK')]);
    t.dates[0] = day('b', '2027-06-05', 'Somewhere not listed', false);
    expect(legInto(t, t.dates[0]).ends).toBeUndefined();
    t.dates[0] = day('b', '2027-06-05', 'Dallas, TX');
    expect(legInto(t, t.dates[0]).ends).toBeUndefined(); // a home-town show
  });

  it('survive being saved and put back, and skip anything damaged', () => {
    rememberRoad(at('Dallas, TX'), at('Tulsa, OK'), { miles: 256, minutes: 289 });
    const saved = JSON.parse(JSON.stringify(roadsTable()));
    forgetRoads();
    loadRoads({ ...saved, bad: { miles: 'far' }, worse: null });
    expect(roadsTable()).toEqual(saved);
    loadRoads(null);
    loadRoads('nonsense');
    expect(Object.keys(roadsTable())).toHaveLength(1);
  });

  it('feed the fuel figure for a single drive', () => {
    const t = tour();
    rememberRoad(at('Dallas, TX'), at('Tulsa, OK'), { miles: 256, minutes: 289 });
    expect(fuelForDrive(t, t.dates[0])).toEqual({ miles: 256, cost: dollars(64) }); // 256 / 16 × 4
    const home = blankTour('t2', 'Home show', 'Dallas, TX', at('Dallas, TX'));
    home.dates = [day('a', '2027-06-04', 'Dallas, TX')];
    expect(fuelForDrive(home, home.dates[0])).toEqual({ miles: 0, cost: 0 });
  });

  it('write driving time in hours and minutes, to the nearest 5', () => {
    expect(formatDrive(289)).toBe('4 h 50 min');
    expect(formatDrive(60)).toBe('1 h');
    expect(formatDrive(42)).toBe('40 min');
    expect(formatDrive(2)).toBe('5 min');
    expect(formatDrive(1438)).toBe('24 h');
  });
});
