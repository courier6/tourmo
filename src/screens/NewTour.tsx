// Setting up a new tour in three steps: name it, add the dates, set the
// rates. The tour is created at the end of step 1 and saved as it is filled
// in, so setup can be left and picked up again from the tour list. The rates
// step can be skipped: setup then ends at the dates.

import { useRef, useState } from 'react';
import { carryOver, CURRENCIES, CURRENCY_OPTIONS, currencyOf, describeLeg, finishSetup, formatDay, formatDistance, hasUsFigures, legHome, legInto, listed, missingFigures, newId, routeMiles, UNIT_WORDS, UNITS_OPTIONS, unitsOf, unknownLegs, type Currency, type DateKind, type Place, type TourDate, type Units } from '../core';
import { Back, SelectField, TextField } from '../components';
import { CityField, MilesField } from '../CityField';
import { go } from '../router';
import { useTour, useTours } from '../store';
import { CommissionsSection, DefaultsSection, FuelSection, PeopleSection, VanSection } from './Rates';

const STEPS = ['Name', 'Dates', 'Rates'];
const KIND_LABEL: Record<DateKind, string> = { show: 'Show', off: 'Off day', travel: 'Travel day' };

function Steps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="steps" aria-label="Setup steps">
      {STEPS.map((label, i) => (
        <li key={label} className={i + 1 < step ? 'done' : undefined} aria-current={i + 1 === step ? 'step' : undefined}>
          {i + 1}. {label}
          {i + 1 < step && <span className="sr-only">, done</span>}
        </li>
      ))}
    </ol>
  );
}

function Discard() {
  const { tour } = useTour();
  const { deleteTour } = useTours();
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      className="btn plain"
      type="button"
      onClick={() => {
        if (!confirm) return setConfirm(true);
        deleteTour(tour.id);
        go('/tours');
      }}
    >
      {confirm ? `Tap again to delete ${tour.name || 'this tour'} for good` : 'Discard this tour'}
    </button>
  );
}

export function NameStep() {
  const { tours, createTour } = useTours();
  const [name, setName] = useState('');
  const [home, setHome] = useState('');
  const [homePlace, setHomePlace] = useState<Place>();
  // A new tour is most often in the same currency and units as the last one.
  const [currency, setCurrency] = useState<Currency>(() => carryOver(tours)?.currency ?? 'USD');
  const [units, setUnits] = useState<Units>(() => carryOver(tours)?.units ?? 'us');
  const valid = name.trim() !== '';

  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <Steps step={1} />
      <header className="screen-head">
        <h1 className="title">Name the tour</h1>
        <p className="note">Three steps: a name, the dates, then the rates, which can wait until later. It is saved as you go, so you can stop and pick it up later.</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          createTour(name.trim(), home.trim(), homePlace, { currency, units });
          go('/setup/dates');
        }}
      >
        <TextField label="Tour name" value={name} onChange={setName} note="For example: Summer run" autoFocus />
        {/* The currency comes before the city: it decides whether the city is picked from the list or typed. */}
        <SelectField<Currency>
          label="Currency"
          value={currency}
          onChange={(c) => {
            setCurrency(c);
            // Dollars go with miles and gallons, the others with kilometres and litres. Either can still be changed.
            setUnits(c === 'USD' ? 'us' : 'metric');
          }}
          options={CURRENCY_OPTIONS}
        />
        <SelectField<Units> label="Distances and fuel" value={units} onChange={setUnits} options={UNITS_OPTIONS} />
        <p className="note" style={{ marginTop: 8 }}>
          Every amount on the tour is in this one currency. Both can be changed later under Rates.
          {currency !== 'USD' && ' The gas, lodging and van estimates are for the United States, so on this tour you type those three figures yourself.'}
        </p>
        <CityField
          label="Home city"
          value={home}
          place={homePlace}
          onChange={(city, place) => {
            setHome(city);
            setHomePlace(place);
          }}
          note={
            currency === 'USD'
              ? `Where you drive from and back to. Start typing and pick it from the list; the ${UNIT_WORDS[units].distances} are worked out from it.`
              : `Where the van starts from and comes back to: abroad, the city you pick it up in. The city list covers the United States and Canada only, so you type the ${UNIT_WORDS[units].distances} of each drive with the dates.`
          }
          units={units}
          list={currency === 'USD'}
        />
        <button className="btn" type="submit" disabled={!valid} style={valid ? undefined : { opacity: 0.5 }}>
          Next: add the dates
        </button>
      </form>
    </main>
  );
}

function nextDay(iso: string): string {
  return new Date(new Date(iso + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
}

export function DatesStep() {
  const { tour, update } = useTour();
  const units = unitsOf(tour);
  const words = UNIT_WORDS[units];
  // Drives are only worked out between cities of the list, which covers the United States and Canada.
  const list = hasUsFigures(tour);
  const last = tour.dates.at(-1);
  // The figures this tour has no estimate for, which a plan made without the rates step counts as 0.
  const missing = missingFigures(tour);

  const [date, setDate] = useState(last ? nextDay(last.date) : '');
  const [city, setCity] = useState('');
  const [place, setPlace] = useState<Place>();
  const [kind, setKind] = useState<DateKind>('show');
  const [miles, setMiles] = useState<number | undefined>();
  const [blocked, setBlocked] = useState(false);
  // The date loaded into the form to be changed. Empty when the form adds a new one.
  const [editingId, setEditingId] = useState<string>();
  const editing = tour.dates.find((d) => d.id === editingId);
  const cityInput = useRef<HTMLInputElement>(null);

  const complete = /^\d{4}-\d{2}-\d{2}$/.test(date) && city.trim() !== '';
  // A city typed with no date is a date half entered; it is never dropped silently.
  const halfEntered = !complete && city.trim() !== '';

  /** Empties the form, ready for the day after the given one. */
  const clear = (after: string | undefined) => {
    setEditingId(undefined);
    setDate(after ? nextDay(after) : '');
    setCity('');
    setPlace(undefined);
    setKind('show');
    setMiles(undefined);
    setBlocked(false);
  };

  /** Adds the date in the form, or writes it over the date being changed. */
  const save = () => {
    update((t) => {
      const target = t.dates.find((d) => d.id === editing?.id);
      if (!target) {
        t.dates.push({ id: newId('date'), date, city: city.trim(), place, kind, milesFromPrevious: miles, merch: { plan: 0 }, lodging: { plan: 0 }, fuelFillUps: [], lines: [], settled: false });
        return;
      }
      target.date = date;
      target.city = city.trim();
      target.place = place;
      target.kind = kind;
      target.milesFromPrevious = miles;
      if (kind !== 'show') target.offer = undefined;
    });
    // The next date to add most often follows the last one of the run.
    const others = tour.dates.filter((d) => d.id !== editing?.id).map((d) => d.date);
    clear([...others, date].sort().at(-1));
  };

  const startEdit = (d: TourDate) => {
    setEditingId(d.id);
    setDate(d.date);
    setCity(d.city);
    setPlace(d.place);
    setKind(d.kind);
    setMiles(d.milesFromPrevious);
    setBlocked(false);
    cityInput.current?.focus();
  };

  /**
   * Leaves the step: on to the rates, or straight out of setup. Ending setup
   * here needs nothing from the rates step, since every rate left empty is
   * estimated, or counted as 0 and said so on the budget.
   */
  const leave = (finish: boolean) => {
    if (halfEntered) return setBlocked(true);
    if (complete) save();
    if (finish) {
      update(finishSetup);
      return go('/budget/plan');
    }
    update((t) => {
      t.setup = 'rates';
    });
    go('/setup/rates');
  };

  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <Steps step={2} />
      <header className="screen-head">
        <h1 className="title">Add the dates</h1>
        <p className="note">
          {tour.name} {'·'} Add each day of the run: shows, off days and travel days.{' '}
          {list ? 'Pick each city from the list and the drives are worked out for you.' : `Type each city and the ${words.distances} from the stop before: drives are only worked out for cities in the United States and Canada.`} Offers are entered
          later, from the budget.
        </p>
      </header>

      {tour.dates.length > 0 && (
        <ul className="rows" style={{ borderTop: '1px solid var(--ink)' }} aria-label="Dates added so far">
          {tour.dates.map((d) => (
            <li className="row" key={d.id}>
              <span className="name">
                <span className="label">
                  {formatDay(d.date)} {'·'} {d.city}
                </span>
                <span className="note">
                  {[KIND_LABEL[d.kind], describeLeg(legInto(tour, d), units)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="end">
                {d.id === editingId ? (
                  <span className="status">Editing</span>
                ) : (
                  <>
                    <button className="text-btn" type="button" onClick={() => startEdit(d)}>
                      Edit<span className="sr-only"> {d.city}</span>
                    </button>
                    <button className="text-btn" type="button" onClick={() => update((t) => (t.dates = t.dates.filter((x) => x.id !== d.id)))}>
                      Remove<span className="sr-only"> {d.city}</span>
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        className="inline-form"
        aria-label={editing ? `Change ${editing.city}` : tour.dates.length ? 'Add another date' : 'Add the first date'}
        onSubmit={(e) => {
          e.preventDefault();
          if (!complete) return;
          save();
          cityInput.current?.focus();
        }}
      >
        {editing && (
          <p className="note" style={{ marginTop: 14 }}>
            Changing {formatDay(editing.date)} {'·'} {editing.city}
          </p>
        )}
        <TextField label="Date" type="date" value={date} onChange={setDate} />
        <CityField
          label="City"
          value={city}
          place={place}
          onChange={(c, p) => {
            setCity(c);
            setPlace(p);
          }}
          note={list ? 'Start typing and pick it from the list.' : undefined}
          inputRef={cityInput}
          units={units}
          list={list}
        />
        <SelectField
          label="Kind of day"
          value={kind}
          onChange={setKind}
          options={[
            ['show', 'Show'],
            ['off', 'Off day'],
            ['travel', 'Travel day'],
          ]}
        />
        {city.trim() !== '' && <MilesField label={`${words.Distances} from the previous stop`} value={miles} onChange={setMiles} leg={legInto(tour, { id: editingId, date, city, place, milesFromPrevious: miles })} units={units} list={list} />}
        {editing ? (
          <div className="btn-row">
            <button className="btn quiet" type="button" onClick={() => clear(tour.dates.at(-1)?.date)}>
              Cancel
            </button>
            <button className="btn quiet" type="submit" disabled={!complete} style={complete ? undefined : { opacity: 0.5 }}>
              Save date
            </button>
          </div>
        ) : (
          <button className="btn quiet" type="submit" disabled={!complete} style={complete ? undefined : { opacity: 0.5 }}>
            {tour.dates.length ? 'Add another date' : 'Add this date'}
          </button>
        )}
      </form>

      {tour.dates.length > 0 && (
        <>
          <MilesField label={`${words.Distances} home from the last date`} value={tour.milesHome} onChange={(v) => update((t) => (t.milesHome = v))} leg={legHome(tour)} units={units} list={list} />
          <p className="note" style={{ marginTop: 16 }}>
            Route so far: {formatDistance(routeMiles(tour), units)}{unknownLegs(tour) ? `, with ${unknownLegs(tour)} ${unknownLegs(tour) === 1 ? 'drive' : 'drives'} not counted because the ${words.distances} are not known` : ''}.
          </p>
        </>
      )}

      {blocked && halfEntered && (
        <p className="note bad" role="alert" style={{ marginTop: 16 }}>
          {city.trim()} has no date yet. Give it a date, or clear the city, before going on.
        </p>
      )}
      <button className="btn" type="button" onClick={() => leave(false)}>
        Next: set the rates
      </button>
      <button className="btn quiet" type="button" onClick={() => leave(true)}>
        Skip the rates for now
      </button>
      <p className="note" style={{ marginTop: 8 }}>
        The rates start on estimates, or on the figures of your last tour, and can be changed any time under Rates.
        {missing.length > 0 && ` The plan counts ${listed(missing)} as 0 until you type ${missing.length === 1 ? 'it' : 'them'} there.`}
      </p>
      {tour.dates.length === 0 && !complete && (
        <p className="note" style={{ marginTop: 8 }}>
          No dates yet? You can go on and add them later under Dates.
        </p>
      )}
      <Discard />
    </main>
  );
}

export function RatesStep() {
  const { tour, update } = useTour();
  const { tours } = useTours();
  const count = tour.dates.length;
  // Money figures are only brought over from a tour kept in the same currency.
  const from = carryOver(tours);
  // The figures this tour has no estimate for and that are still empty.
  const missing = missingFigures(tour);
  const fromOther = from && from.from === tour.ratesFrom && currencyOf(from) !== currencyOf(tour) ? CURRENCIES[currencyOf(from)].name : undefined;

  return (
    <main className="screen">
      <Back to="/setup/dates">Dates</Back>
      <Steps step={3} />
      <header className="screen-head">
        <h1 className="title">Set the rates</h1>
        <p className="note">
          {tour.name} {'·'} {count} {count === 1 ? 'date' : 'dates'}.{' '}
          {hasUsFigures(tour)
            ? 'Every field already has a figure, shown in grey: worked out from your dates, or estimated for this route. Type over one only where you know better.'
            : 'Most fields already have a figure, shown in grey. The van daily rate, the fuel price and lodging have none: the estimates for those are for the United States, so type your own.'}
        </p>
        {tour.ratesFrom && (
          <p className="note">
            {fromOther
              ? `The headcount and commissions were started from ${tour.ratesFrom}. Its money figures are in ${fromOther}, so they were not brought over.`
              : `The headcount, commissions, van, food and merch figures were started from ${tour.ratesFrom}.`}
          </p>
        )}
      </header>

      <PeopleSection planning />
      <CommissionsSection />
      <VanSection planning />
      <FuelSection planning />
      <DefaultsSection planning />

      {missing.length > 0 && (
        <p className="note bad" role="status" style={{ marginTop: 16 }}>
          Not in the plan yet: {listed(missing)}. Type {missing.length === 1 ? 'it' : 'them'} above, or the plan counts {missing.length === 1 ? 'it' : 'them'} as 0.
        </p>
      )}
      <button
        className="btn"
        type="button"
        onClick={() => {
          update(finishSetup);
          go('/budget/plan');
        }}
      >
        Finish and see the budget
      </button>
      <Discard />
    </main>
  );
}
