// A tour that is not in dollars is given no United States estimate: its van
// rate, fuel price and lodging are typed, and until they are the plan says
// what it is waiting for.

import { describe, expect, it } from 'vitest';
import {
  blankTour,
  budget,
  dollars,
  finishSetup,
  fuelPlan,
  hasUsFigures,
  lodgingFor,
  milesFrom,
  missingFigures,
  mpgFrom,
  perGallonFrom,
  seedTours,
  setCurrency,
  setOwnLodging,
  tourRates,
  type Tour,
  type TourDate,
} from './index';

const $ = dollars;

const day = (id: string, date: string, city: string, miles?: number): TourDate => ({
  id,
  date,
  city,
  kind: 'show',
  milesFromPrevious: miles,
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
});

/** Three nights out of Amsterdam, in euros and kilometres, with nothing typed for the rates. */
const euroRun = (): Tour => {
  const t = blankTour('e1', 'Europe run', 'Amsterdam', undefined, undefined, { currency: 'EUR', units: 'metric' });
  t.dates = [day('a', '2027-05-01', 'Cologne', milesFrom(260, 'metric')), day('b', '2027-05-02', 'Berlin', milesFrom(575, 'metric')), day('c', '2027-05-03', 'Hamburg', milesFrom(290, 'metric'))];
  t.milesHome = milesFrom(465, 'metric');
  return t;
};

/** The same route in the United States, in dollars. */
const dollarRun = (): Tour => {
  const t = blankTour('u1', 'Summer run', 'Dallas, TX');
  t.dates = [day('a', '2027-05-01', 'Tulsa, OK', 260), day('b', '2027-05-02', 'Wichita, KS', 180), day('c', '2027-05-03', 'Oklahoma City, OK', 160)];
  t.milesHome = 205;
  return t;
};

const line = (tour: Tour, kind: string) => budget(tour).expenses.find((l) => l.kind === kind);

describe('a tour that is not in dollars', () => {
  it('has no estimate for the van rate, the fuel price or lodging', () => {
    expect(hasUsFigures(euroRun())).toBe(false);
    const rates = tourRates(euroRun());
    for (const r of [rates.vanDailyRate, rates.gasPrice, rates.lodgingPerNight]) expect(r).toMatchObject({ value: 0, typed: false, estimated: false, estimate: 0, noEstimate: true });
  });

  it('keeps the estimates that are not United States prices', () => {
    const rates = tourRates(euroRun());
    expect(rates.mpg).toMatchObject({ value: 15, typed: false, estimated: true });
    expect(rates.perDiem).toMatchObject({ value: $(20), typed: false, estimated: true });
    expect(rates.merchCost).toMatchObject({ value: 0.4, estimated: true });
    expect(rates.vanDays.value).toBe(4);
    expect(rates.mpg.noEstimate).toBeUndefined();
  });

  it('uses the figures that are typed', () => {
    const tour = euroRun();
    tour.vehicle.dailyRate = $(95);
    tour.fuel.pricePerGallon = perGallonFrom($(1.85), 'metric');
    tour.lodgingPerNightDefault = $(180);
    const rates = tourRates(tour);
    expect(rates.vanDailyRate).toMatchObject({ value: $(95), typed: true, estimated: false });
    expect(rates.lodgingPerNight).toMatchObject({ value: $(180), typed: true, estimated: false });
    expect(rates.gasPrice.typed).toBe(true);
    expect(missingFigures(tour)).toEqual([]);
  });

  it('plans no lodging for a night until a figure is typed', () => {
    const tour = euroRun();
    expect(lodgingFor(tour, tour.dates[0])).toBe(0);
    tour.lodgingPerNightDefault = $(180);
    expect(lodgingFor(tour, tour.dates[0])).toBe($(180));
    expect(lodgingFor(tour, { ...tour.dates[0], city: 'amsterdam' })).toBe(0); // a night at home
  });

  it('says which figures the plan is waiting for', () => {
    const tour = euroRun();
    expect(missingFigures(tour)).toEqual(['the van daily rate', 'the fuel price', 'lodging']);
    tour.fuel.pricePerGallon = perGallonFrom($(1.85), 'metric');
    expect(missingFigures(tour)).toEqual(['the van daily rate', 'lodging']);
    tour.vehicle.dailyRate = 0; // the band's own van
    expect(missingFigures(tour)).toEqual(['lodging']);
    tour.dates[1].lodging.plan = $(150); // a night planned by hand
    expect(missingFigures(tour)).toEqual([]);
  });

  it('is not given estimates when its setup ends', () => {
    const tour = euroRun();
    finishSetup(tour);
    expect(tour.vehicle.dailyRate).toBeUndefined();
    expect(tour.fuel.pricePerGallon).toBeUndefined();
    expect(tour.lodgingPerNightDefault).toBeUndefined();
    expect(tour.estimated).toEqual(['mpg', 'perDiem', 'merchCost']);
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, 0, 0]);
    expect(missingFigures(tour)).toEqual(['the van daily rate', 'the fuel price', 'lodging']);
  });

  it('shows the missing figures as lines planned at 0, in words', () => {
    const tour = euroRun();
    finishSetup(tour);
    expect(line(tour, 'vehicle')).toMatchObject({ plan: 0, how: 'No daily rate yet: type it in Rates' });
    expect(line(tour, 'fuel')).toMatchObject({ plan: 0, how: 'Route: 1,590 km. No fuel price yet: type it in Rates' });
    expect(line(tour, 'lodging')).toMatchObject({ plan: 0, how: 'No lodging figure yet: type it in Rates' });
    // Food is a rule of thumb, not a United States price: 20 × 4 people × 3 days.
    expect(line(tour, 'food')).toMatchObject({ plan: $(240), how: '€20 (estimate) × 4 people × 3 days' });
  });

  it('plans from the typed figures when its setup ends', () => {
    const tour = euroRun();
    tour.vehicle.dailyRate = $(95);
    tour.fuel.mpg = mpgFrom(9.5, 'metric');
    tour.fuel.pricePerGallon = perGallonFrom($(1.85), 'metric');
    tour.lodgingPerNightDefault = $(180);
    finishSetup(tour);
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([$(180), $(180), $(180)]);
    expect(line(tour, 'vehicle')).toMatchObject({ plan: $(380), how: '€95 × 4 days' });
    // 1,590 km × 9.5 L/100 km × €1.85 = €279.44
    expect(fuelPlan(tour)).toBe($(279));
    expect(line(tour, 'fuel')?.how).toBe('Route: 1,590 km × 9.5 L/100 km × €1.85 a litre');
    expect(line(tour, 'lodging')).toMatchObject({ plan: $(540), how: '€180 × 3 nights' });
    expect(missingFigures(tour)).toEqual([]);
  });
});

describe('a lodging figure typed after setup, where there is no estimate', () => {
  it('fills the nights that were waiting for it, as it is typed', () => {
    const tour = euroRun();
    finishSetup(tour);
    for (const typed of [$(1), $(18), $(180)]) setOwnLodging(tour, typed); // "1", "18", "180"
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([$(180), $(180), $(180)]);
    expect(missingFigures(tour)).not.toContain('lodging');
    expect(line(tour, 'lodging')).toMatchObject({ plan: $(540), how: '€180 × 3 nights' });
  });

  it('leaves a night changed by hand, and a night at home, as they are', () => {
    const tour = euroRun();
    tour.dates.push(day('d', '2027-05-04', 'Amsterdam', 0));
    tour.lodgingPerNightDefault = $(180);
    finishSetup(tour);
    tour.dates[1].lodging.plan = $(90); // a cheaper room in Berlin
    tour.dates[2].lodging.plan = 0; // staying with friends in Hamburg
    setOwnLodging(tour, $(200));
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([$(200), $(90), 0, 0]);
  });

  it('goes back to waiting when the figure is cleared', () => {
    const tour = euroRun();
    tour.lodgingPerNightDefault = $(180);
    finishSetup(tour);
    setOwnLodging(tour, undefined);
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, 0, 0]);
    expect(missingFigures(tour)).toContain('lodging');
  });

  it('leaves the dates to the end of setup while the tour is being set up', () => {
    const tour = euroRun();
    setOwnLodging(tour, $(180));
    expect(tour.lodgingPerNightDefault).toBe($(180));
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, 0, 0]);
  });
});

describe('a tour in dollars', () => {
  it('is estimated as before, with nothing missing', () => {
    const tour = dollarRun();
    expect(hasUsFigures(tour)).toBe(true);
    const rates = tourRates(tour);
    for (const r of [rates.vanDailyRate, rates.gasPrice, rates.lodgingPerNight]) {
      expect(r.noEstimate).toBeUndefined();
      expect(r.value).toBeGreaterThan(0);
      expect(r.estimated).toBe(true);
    }
    expect(missingFigures(tour)).toEqual([]);
    for (const sample of seedTours()) expect(missingFigures(sample)).toEqual([]);
  });

  it('has no van line when the van is its own, as before', () => {
    const tour = dollarRun();
    tour.vehicle.dailyRate = 0;
    finishSetup(tour);
    expect(line(tour, 'vehicle')).toBeUndefined();
  });
});

describe('moving a tour out of dollars', () => {
  it('lets go of the United States estimates it was set up with', () => {
    const tour = dollarRun();
    finishSetup(tour);
    expect(tour.estimated).toEqual(expect.arrayContaining(['vanDailyRate', 'gasPrice', 'lodgingPerNight']));
    expect(tour.dates.every((d) => d.lodging.plan > 0)).toBe(true);

    setCurrency(tour, 'EUR');
    expect(tour.vehicle.dailyRate).toBeUndefined();
    expect(tour.fuel.pricePerGallon).toBeUndefined();
    expect(tour.lodgingPerNightDefault).toBeUndefined();
    expect(tour.estimated).toEqual(['mpg', 'perDiem', 'merchCost']);
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, 0, 0]);
    expect(missingFigures(tour)).toEqual(['the van daily rate', 'the fuel price', 'lodging']);
  });

  it('keeps every figure that was typed, as the same number', () => {
    const tour = dollarRun();
    tour.vehicle.dailyRate = $(140);
    tour.fuel.pricePerGallon = $(4.1);
    tour.lodgingPerNightDefault = $(200);
    finishSetup(tour);
    tour.dates[1].lodging.plan = $(90);

    setCurrency(tour, 'GBP');
    expect(tour.vehicle.dailyRate).toBe($(140));
    expect(tour.fuel.pricePerGallon).toBe($(4.1));
    expect(tour.lodgingPerNightDefault).toBe($(200));
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([$(200), $(90), $(200)]);
    expect(missingFigures(tour)).toEqual([]);
  });

  it('keeps a night that was planned by hand among estimated ones', () => {
    const tour = dollarRun();
    finishSetup(tour);
    tour.dates[1].lodging.plan = $(90);
    setCurrency(tour, 'EUR');
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, $(90), 0]);
    expect(missingFigures(tour)).not.toContain('lodging');
  });

  it('changes nothing else between two currencies that have no estimates', () => {
    const tour = euroRun();
    tour.vehicle.dailyRate = $(95);
    finishSetup(tour);
    const before = structuredClone(tour);
    setCurrency(tour, 'GBP');
    expect(tour).toEqual({ ...before, currency: 'GBP' });
  });
});
