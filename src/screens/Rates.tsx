// Rates setup is not in the mockups either. Changes save as they are typed.
// The sections are shared with the last step of setting up a new tour.

import { useState } from 'react';
import { CURRENCY_OPTIONS, currencyOf, DEFAULT_PEOPLE, findLine, foodPlan, formatNumber, formatPercent, fuelPlan, distanceNumber, formatMileage, fuelPriceIn, legHome, mileageIn, mpgFrom, newId, peopleOn, perGallonFrom, routeMiles, setCurrency, setUnits, tourDays, tourRates, UNIT_WORDS, UNITS_OPTIONS, unitsOf, type Commission, type Currency, type EstimatedRate, type Money, type Rate, type Tour, type Units } from '../core';
import { Amount, Back, Check, MoneyField, NumberField, SelectField, TextField } from '../components';
import { useMoney } from '../currency';
import { go } from '../router';
import { useTour, useTours } from '../store';
import { CityField, MilesField } from '../CityField';

/** Cents as the dollars a field shows: "215" or "5.60". */
const asDollars = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

/** What a field's grey figure is and where it comes from, or how to get back to it. */
function rateNote(name: string, r: Rate, show: (n: number) => string, extra = ''): string {
  if (!r.typed) return `${name}: ${show(r.estimate)}, ${r.basis}.${extra}`;
  if (r.estimated) return `${name}: an estimate kept from when the tour was set up. Clear it for today's (${show(r.estimate)}), or type your own.`;
  return r.value === r.estimate ? '' : `${name}: your figure. Clear it to use the estimate (${show(r.estimate)}).`;
}

function Notes({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.filter(Boolean).map((line) => (
        <p className="note" style={{ marginTop: 8 }} key={line}>
          {line}
        </p>
      ))}
    </>
  );
}

/** Typing in a rate makes it the band's own figure, no longer a kept estimate. */
function useSetRate() {
  const { update } = useTour();
  return (key: EstimatedRate, write: (t: Tour) => void) =>
    update((t) => {
      write(t);
      t.estimated = t.estimated?.filter((k) => k !== key);
    });
}

/** A kept lodging estimate is worked out from the rooms, so it is let go when they change. */
function releaseLodgingEstimate(t: Tour) {
  if (!t.estimated?.includes('lodgingPerNight')) return;
  delete t.lodgingPerNightDefault;
  t.estimated = t.estimated.filter((k) => k !== 'lodgingPerNight');
}

/** Who travels, and what feeding them comes to. The headcount also sets the rooms. */
export function PeopleSection({ planning = false }: { planning?: boolean }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const setRate = useSetRate();
  const { perDiem, people } = tourRates(tour);
  const days = tourDays(tour);
  return (
    <section className="section" aria-labelledby="r-people">
      <div className="section-head">
        <h2 className="heading" id="r-people">
          People and food
        </h2>
        <Amount value={foodPlan(tour)} />
      </div>
      <div className="grid-2">
        <NumberField
          label="People on the road"
          suffix="people"
          value={tour.people}
          placeholder={String(DEFAULT_PEOPLE)}
          onChange={(v) =>
            update((t) => {
              t.people = v;
              // The rooms follow the headcount unless the band set them.
              if (t.lodgingRooms === undefined) releaseLodgingEstimate(t);
            })
          }
        />
        <MoneyField label="Food, each, a day" value={tour.perDiem} placeholder={asDollars(perDiem.estimate)} onChange={(v) => setRate('perDiem', (t) => (t.perDiem = v))} />
      </div>
      <Notes
        lines={[
          tour.people === undefined ? `People: ${DEFAULT_PEOPLE} until you say otherwise. Count everyone who travels, hired players and crew too.` : '',
          rateNote('Food', perDiem, money, ' Type 0 to leave food out of the plan.'),
          days ? `The food plan is ${people} ${people === 1 ? 'person' : 'people'} × ${days} ${days === 1 ? 'day' : 'days'} × the daily figure.` : 'The food plan is worked out once there are dates.',
          planning ? '' : 'What is spent on food is entered on each date.',
        ]}
      />
      {!planning && (
        <>
          <Check label="Food spending is finished" checked={!!tour.foodFinal} onChange={(v) => update((t) => (t.foodFinal = v))} />
          <p className="note">Until this is ticked, food counts as the larger of the plan and what has been spent.</p>
        </>
      )}
    </section>
  );
}

export function CommissionsSection() {
  const { tour, update } = useTour();
  const setCommission = (id: string, change: (c: Commission) => void) =>
    update((t) => {
      const c = t.commissions.find((x) => x.id === id);
      if (c) change(c);
    });
  const add = (name: string, rate: number) => update((t) => t.commissions.push({ id: newId('comm'), name, rate, base: 'show' }));
  const has = (word: RegExp) => tour.commissions.some((c) => word.test(c.name));

  return (
    <section className="section" aria-labelledby="r-comm">
      <div className="section-head">
        <h2 className="heading" id="r-comm">
          Commissions
        </h2>
      </div>
      {tour.commissions.length === 0 && (
        <p className="note" style={{ marginTop: 8 }}>
          Nobody takes a cut yet. 10% for a booking agent and 15% for a manager are the usual starting points; change them to your own deals.
        </p>
      )}
      {tour.commissions.map((c) => (
        <fieldset key={c.id} style={{ border: 0, padding: 0, margin: 0, borderBottom: '1px solid var(--hairline)', paddingBottom: 12 }}>
          <legend className="sr-only">{c.name || 'Commission'}</legend>
          <div className="grid-2">
            <TextField label="Who" value={c.name} onChange={(v) => setCommission(c.id, (x) => (x.name = v))} />
            <NumberField label="Rate" suffix="%" emptyIsZero value={Math.round(c.rate * 10000) / 100} onChange={(v) => setCommission(c.id, (x) => (x.rate = (v ?? 0) / 100))} />
          </div>
          <SelectField
            label="Taken of"
            value={c.base}
            onChange={(v) => setCommission(c.id, (x) => (x.base = v))}
            options={[
              ['show', 'Show income only'],
              ['show+merch', 'Show income and merch'],
            ]}
          />
          <button className="text-btn" type="button" onClick={() => update((t) => (t.commissions = t.commissions.filter((x) => x.id !== c.id)))}>
            Remove {c.name || 'this commission'}
          </button>
        </fieldset>
      ))}
      {(!has(/agent/i) || !has(/manager/i)) && (
        <div className="btn-row">
          {!has(/agent/i) && (
            <button className="btn quiet" type="button" onClick={() => add('Agent', 0.1)}>
              Add an agent, 10%
            </button>
          )}
          {!has(/manager/i) && (
            <button className="btn quiet" type="button" onClick={() => add('Manager', 0.15)}>
              Add a manager, 15%
            </button>
          )}
        </div>
      )}
      <button className="btn quiet" type="button" onClick={() => add('', 0.1)}>
        Add someone else
      </button>
    </section>
  );
}

/** `planning` leaves out what has been paid, for a tour that has not started. */
export function VanSection({ planning = false }: { planning?: boolean }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const setRate = useSetRate();
  const { vanDailyRate, vanDays } = tourRates(tour);
  // A daily rate of 0 that the band set is a van that is not rented.
  const own = tour.vehicle.dailyRate === 0 && !tour.estimated?.includes('vanDailyRate');
  const paid = tour.vehicle.actual !== undefined;
  const daysNote = !vanDays.typed
    ? tour.dates.length
      ? `Days: worked out from the dates, ${vanDays.basis}.`
      : 'Days: worked out from the dates, once there are some.'
    : vanDays.value === vanDays.estimate
      ? ''
      : `Days: your figure. Clear it to have them worked out from the dates (${vanDays.estimate}).`;
  return (
    <section className="section" aria-labelledby="r-van">
      <div className="section-head">
        <h2 className="heading" id="r-van">
          Van
        </h2>
        <Amount value={Math.round(vanDailyRate.value * vanDays.value)} />
      </div>
      <SelectField
        label="The van is"
        value={own ? 'own' : 'rented'}
        onChange={(v) =>
          setRate('vanDailyRate', (t) => {
            if (v === 'own') t.vehicle.dailyRate = 0;
            else delete t.vehicle.dailyRate;
          })
        }
        options={[
          ['rented', 'Rented'],
          ['own', 'Our own'],
        ]}
      />
      {own ? (
        <p className="note" style={{ marginTop: 8 }}>
          No rental is planned. Fuel is planned below. Repairs, insurance or wear can be added as an expense on the budget.
        </p>
      ) : (
        <>
          <div className="grid-2">
            <MoneyField label="Daily rate" value={tour.vehicle.dailyRate} placeholder={asDollars(vanDailyRate.estimate)} onChange={(v) => setRate('vanDailyRate', (t) => (t.vehicle.dailyRate = v))} />
            <NumberField label="Days" suffix="days" value={tour.vehicle.days} placeholder={String(vanDays.estimate)} onChange={(v) => update((t) => (t.vehicle.days = v))} />
          </div>
          <Notes lines={[rateNote('Daily rate', vanDailyRate, money, ' A quote with the waiver and tax in it is the better figure.'), daysNote]} />
        </>
      )}
      {!planning && (!own || paid) && (
        <>
          <MoneyField label="Paid so far" value={tour.vehicle.actual} onChange={(v) => update((t) => (t.vehicle.actual = v))} note="Leave empty until something is paid." />
          <Check label="That is the final van bill" checked={!!tour.vehicle.final} onChange={(v) => update((t) => (t.vehicle.final = v))} />
        </>
      )}
    </section>
  );
}

export function FuelSection({ planning = false }: { planning?: boolean }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const setRate = useSetRate();
  const { mpg, gasPrice } = tourRates(tour);
  const units = unitsOf(tour);
  const words = UNIT_WORDS[units];
  const metric = units === 'metric';
  // The tour holds miles per gallon and cents per gallon; the fields show the tour's units.
  const perUnit = (centsPerGallon: number) => money(fuelPriceIn(centsPerGallon, units));
  return (
    <section className="section" aria-labelledby="r-fuel">
      <div className="section-head">
        <h2 className="heading" id="r-fuel">
          Fuel
        </h2>
        <Amount value={fuelPlan(tour)} />
      </div>
      <div className="grid-2">
        <NumberField
          label={metric ? 'Fuel the van uses' : 'Van mileage'}
          suffix={words.mileage}
          value={tour.fuel.mpg === undefined ? undefined : mileageIn(tour.fuel.mpg, units)}
          placeholder={String(Math.round(mileageIn(mpg.estimate, units) * 10) / 10)}
          onChange={(v) => setRate('mpg', (t) => (t.fuel.mpg = v === undefined ? undefined : mpgFrom(v, units)))}
        />
        <MoneyField
          label={`Price per ${words.volume}`}
          value={tour.fuel.pricePerGallon === undefined ? undefined : fuelPriceIn(tour.fuel.pricePerGallon, units)}
          placeholder={asDollars(fuelPriceIn(gasPrice.estimate, units))}
          onChange={(v) => setRate('gasPrice', (t) => (t.fuel.pricePerGallon = v === undefined ? undefined : perGallonFrom(v, units)))}
        />
      </div>
      <Notes
        lines={[
          rateNote(metric ? 'Fuel used' : 'Mileage', mpg, (n) => formatMileage(n, units)),
          rateNote('Price', gasPrice, perUnit),
          metric
            ? `The fuel plan is the ${distanceNumber(routeMiles(tour), units)} route kilometres, times the litres used per 100 km, times the price.`
            : `The fuel plan is the ${formatNumber(routeMiles(tour))} route miles divided by the mileage, times the price.`,
        ]}
      />
      {!planning && (
        <>
          <Check label="Fuel buying is finished" checked={!!tour.fuel.final} onChange={(v) => update((t) => (t.fuel.final = v))} />
          <p className="note">Until this is ticked, fuel counts as the larger of the plan and what has been spent.</p>
        </>
      )}
    </section>
  );
}

export function DefaultsSection({ planning = false }: { planning?: boolean }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const setRate = useSetRate();
  const { merchPerShow, merchCost, lodgingPerNight, rooms } = tourRates(tour);
  return (
    <section className="section" aria-labelledby="r-defaults">
      <div className="section-head">
        <h2 className="heading" id="r-defaults">
          {planning ? 'Merch and lodging' : 'Defaults for new dates'}
        </h2>
      </div>
      <div className="grid-2">
        <MoneyField label="Merch per show" value={tour.merchPerShowDefault} placeholder={asDollars(merchPerShow.estimate)} onChange={(v) => update((t) => (t.merchPerShowDefault = v))} />
        <NumberField
          label="What merch costs you"
          suffix="%"
          value={tour.merchCostRate === undefined ? undefined : Math.round(tour.merchCostRate * 10000) / 100}
          placeholder={String(Math.round(merchCost.estimate * 10000) / 100)}
          onChange={(v) => setRate('merchCost', (t) => (t.merchCostRate = v === undefined ? undefined : v / 100))}
        />
      </div>
      <div className="grid-2">
        <NumberField
          label="Rooms a night"
          suffix="rooms"
          value={tour.lodgingRooms}
          placeholder={String(Math.ceil(peopleOn(tour) / 2))}
          onChange={(v) =>
            update((t) => {
              t.lodgingRooms = v;
              releaseLodgingEstimate(t);
            })
          }
        />
        <MoneyField label="Lodging per night" value={tour.lodgingPerNightDefault} placeholder={asDollars(lodgingPerNight.estimate)} onChange={(v) => setRate('lodgingPerNight', (t) => (t.lodgingPerNightDefault = v))} />
      </div>
      <Notes
        lines={[
          merchPerShow.typed ? '' : `Merch: ${merchPerShow.basis}. Type what a show usually sells.`,
          rateNote('Merch costs', merchCost, formatPercent, ' Type 0 to plan merch costs as an expense of their own.'),
          tour.lodgingRooms === undefined ? `Rooms: one for every two people, so ${rooms} for ${peopleOn(tour)}.` : '',
          rateNote('Lodging', lodgingPerNight, money) || `Lodging: your figure, so the ${rooms === 1 ? 'room' : 'rooms'} count is not used.`,
          planning
            ? 'Merch is planned for every show, and lodging for every night away from the home city. Each date can be changed later under Dates.'
            : 'Used when you add a date. To change a date already on the tour, edit it under Dates.',
        ]}
      />
    </section>
  );
}

export function Rates() {
  const { tour, update } = useTour();
  const { deleteTour } = useTours();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <header className="screen-head">
        <h1 className="title">Rates</h1>
        <p className="note">The figures the plan is worked out from. Changes save as you type.</p>
      </header>

      <section className="section" style={{ marginTop: 0 }} aria-labelledby="r-tour">
        <div className="section-head">
          <h2 className="heading" id="r-tour">
            Tour
          </h2>
        </div>
        <TextField label="Tour name" value={tour.name} onChange={(v) => update((t) => (t.name = v))} />
        <CityField
          label="Home city"
          value={tour.homeCity}
          place={tour.homePlace}
          onChange={(city, place) =>
            update((t) => {
              t.homeCity = city;
              t.homePlace = place;
            })
          }
          note="The route starts and ends here."
          units={unitsOf(tour)}
        />
        <MilesField
          label={`${UNIT_WORDS[unitsOf(tour)].Distances} home from the last date`}
          value={tour.milesHome}
          onChange={(v) => update((t) => (t.milesHome = v))}
          leg={legHome(tour)}
          units={unitsOf(tour)}
        />
        <SelectField<Currency> label="Currency" value={currencyOf(tour)} onChange={(v) => update((t) => setCurrency(t, v))} options={CURRENCY_OPTIONS} />
        <SelectField<Units> label="Distances and fuel" value={unitsOf(tour)} onChange={(v) => update((t) => setUnits(t, v))} options={UNITS_OPTIONS} />
        <Notes
          lines={[
            'Currency: every amount on this tour is in it. Changing it converts nothing: 1,000 stays 1,000.',
            'Distances and fuel: changing these converts the figures, so every drive and the fuel plan stay as they are.',
          ]}
        />
      </section>

      <PeopleSection />
      <CommissionsSection />
      <VanSection />
      <FuelSection />
      <DefaultsSection />

      <section className="section" aria-labelledby="r-delete">
        <div className="section-head">
          <h2 className="heading" id="r-delete">
            Delete
          </h2>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Everything is saved on this device only. Deleting a tour removes its dates and every figure entered, and cannot be undone.
        </p>
        <button
          className="btn plain"
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            deleteTour(tour.id);
            go('/tours');
          }}
        >
          {confirmDelete ? `Tap again to delete ${tour.name || 'this tour'} for good` : 'Delete this tour'}
        </button>
      </section>
    </main>
  );
}

/** A tour-wide extra line, reached by tapping it on the budget. */
export function LineEdit({ lineId }: { lineId: string }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const line = findLine(tour, lineId);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!line) {
    return (
      <main className="screen">
        <Back to="/budget/plan">Budget</Back>
        <p>That line is no longer on the tour.</p>
      </main>
    );
  }
  const out = line.direction === 'out';
  const set = (change: (l: NonNullable<typeof line>) => void) =>
    update((t) => {
      const l = t.lines.find((x) => x.id === lineId);
      if (l) change(l);
    });
  const setMoney = (key: 'plan' | 'actual') => (v: Money | undefined) => set((l) => (key === 'plan' ? (l.plan = v ?? 0) : (l.actual = v)));

  return (
    <main className="screen">
      <Back to="/budget/plan">Budget</Back>
      <header className="screen-head">
        <h1 className="title">{line.label || (out ? 'Expense' : 'Income')}</h1>
        <p className="note">
          {out ? 'A tour-wide expense' : 'Tour-wide income'} {'·'} plan {money(line.plan)}. Changes save as you type.
        </p>
      </header>
      <TextField label="Name" value={line.label} onChange={(v) => set((l) => (l.label = v))} />
      <MoneyField label="Planned amount" value={line.plan} onChange={setMoney('plan')} />
      <MoneyField
        label={out ? 'Paid so far' : 'Received so far'}
        value={line.actual}
        onChange={setMoney('actual')}
        note={`Leave empty until something is ${out ? 'paid' : 'received'}. Empty is not the same as 0.`}
      />
      <Check label="That is the final amount" checked={!!line.final} onChange={(v) => set((l) => (l.final = v))} />
      <p className="note">Until this is ticked, the line counts as the larger of the plan and what has been {out ? 'paid' : 'received'}.</p>
      <a className="btn" href="#/budget/actuals">
        Done
      </a>
      <button
        className="btn plain"
        type="button"
        onClick={() => {
          if (!confirmRemove) return setConfirmRemove(true);
          update((t) => (t.lines = t.lines.filter((x) => x.id !== lineId)));
          go('/budget/plan');
        }}
      >
        {confirmRemove ? 'Tap again to remove this line' : 'Remove this line'}
      </button>
    </main>
  );
}
