// The tour list and the new-tour steps: sample tours, a blank tour, the
// defaults applied when setup ends, and where a tour sits against today.

import { describe, expect, it } from 'vitest';
import { blankTour, budget, dollars, finishSetup, isTour, SAMPLE_TOUR_IDS, seedTours, suggestedVanDays, tourPhase, type Tour, type TourDate } from './index';

const $ = dollars;

const day = (id: string, date: string, city: string, kind: TourDate['kind'] = 'show'): TourDate => ({
  id,
  date,
  city,
  kind,
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
});

describe('sample tours', () => {
  const tours = seedTours();

  it('lists the ids of every sample', () => {
    expect(tours.map((t) => t.id)).toEqual(SAMPLE_TOUR_IDS);
  });

  it('has two finished tours before Spring run', () => {
    expect(tours.map((t) => tourPhase(t, t.demoToday ?? '2026-11-14'))).toEqual(['past', 'past', 'underway']);
    for (const t of tours.slice(0, 2)) expect(t.dates.every((d) => d.settled)).toBe(true);
  });

  it('works out the finished tours to the dollar', () => {
    // Summer weekender: shows 700 + 500 + 240, merch 350; out: 25% of 1,440,
    // van 495, fuel 188, lodging 355 and a 450 tyre.
    expect(budget(tours[0]).now.net).toBe($(1440 + 350 - 360 - 495 - 188 - 355 - 450));
    // Fall run: shows 1,120 + 750 + 1,280 + 600, merch 1,070; out: 25% of
    // 3,750 (375 + 563), van 600, fuel 204, lodging 555.
    expect(budget(tours[1]).now.net).toBe($(3750 + 1070 - 375 - 563 - 600 - 204 - 555));
  });
});

describe('a new tour', () => {
  it('starts empty, at the dates step, and budgets to zero', () => {
    const tour = blankTour('t1', 'Summer run', 'Dallas, TX');
    expect(tour.setup).toBe('dates');
    expect(tourPhase(tour, '2027-01-01')).toBe('setup');
    const b = budget(tour);
    expect(b.plan.net).toBe(0);
    expect(b.now.net).toBe(0);
  });

  it('suggests van days from the dates: every day out plus one to return it', () => {
    const tour = blankTour('t1', 'Summer run');
    expect(suggestedVanDays(tour)).toBe(0);
    tour.dates = [day('a', '2027-06-04', 'Tulsa, OK')];
    expect(suggestedVanDays(tour)).toBe(2);
    tour.dates.push(day('b', '2027-06-08', 'Omaha, NE'));
    expect(suggestedVanDays(tour)).toBe(6);
  });

  it('fills each date from the defaults when setup ends', () => {
    const tour: Tour = blankTour('t1', 'Summer run', 'Dallas, TX');
    tour.merchPerShowDefault = $(300);
    tour.lodgingPerNightDefault = $(200);
    tour.dates = [day('a', '2027-06-04', 'dallas, tx '), day('b', '2027-06-05', 'Tulsa, OK'), day('c', '2027-06-06', 'Wichita, KS', 'off')];
    finishSetup(tour);
    expect(tour.setup).toBeUndefined();
    expect(tour.dates.map((d) => d.merch.plan)).toEqual([$(300), $(300), 0]);
    expect(tour.dates.map((d) => d.lodging.plan)).toEqual([0, $(200), $(200)]);
  });

  it('plans lodging for every night when no home city was given', () => {
    const tour = blankTour('t1', 'Summer run');
    tour.lodgingPerNightDefault = $(150);
    tour.dates = [day('a', '2027-06-04', '')];
    finishSetup(tour);
    expect(tour.dates[0].lodging.plan).toBe($(150));
  });
});

describe('where a tour sits against today', () => {
  const tour = blankTour('t1', 'Summer run');
  delete tour.setup;

  it('counts a tour with no dates as upcoming', () => {
    expect(tourPhase(tour, '2027-06-01')).toBe('upcoming');
  });

  it('runs from the first date to the day the van goes back', () => {
    const t = { ...tour, vehicle: { dailyRate: 0, days: 4 }, dates: [day('a', '2027-06-04', 'Tulsa, OK'), day('b', '2027-06-06', 'Omaha, NE')] };
    expect(tourPhase(t, '2027-06-03')).toBe('upcoming');
    expect(tourPhase(t, '2027-06-04')).toBe('underway');
    expect(tourPhase(t, '2027-06-07')).toBe('underway');
    expect(tourPhase(t, '2027-06-08')).toBe('past');
  });
});

describe('saved data', () => {
  it('accepts every sample tour and a blank one, after a round trip through storage', () => {
    for (const t of [...seedTours(), blankTour('t1', 'Summer run')]) expect(isTour(JSON.parse(JSON.stringify(t)))).toBe(true);
  });

  it('refuses anything the screens could not show', () => {
    const [tour] = seedTours();
    const without = (key: string) => {
      const copy = JSON.parse(JSON.stringify(tour));
      delete copy[key];
      return copy;
    };
    for (const key of ['id', 'name', 'commissions', 'vehicle', 'fuel', 'dates', 'lines']) expect(isTour(without(key))).toBe(false);
    const badDate = JSON.parse(JSON.stringify(tour));
    delete badDate.dates[0].lines;
    expect(isTour(badDate)).toBe(false);
    for (const junk of [null, undefined, 'tour', 7, [], {}]) expect(isTour(junk)).toBe(false);
  });
});
