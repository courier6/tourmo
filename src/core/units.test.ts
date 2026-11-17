// A tour shown in kilometres and litres. Its distances, mileage and fuel
// price are stored in miles and gallons; these check the conversion at the
// edges and that the fuel plan comes to what the typed figures say.

import { describe, expect, it } from 'vitest';
import {
  blankTour,
  budget,
  carryOver,
  describeLeg,
  distanceIn,
  dollars,
  formatDistance,
  formatMileage,
  fuelForDrive,
  fuelPlan,
  fuelPriceIn,
  isTour,
  legInto,
  mileageIn,
  milesFrom,
  mpgFrom,
  perGallonFrom,
  routeMiles,
  seedTour,
  setUnits,
  unitsOf,
  type Tour,
  type TourDate,
} from './index';

const $ = dollars;

const day = (id: string, date: string, city: string, km: number): TourDate => ({
  id,
  date,
  city,
  kind: 'show',
  milesFromPrevious: milesFrom(km, 'metric'),
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
});

/** Amsterdam, Cologne, Berlin and back: 1,200 km, every figure typed the way the fields take it. */
const euroRun = (): Tour => {
  const t = blankTour('e1', 'Europe run', 'Amsterdam', undefined, undefined, { currency: 'EUR', units: 'metric' });
  t.dates = [day('a', '2027-05-01', 'Amsterdam', 0), day('b', '2027-05-02', 'Cologne', 260), day('c', '2027-05-03', 'Berlin', 575)];
  t.milesHome = milesFrom(365, 'metric');
  t.fuel.mpg = mpgFrom(9.5, 'metric');
  t.fuel.pricePerGallon = perGallonFrom($(1.85), 'metric');
  return t;
};

describe('the units of a tour', () => {
  it('are miles and gallons when none are set', () => {
    expect(unitsOf(seedTour())).toBe('us');
    expect(unitsOf(euroRun())).toBe('metric');
  });

  it('leave a figure in miles and gallons as it is', () => {
    expect(distanceIn(205, 'us')).toBe(205);
    expect(milesFrom(205, 'us')).toBe(205);
    expect(mileageIn(15, 'us')).toBe(15);
    expect(mpgFrom(15, 'us')).toBe(15);
    expect(fuelPriceIn(320, 'us')).toBe(320);
    expect(perGallonFrom(320, 'us')).toBe(320);
  });

  it('give back the kilometres, litres per 100 km and price per litre that were typed', () => {
    for (const km of [0, 1, 12, 12.5, 350, 575, 1234.56]) expect(distanceIn(milesFrom(km, 'metric'), 'metric')).toBe(km);
    for (const l100 of [6.5, 9.5, 10, 11.25, 15.7]) expect(mileageIn(mpgFrom(l100, 'metric'), 'metric')).toBe(l100);
    for (const cents of [99, 145, 185, 209]) expect(fuelPriceIn(perGallonFrom(cents, 'metric'), 'metric')).toBe(cents);
  });

  it('convert between the two', () => {
    expect(distanceIn(100, 'metric')).toBeCloseTo(160.9344, 4);
    expect(mileageIn(15, 'metric')).toBeCloseTo(15.68, 2);
    expect(mpgFrom(10, 'metric')).toBeCloseTo(23.52, 2);
    expect(fuelPriceIn(345, 'metric')).toBe(91); // $3.45 a gallon is 91 cents a litre
  });

  it('never store an infinite mileage: no fuel used is 0 either way', () => {
    expect(mpgFrom(0, 'metric')).toBe(0);
    expect(mileageIn(0, 'metric')).toBe(0);
    const tour = euroRun();
    tour.fuel.mpg = mpgFrom(0, 'metric');
    expect(fuelPlan(tour)).toBe(0);
    expect(isTour(JSON.parse(JSON.stringify(tour)))).toBe(true);
  });

  it('are written after the figure', () => {
    expect(formatDistance(1240)).toBe('1,240 mi');
    expect(formatDistance(1240, 'metric')).toBe('1,996 km');
    expect(formatMileage(15)).toBe('15 mpg');
    expect(formatMileage(15, 'metric')).toBe('15.7 L/100 km');
    expect(formatMileage(mpgFrom(9.5, 'metric'), 'metric')).toBe('9.5 L/100 km');
  });
});

describe('a tour in kilometres and litres', () => {
  it('plans fuel as kilometres × litres per 100 km × the price per litre', () => {
    const tour = euroRun();
    expect(distanceIn(routeMiles(tour), 'metric')).toBe(1200);
    // 1,200 km × 9.5 L/100 km = 114 L, at €1.85 = €210.90
    expect(fuelPlan(tour)).toBe($(211));
    // 575 km × 9.5 / 100 × 1.85 = €101.06
    expect(fuelForDrive(tour, tour.dates[2]).cost).toBe($(101));
  });

  it('rounds a half up as the same sum in litres would', () => {
    const tour = euroRun();
    tour.dates = [day('a', '2027-05-01', 'Amsterdam', 0), day('b', '2027-05-02', 'Utrecht', 100)];
    tour.milesHome = 0;
    tour.fuel.mpg = mpgFrom(7, 'metric');
    tour.fuel.pricePerGallon = perGallonFrom($(1.5), 'metric');
    expect(fuelPlan(tour)).toBe($(11)); // 100 km × 7 L/100 km × €1.50 = €10.50
  });

  it('says how the fuel plan was worked out in its own units', () => {
    const fuel = budget(euroRun()).expenses.find((l) => l.kind === 'fuel');
    expect(fuel?.how).toBe('Route: 1,200 km × 9.5 L/100 km × €1.85 a litre');
    expect(fuel?.plan).toBe($(211));
  });

  it('counts a drive with no distance as not known, in kilometres', () => {
    const tour = euroRun();
    delete tour.dates[1].milesFromPrevious;
    expect(budget(tour).expenses.find((l) => l.kind === 'fuel')?.how).toBe('Route: 940 km × 9.5 L/100 km × €1.85 a litre. 1 drive not counted: kilometres not known');
  });

  it('describes a drive in kilometres', () => {
    const tour = euroRun();
    expect(describeLeg(legInto(tour, tour.dates[1]), 'metric')).toBe('260 km drive');
    expect(describeLeg(legInto(tour, tour.dates[0]), 'metric')).toBe('');
    expect(describeLeg({ miles: 275, source: 'estimated', from: 'a', to: 'b' }, 'metric')).toBe('about 443 km drive');
    expect(describeLeg({ miles: 256, source: 'road', from: 'a', to: 'b', minutes: 290 }, 'metric')).toBe('412 km drive, allow 4 h 50 min');
  });
});

describe('changing the units of a tour', () => {
  it('changes what is shown and nothing that is stored', () => {
    const tour = seedTour();
    const before = budget(tour);
    setUnits(tour, 'metric');
    expect(tour.units).toBe('metric');
    expect(budget(tour).plan).toEqual(before.plan);
    expect(budget(tour).now).toEqual(before.now);
    expect(routeMiles(tour)).toBe(routeMiles(seedTour()));
    expect(budget(tour).expenses.find((l) => l.kind === 'fuel')?.how).toBe('Route: 2,269 km × 15.7 L/100 km × $0.85 a litre');
  });

  it('leaves no field behind when it goes back to miles', () => {
    const tour = seedTour();
    setUnits(tour, 'metric');
    setUnits(tour, 'us');
    expect(tour).toEqual(seedTour());
    expect(budget(tour).expenses.find((l) => l.kind === 'fuel')?.how).toBe('Route: 1,410 mi ÷ 15 mpg × $3.20');
  });
});

describe('a new tour and its units', () => {
  it('is in miles, with no units field, unless kilometres are chosen', () => {
    expect('units' in blankTour('t1', 'Summer run')).toBe(false);
    expect('units' in blankTour('t1', 'Summer run', '', undefined, undefined, { units: 'us' })).toBe(false);
    expect(blankTour('t1', 'Europe run', '', undefined, undefined, { units: 'metric' }).units).toBe('metric');
  });

  it('is in the units of the last tour until others are chosen', () => {
    const last = euroRun();
    delete last.setup;
    const carried = carryOver([last]);
    expect(carried?.units).toBe('metric');
    expect(blankTour('t2', 'Next', '', undefined, carried).units).toBe('metric');
    expect('units' in blankTour('t2', 'Next', '', undefined, carried, { units: 'us' })).toBe(false);
  });

  it('is refused when saved with units the app does not know', () => {
    expect(isTour({ ...seedTour(), units: 'metric' })).toBe(true);
    expect(isTour({ ...seedTour(), units: 'imperial' })).toBe(false);
  });
});
