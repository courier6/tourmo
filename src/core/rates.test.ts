// The rates a plan is worked out from: typed, worked out from the dates, or
// estimated by region. The estimates here use fixed figures, so the tests do
// not move when src/data/estimates.json is refreshed.

import { afterEach, describe, expect, it } from 'vitest';
import rows from '../data/cities.json';
import {
  blankTour,
  budget,
  carryOver,
  currentEstimates,
  dollars,
  ESTIMATES,
  finishSetup,
  foodPlan,
  fuelPlan,
  gasPriceIn,
  isEstimates,
  keepEstimates,
  lodgingFor,
  matchCity,
  prepareCities,
  resetFigures,
  roomRate,
  routeMiles,
  seedTours,
  setFigures,
  stateOf,
  tourRates,
  tourSpan,
  type Estimates,
  type Tour,
  type TourDate,
} from './index';

const $ = dollars;
const flat = (rate: number) => Array<number>(12).fill(rate);

const data: Estimates = {
  gas: { asOf: '2026-11-09', source: 'test', us: 4, regions: { R1Y: 4.1, R20: 3.8, R30: 3.5, R40: 3.9, R5XCA: 4.6, R50: 5.1 }, states: { TX: 3.4, CA: 5.52 } },
  lodging: {
    fiscalYear: 2027,
    source: 'test',
    standard: 113,
    areas: [
      { name: 'Dallas', state: 'TX', counties: 'Dallas', months: flat(184) },
      { name: 'Lakeside', state: 'OK', counties: 'Lake', months: [120, 120, 120, 120, 120, 200, 200, 200, 120, 120, 120, 120] },
    ],
  },
  van: { asOf: '2026-08', source: 'test', dailyRate: 215, mpg: 15 },
};

const day = (id: string, date: string, city: string, extra: Partial<TourDate> = {}): TourDate => ({
  id,
  date,
  city,
  kind: 'show',
  merch: { plan: 0 },
  lodging: { plan: 0 },
  fuelFillUps: [],
  lines: [],
  settled: false,
  ...extra,
});

/** Dallas, Tulsa, Wichita and home, with every drive typed so the miles are fixed. */
const run = (): Tour => {
  const t = blankTour('t1', 'Summer run', 'Dallas, TX');
  t.dates = [day('a', '2027-06-04', 'Dallas, TX'), day('b', '2027-06-05', 'Tulsa, OK', { milesFromPrevious: 260 }), day('c', '2027-06-06', 'Wichita, KS', { milesFromPrevious: 180 })];
  t.milesHome = 360;
  return t;
};

describe('gas by region', () => {
  it('reads the state from a city', () => {
    expect(stateOf('Tulsa, OK')).toBe('OK');
    expect(stateOf('St. Louis, mo ')).toBe('MO');
    expect(stateOf('Tulsa')).toBeUndefined();
    expect(stateOf('')).toBeUndefined();
  });

  it("uses a state's own price, then its region's, then the U.S. average", () => {
    expect(gasPriceIn('TX', data)).toBe(3.4);
    expect(gasPriceIn('OK', data)).toBe(3.8); // Midwest
    expect(gasPriceIn('LA', data)).toBe(3.5); // Gulf Coast
    expect(gasPriceIn('WA', data)).toBe(4.6); // West Coast outside California
    expect(gasPriceIn('CA', data)).toBe(5.52);
    expect(gasPriceIn('ON', data)).toBe(4); // Canada is not covered
    expect(gasPriceIn('CT', data)).toBe(4); // a region missing from the figures
    expect(gasPriceIn(undefined, data)).toBe(4);
  });

  it('prices a tour by where it drives, at the dearer end of each drive', () => {
    // Every drive touches Oklahoma or Kansas (3.80), dearer than Texas (3.40).
    expect(tourRates(run(), data).gasPrice).toMatchObject({ value: 380, typed: false, estimated: true });
    expect(tourRates(run(), data).gasPrice.basis).toBe('regular gas in TX, OK and KS, week of Nov 9, 2026, rounded up');
  });

  it('plans a tour through California higher than one that stays in Texas', () => {
    const texas = blankTour('t2', 'Texas run', 'Dallas, TX');
    texas.dates = [day('a', '2027-06-04', 'Austin, TX', { milesFromPrevious: 195 })];
    texas.milesHome = 195;
    const west = blankTour('t3', 'West run', 'Phoenix, AZ');
    west.dates = [day('a', '2027-06-04', 'Los Angeles, CA', { milesFromPrevious: 370 }), day('b', '2027-06-05', 'Portland, OR', { milesFromPrevious: 960 })];
    west.milesHome = 1270;
    expect(tourRates(texas, data).gasPrice.value).toBe(340);
    // 370 mi at 5.52, 960 at 5.52 and 1,270 at 4.60: 5.07, rounded up to the next 5 cents.
    expect(tourRates(west, data).gasPrice.value).toBe(510);
  });

  it("falls back to the home state, then the U.S. average, before there are drives", () => {
    expect(tourRates(blankTour('t1', 'New', 'Dallas, TX'), data).gasPrice.value).toBe(340);
    expect(tourRates(blankTour('t1', 'New'), data).gasPrice.value).toBe(400);
  });

  it('rounds up, never down', () => {
    const odd = { ...data, gas: { ...data.gas, us: 3.995 } };
    expect(tourRates(blankTour('t1', 'New'), odd).gasPrice.value).toBe(400);
    expect(tourRates(blankTour('t1', 'New'), { ...data, gas: { ...data.gas, us: 4.001 } }).gasPrice.value).toBe(405);
  });
});

describe('lodging by where the tour sleeps', () => {
  it('uses an area rate for its month, and the standard rate elsewhere', () => {
    expect(roomRate('Dallas', 'TX', '2027-06-04', data)).toBe(184);
    expect(roomRate('Lakeside', 'OK', '2027-06-04', data)).toBe(200);
    expect(roomRate('Lakeside', 'OK', '2027-01-04', data)).toBe(120);
    expect(roomRate('Lakeside', 'TX', '2027-06-04', data)).toBe(113); // same name, another state
    expect(roomRate(undefined, 'OK', '2027-06-04', data)).toBe(113);
  });

  it('averages the nights away from home, times the rooms, rounded up to $5', () => {
    // Dallas is home. Tulsa and Wichita are at the standard 113: 2 rooms is 226.
    expect(tourRates(run(), data).lodgingPerNight).toMatchObject({ value: $(230), typed: false });
    const t = run();
    t.dates[1].place = { lat: 0, lon: 0, area: 'Lakeside' }; // 200 in June
    expect(tourRates(t, data).lodgingPerNight.value).toBe($(315)); // (200 + 113) / 2 × 2 = 313
    t.lodgingRooms = 3;
    expect(tourRates(t, data).lodgingPerNight.value).toBe($(470)); // 469.5
    t.lodgingRooms = 1;
    expect(tourRates(t, data).lodgingPerNight.basis).toBe('1 room at about $157 each, the federal lodging rate averaged over the 2 nights away');
  });

  it('uses the standard rate before there are nights away', () => {
    expect(tourRates(blankTour('t1', 'New', 'Dallas, TX'), data).lodgingPerNight.value).toBe($(230));
  });
});

describe('van', () => {
  it('works the days out from the dates: every day out plus one to take it back', () => {
    const t = run();
    expect(tourRates(t, data).vanDays).toMatchObject({ value: 4, typed: false, estimated: false });
    t.dates.push(day('d', '2027-06-09', 'Omaha, NE', { milesFromPrevious: 300 }));
    expect(tourRates(t, data).vanDays.value).toBe(7);
    expect(tourSpan(t)).toEqual({ start: '2027-06-04', end: '2027-06-10' });
    expect(tourRates(blankTour('t1', 'New'), data).vanDays.value).toBe(0);
  });

  it('lets the days be set by hand, and says what they would be', () => {
    const t = run();
    t.vehicle.days = 6;
    expect(tourRates(t, data).vanDays).toMatchObject({ value: 6, typed: true, estimate: 4 });
  });

  it('estimates the daily rate and mileage until they are typed', () => {
    const t = run();
    expect(tourRates(t, data).vanDailyRate).toMatchObject({ value: $(215), typed: false, estimated: true });
    expect(tourRates(t, data).mpg).toMatchObject({ value: 15, typed: false });
    t.vehicle.dailyRate = 0; // the band's own van
    t.fuel.mpg = 18;
    expect(tourRates(t, data).vanDailyRate).toMatchObject({ value: 0, typed: true, estimated: false, estimate: $(215) });
    expect(tourRates(t, data).mpg).toMatchObject({ value: 18, typed: true });
  });
});

describe('the plan from estimates', () => {
  it('has no zeros where a figure can be estimated', () => {
    const t = run();
    finishSetup(t);
    const lines = Object.fromEntries(budget(t).expenses.map((l) => [l.id, l]));
    // Bundled figures, so only the shape is checked here.
    expect(lines.vehicle.plan).toBeGreaterThan(0);
    expect(lines.fuel.plan).toBe(fuelPlan(t));
    expect(lines.fuel.plan).toBeGreaterThan(0);
    expect(lines.lodging.plan).toBeGreaterThan(0);
    expect(lines.vehicle.how).toContain('(estimate) × 4 days');
    expect(lines.fuel.how).toContain(`Route: ${routeMiles(t)} mi ÷ 15 mpg`);
    expect(lines.fuel.how).toContain('(estimate)');
    expect(lines.lodging.how).toContain('(estimate) × 2 nights');
  });

  it('leaves merch out until the band sets a figure', () => {
    const t = run();
    expect(tourRates(t, data).merchPerShow).toMatchObject({ value: 0, typed: false, estimated: false });
    finishSetup(t);
    expect(budget(t).revenue[1].plan).toBe(0);
  });

  it('keeps the estimates when setup ends, so a later refresh does not move the plan', () => {
    const t = run();
    t.fuel.mpg = 17; // the band's own figure
    keepEstimates(t, data);
    expect(t.vehicle.dailyRate).toBe($(215));
    expect(t.fuel.pricePerGallon).toBe(380);
    expect(t.lodgingPerNightDefault).toBe($(230));
    expect(t.fuel.mpg).toBe(17);
    expect(t.vehicle.days).toBeUndefined(); // days stay worked out from the dates
    expect(t.perDiem).toBe($(20));
    expect([...(t.estimated ?? [])].sort()).toEqual(['gasPrice', 'lodgingPerNight', 'perDiem', 'vanDailyRate']);

    const later: Estimates = { ...data, gas: { ...data.gas, us: 6, regions: {}, states: {} }, van: { ...data.van, dailyRate: 400 } };
    const rates = tourRates(t, later);
    expect(rates.gasPrice).toMatchObject({ value: 380, typed: true, estimated: true, estimate: 600 });
    expect(rates.vanDailyRate).toMatchObject({ value: $(215), estimate: $(400) });
    expect(rates.mpg).toMatchObject({ value: 17, estimated: false });
  });

  it('fills each date from the estimates when setup ends', () => {
    const t = run();
    finishSetup(t);
    const night = tourRates(t).lodgingPerNight.value;
    expect(t.setup).toBeUndefined();
    expect(t.dates.map((d) => d.lodging.plan)).toEqual([0, night, night]); // no room at home
    expect(night).toBeGreaterThan(0);
  });
});

describe('each night planned for its own city', () => {
  const t = (): Tour => {
    const tour = run();
    tour.dates[1].place = { lat: 0, lon: 0, area: 'Lakeside' }; // Tulsa stands in for a dear area: 200 in June
    return tour;
  };

  it('uses that city\'s rate, so a dear city is planned dearer', () => {
    const tour = t();
    expect(lodgingFor(tour, tour.dates[0], data)).toBe(0); // at home
    expect(lodgingFor(tour, tour.dates[1], data)).toBe($(400)); // 2 rooms at 200
    expect(lodgingFor(tour, tour.dates[2], data)).toBe($(230)); // 2 rooms at the standard 113, rounded up
    expect(lodgingFor(tour, { city: 'Tulsa, OK', place: tour.dates[1].place, date: '2027-01-10' }, data)).toBe($(240)); // 120 in January
  });

  it('follows the rooms', () => {
    const tour = t();
    tour.lodgingRooms = 1;
    expect(lodgingFor(tour, tour.dates[1], data)).toBe($(200));
  });

  it('gives way to a figure the band typed, for every night away', () => {
    const tour = t();
    tour.lodgingPerNightDefault = $(150);
    expect(tour.dates.map((d) => lodgingFor(tour, d, data))).toEqual([0, $(150), $(150)]);
  });

  it('still estimates by city when the tour only holds a kept estimate', () => {
    const tour = t();
    keepEstimates(tour, data); // the tour-wide figure is now the average, marked as an estimate
    expect(tour.lodgingPerNightDefault).toBe($(315));
    expect(lodgingFor(tour, tour.dates[1], data)).toBe($(400));
    expect(lodgingFor(tour, { city: 'Omaha, NE', date: '2027-06-08' }, data)).toBe($(230));
  });

  it('copes with a date that has no day or city yet', () => {
    expect(lodgingFor(t(), { city: '', date: '' }, data)).toBe($(230));
  });
});

describe('people and food', () => {
  const foodLine = (t: Tour) => budget(t).expenses.find((l) => l.kind === 'food');

  it('plans food for everyone, every day from the first date to the last', () => {
    const t = run();
    expect(tourRates(t, data)).toMatchObject({ people: 4, perDiem: { value: $(20), typed: false, estimated: true } });
    expect(foodPlan(t)).toBe($(240)); // $20 × 4 people × 3 days
    t.people = 5;
    t.perDiem = $(25);
    expect(foodPlan(t)).toBe($(375));
    expect(foodLine(t)).toMatchObject({ plan: $(375), how: '$25 × 5 people × 3 days' });
  });

  it('has no food line when the per diem is 0 and nothing was spent', () => {
    const t = run();
    t.perDiem = 0;
    expect(foodLine(t)).toBeUndefined();
    t.dates[1].food = $(35);
    expect(foodLine(t)).toMatchObject({ plan: 0, now: $(35) });
  });

  it('counts food as the larger of plan and spent until spending is finished', () => {
    const t = run();
    t.dates[0].food = $(60);
    t.dates[1].food = $(95);
    expect(foodLine(t)).toMatchObject({ plan: $(240), now: $(240), progress: '$155 spent, $85 left' });
    t.foodFinal = true;
    expect(foodLine(t)?.now).toBe($(155));
    t.dates[2].food = $(120);
    expect(foodLine(t)).toMatchObject({ now: $(275), progress: '$275 spent, $35 over' });
  });

  it('plans a room for every two people, unless the band set the rooms', () => {
    const t = run();
    expect(tourRates(t, data).rooms).toBe(2);
    t.people = 5;
    expect(tourRates(t, data).rooms).toBe(3);
    expect(lodgingFor(t, t.dates[2], data)).toBe($(340)); // 3 rooms at the standard 113, rounded up
    t.lodgingRooms = 1;
    expect(tourRates(t, data).rooms).toBe(1);
  });
});

describe('fresher figures', () => {
  afterEach(resetFigures);

  it('are used by every estimate once they are given', () => {
    expect(currentEstimates()).toBe(ESTIMATES);
    expect(setFigures(data)).toBe(true);
    expect(currentEstimates()).toBe(data);
    expect(gasPriceIn('TX')).toBe(3.4);
    expect(tourRates(run()).gasPrice.value).toBe(380);
    expect(tourRates(run()).vanDailyRate.value).toBe($(215));
    resetFigures();
    expect(currentEstimates()).toBe(ESTIMATES);
  });

  it('are refused, leaving things as they were, when anything is missing', () => {
    const broken: unknown[] = [
      null,
      'figures',
      {},
      { ...data, gas: undefined },
      { ...data, gas: { ...data.gas, us: 'four' } },
      { ...data, gas: { ...data.gas, us: 0 } },
      { ...data, gas: { ...data.gas, asOf: 'last week' } },
      { ...data, gas: { ...data.gas, regions: { R20: 'cheap' } } },
      { ...data, lodging: { ...data.lodging, standard: undefined } },
      { ...data, lodging: { ...data.lodging, areas: [{ name: 'Dallas', state: 'TX', months: [184] }] } },
      { ...data, van: { ...data.van, mpg: 0 } },
      { ...data, van: undefined },
    ];
    for (const figures of broken) {
      expect(isEstimates(figures)).toBe(false);
      expect(setFigures(figures)).toBe(false);
    }
    expect(currentEstimates()).toBe(ESTIMATES);
    expect(isEstimates(data)).toBe(true);
    expect(isEstimates(ESTIMATES)).toBe(true);
    // What the lookup server sends carries a few extra fields.
    expect(isEstimates({ ...data, live: true, fetchedAt: 1 })).toBe(true);
  });
});

describe('starting from the last tour', () => {
  it('has nothing to carry over when the band has only the samples', () => {
    expect(carryOver([])).toBeUndefined();
    expect(carryOver(seedTours())).toBeUndefined();
    expect(carryOver([run()])).toBeUndefined(); // still being set up
  });

  it("carries the band's own figures, not the estimates it was given", () => {
    const last = run();
    last.name = 'Winter run';
    last.commissions = [{ id: 'agent', name: 'Agent', rate: 0.1, base: 'show' }];
    last.vehicle.dailyRate = $(140);
    last.merchPerShowDefault = $(200);
    last.lodgingRooms = 3;
    last.people = 5;
    last.perDiem = $(25);
    last.dates[1].merch.actual = $(260);
    last.dates[2].merch.actual = $(331);
    keepEstimates(last, data); // gas, mileage and lodging were estimates
    delete last.setup;

    const older = run();
    older.id = 't0';
    older.dates.forEach((d) => (d.date = d.date.replace('2027', '2026')));
    older.vehicle.dailyRate = $(99);
    delete older.setup;

    const carried = carryOver([...seedTours(), last, older]);
    expect(carried).toEqual({
      from: 'Winter run',
      commissions: [{ id: 'agent', name: 'Agent', rate: 0.1, base: 'show' }],
      dailyRate: $(140),
      mpg: undefined, // an estimate last time, so estimated again
      merchPerShow: $(295), // what the two shows really sold, to the nearest $5
      lodgingPerNight: undefined,
      lodgingRooms: 3,
      people: 5,
      perDiem: $(25),
    });

    const next = blankTour('t9', 'Summer run', 'Dallas, TX', undefined, carried);
    expect(next.ratesFrom).toBe('Winter run');
    expect(tourRates(next, data).vanDailyRate).toMatchObject({ value: $(140), typed: true, estimated: false });
    expect(tourRates(next, data).merchPerShow.value).toBe($(295));
    expect(tourRates(next, data).gasPrice.typed).toBe(false);
    expect(next.commissions).not.toBe(last.commissions);
  });
});

describe('the bundled figures', () => {
  it('have everything the estimates read', () => {
    expect(ESTIMATES.gas.us).toBeGreaterThan(1);
    expect(ESTIMATES.gas.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const code of ['R1X', 'R1Y', 'R1Z', 'R20', 'R30', 'R40', 'R5XCA']) expect(ESTIMATES.gas.regions[code]).toBeGreaterThan(1);
    expect(ESTIMATES.gas.states.CA ?? ESTIMATES.gas.regions.R50).toBeGreaterThan(1);
    expect(ESTIMATES.lodging.standard).toBeGreaterThan(50);
    expect(ESTIMATES.lodging.areas.length).toBeGreaterThan(100);
    for (const area of ESTIMATES.lodging.areas) expect(area.months).toHaveLength(12);
    expect(ESTIMATES.van.dailyRate).toBeGreaterThan(50);
    expect(ESTIMATES.van.mpg).toBeGreaterThan(5);
    expect(ESTIMATES.van.asOf).toMatch(/^\d{4}-\d{2}$/);
  });

  it('give every state a gas price', () => {
    const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
    expect(states).toHaveLength(51);
    const regional = new Set([...Object.values(ESTIMATES.gas.regions), ...Object.values(ESTIMATES.gas.states)]);
    for (const state of states) expect(regional.has(gasPriceIn(state))).toBe(true);
  });

  it('tie cities to the lodging areas by name', () => {
    const cities = prepareCities(rows);
    const tagged = cities.filter((c) => c.area !== undefined);
    expect(tagged.length).toBeGreaterThan(1000);
    const names = new Set(ESTIMATES.lodging.areas.map((a) => `${a.name}|${a.state}`));
    for (const c of tagged) expect(names.has(`${c.area}|${c.state}`)).toBe(true);
    const dallas = matchCity(cities, 'Dallas, TX')!;
    expect(roomRate(dallas.area, dallas.state, '2027-06-04')).toBeGreaterThan(ESTIMATES.lodging.standard);
    expect(matchCity(cities, 'Washington, DC')!.area).toBeDefined();
  });
});
