// Reading what an earlier visit saved: versions, damaged tours and date order.

import { describe, expect, it } from 'vitest';
import { blankTour, budget, SAMPLE_TOUR_IDS, seedTours, suggestedVanDays, type Tour, type TourDate } from './core';
import { backupOf, readSaved, withBackup } from './store';

const day = (id: string, date: string, city: string): TourDate => ({
  id,
  date,
  city,
  kind: 'show',
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
});

const own = (): Tour => {
  const t = blankTour('t1', 'Summer run', 'Dallas, TX');
  delete t.setup;
  t.dates = [day('a', '2027-06-04', 'Tulsa, OK'), day('b', '2027-06-05', 'Wichita, KS'), day('c', '2027-06-06', 'Denver, CO')];
  return t;
};

const text = (version: number, tours: unknown[], activeTourId = '') => JSON.stringify({ version, tours, activeTourId });

describe('saved tours', () => {
  it('are read back as they were saved', () => {
    const result = readSaved(text(4, [own()], 't1'));
    expect(result?.complete).toBe(true);
    expect(result?.data).toMatchObject({ version: 4, activeTourId: 't1' });
    expect(result?.data.tours.map((t) => t.id)).toEqual(['t1']);
  });

  it('have their dates put in order, since every screen takes them to be', () => {
    const tour = own();
    tour.dates.reverse();
    const read = readSaved(text(3, [tour]))?.data.tours[0];
    expect(read?.dates.map((d) => d.date)).toEqual(['2027-06-04', '2027-06-05', '2027-06-06']);
    expect(suggestedVanDays(read!)).toBe(4); // three days out and one to take the van back
  });

  it('leave out a tour that is not in a shape the screens read, and say so', () => {
    const damaged = { ...own(), id: 't2', commissions: [{ id: 'c1', name: 'Agent', rate: '10', base: 'show' }] };
    const result = readSaved(text(3, [own(), damaged]));
    expect(result?.complete).toBe(false);
    expect(result?.data.tours.map((t) => t.id)).toEqual(['t1']);
  });

  it('are refused whole when the text is not tours this version knows', () => {
    expect(readSaved('not json')).toBeUndefined();
    expect(readSaved('null')).toBeUndefined();
    expect(readSaved(text(5, [own()]))).toBeUndefined();
    expect(readSaved(JSON.stringify({ version: 3, tours: 'none' }))).toBeUndefined();
  });

  it('from version 1 gain the samples added since', () => {
    const [spring] = seedTours().filter((t) => t.id === SAMPLE_TOUR_IDS.at(-1));
    const result = readSaved(text(1, [spring, own()]));
    expect(result?.data.version).toBe(4);
    expect(result?.data.tours.map((t) => t.id).sort()).toEqual([...SAMPLE_TOUR_IDS, 't1'].sort());
  });

  it('from version 2 lose the zeros that only meant a rate was not entered', () => {
    const tour = own();
    tour.vehicle = { dailyRate: 0, days: 0 };
    tour.fuel = { mpg: 0, pricePerGallon: 0 };
    const read = readSaved(text(2, [tour]))?.data.tours[0];
    expect(read?.vehicle.days).toBeUndefined();
    expect(read?.fuel.mpg).toBeUndefined();
    // A tour past setup keeps a 0 it may have meant, such as no van rental.
    expect(read?.vehicle.dailyRate).toBe(0);
  });
});

describe('tours saved before food was planned', () => {
  it('keep the plan they had: a per diem of 0, not the estimate', () => {
    const read = readSaved(text(3, [own()]))?.data.tours[0];
    expect(read?.perDiem).toBe(0);
    expect(budget(read!).expenses.some((l) => l.kind === 'food')).toBe(false);
  });

  it('are left to be estimated while still being set up', () => {
    const tour = blankTour('t9', 'Winter run', 'Dallas, TX');
    expect(readSaved(text(3, [tour]))?.data.tours[0].perDiem).toBeUndefined();
  });

  it('keep a per diem already set', () => {
    expect(readSaved(text(4, [{ ...own(), perDiem: 2500 }]))?.data.tours[0].perDiem).toBe(2500);
  });
});

describe('a backup file', () => {
  it('reads back as the tours it was saved from, with none open', () => {
    const tours = [...seedTours(), own()];
    const result = readSaved(backupOf(tours));
    expect(result?.complete).toBe(true);
    expect(result?.data.activeTourId).toBe('');
    expect(result?.data.tours).toEqual(tours);
  });

  it('replaces a tour already held and adds the rest, removing nothing', () => {
    const held = [own(), { ...own(), id: 't2', name: 'Winter run' }];
    const backup = [{ ...own(), name: 'Summer run, from the file' }, { ...own(), id: 't3', name: 'Fall run' }];
    const after = withBackup(held, backup);
    expect(after.map((t) => [t.id, t.name]).sort()).toEqual([
      ['t1', 'Summer run, from the file'],
      ['t2', 'Winter run'],
      ['t3', 'Fall run'],
    ]);
  });
});
