// The Dates list and the date form are not in the mockups. These are plain
// versions in the same ledger style so a tour can be built end to end.

import { useState } from 'react';
import { dateStatus, describeLeg, distanceNumber, formatDay, hasUsFigures, legHome, legInto, lodgingFor, newId, routeMiles, sameCity, STATUS_LABEL, tourRates, UNIT_WORDS, unitsOf, type DateKind, type Money, type Place, type TourDate } from '../core';
import { Back, Check, MoneyField, SelectField, TextField } from '../components';
import { CityField, MilesField } from '../CityField';
import { useMoney } from '../currency';
import { go, href } from '../router';
import { useTour } from '../store';

const KIND_LABEL: Record<DateKind, string> = { show: 'Show', off: 'Off day', travel: 'Travel day' };

export function Dates() {
  const { tour, today } = useTour();
  const units = unitsOf(tour);
  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <header className="screen-head">
        <h1 className="title">Dates</h1>
        <p className="note">
          {tour.dates.length} {tour.dates.length === 1 ? 'date' : 'dates'} {'·'} {distanceNumber(routeMiles(tour), units)} route {UNIT_WORDS[units].distances}
          {legHome(tour).miles ? `, including ${distanceNumber(legHome(tour).miles, units)} home` : ''}
        </p>
      </header>

      <ul className="rows" style={{ borderTop: '1px solid var(--ink)' }}>
        {tour.dates.map((d) => {
          const status = dateStatus(d, today);
          const detail = d.kind === 'show' ? d.offer?.raw || 'No offer yet' : KIND_LABEL[d.kind];
          return (
            <li className="row" key={d.id}>
              <a className="name" href={href('/date/' + d.id)} style={{ textDecoration: 'none', flex: 1 }}>
                <span className="label">
                  {formatDay(d.date)} {'·'} {d.city}
                </span>
                <span className="note">
                  <span className="money">{detail}</span>
                  {describeLeg(legInto(tour, d), units) ? ` · ${describeLeg(legInto(tour, d), units)}` : ''}
                </span>
              </a>
              <span className="end">
                <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>
                <a className="note" href={href(`/dates/${d.id}/edit`)} style={{ display: 'block', padding: '6px 0 0' }}>
                  Edit<span className="sr-only"> {d.city}</span>
                </a>
              </span>
            </li>
          );
        })}
      </ul>

      <a className="btn quiet" href={href('/dates/new')}>
        Add a date
      </a>
    </main>
  );
}

export function DateForm({ dateId }: { dateId?: string }) {
  const { tour, update } = useTour();
  const money = useMoney();
  const units = unitsOf(tour);
  const list = hasUsFigures(tour);
  const existing = dateId ? tour.dates.find((d) => d.id === dateId) : undefined;
  const last = tour.dates.at(-1);

  const [date, setDate] = useState(existing?.date ?? (last ? nextDay(last.date) : ''));
  const [city, setCity] = useState(existing?.city ?? '');
  const [place, setPlace] = useState<Place | undefined>(existing?.place);
  const [kind, setKind] = useState<DateKind>(existing?.kind ?? 'show');
  const [miles, setMiles] = useState<number | undefined>(existing?.milesFromPrevious);
  const merchFigure = tourRates(tour).merchPerShow.value;
  // Left empty, merch and lodging take the grey figure shown. On a date being
  // edited, a plan that is still the figure worked out for it was never typed
  // over, so it starts empty too and goes on following the city and the kind
  // of day when those are changed here. A figure the band typed stays.
  const [merch, setMerch] = useState<Money | undefined>(() => (existing && existing.merch.plan !== (existing.kind === 'show' ? merchFigure : 0) ? existing.merch.plan : undefined));
  // A night planned at 0 where a room would otherwise be planned is a night
  // with no room to pay for. It opens ticked, and unticking it brings back the
  // worked-out figure rather than a typed 0.
  const [noRoom, setNoRoom] = useState(() => !!existing && existing.lodging.plan === 0 && lodgingFor(tour, existing) > 0);
  const [lodging, setLodging] = useState<Money | undefined>(() => (existing && !noRoom && existing.lodging.plan !== lodgingFor(tour, existing) ? existing.lodging.plan : undefined));
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (dateId && !existing) {
    return (
      <main className="screen">
        <Back to="/dates">Dates</Back>
        <p>That date is no longer on the tour.</p>
      </main>
    );
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && city.trim() !== '';
  const lodgingFigure = lodgingFor(tour, { city, place, date });
  const ownLodging = tour.lodgingPerNightDefault !== undefined && !tour.estimated?.includes('lodgingPerNight');

  return (
    <main className="screen">
      <Back to="/dates">Dates</Back>
      <header className="screen-head">
        <h1 className="title">{existing ? 'Edit date' : 'Add a date'}</h1>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          update((t) => {
            const target: TourDate =
              t.dates.find((d) => d.id === dateId) ??
              (() => {
                const created: TourDate = { id: newId('date'), date, city: '', kind, merch: { plan: 0 }, lodging: { plan: 0 }, fuelFillUps: [], lines: [], settled: false };
                t.dates.push(created);
                return created;
              })();
            target.date = date;
            target.city = city.trim();
            target.place = place;
            target.kind = kind;
            target.milesFromPrevious = miles;
            target.merch.plan = kind === 'show' ? (merch ?? merchFigure) : 0;
            target.lodging.plan = noRoom && lodgingFigure > 0 ? 0 : (lodging ?? lodgingFigure);
            if (kind !== 'show') target.offer = undefined;
          });
          go('/dates');
        }}
      >
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
          note={
            existing?.offer && kind !== 'show' ? (
              <span className="bad" role="alert">
                Saving this as {kind === 'off' ? 'an off day' : 'a travel day'} removes its offer{existing.offer.raw ? `, "${existing.offer.raw}"` : ''}. It cannot be brought back.
              </span>
            ) : undefined
          }
        />
        <MilesField label={`${UNIT_WORDS[units].Distances} from the previous stop`} value={miles} onChange={setMiles} leg={legInto(tour, { id: existing?.id, date, city, place, milesFromPrevious: miles })} units={units} list={list} />
        {kind === 'show' && <MoneyField label="Planned merch" value={merch} onChange={setMerch} placeholder={String(merchFigure / 100)} note={merch === undefined ? 'Left empty, it uses the merch per show from Rates.' : undefined} />}
        {lodgingFigure > 0 && <Check label="No room to pay for this night" checked={noRoom} onChange={setNoRoom} />}
        {noRoom && lodgingFigure > 0 ? (
          <p className="note">Staying with friends, put up by the venue or driving through the night: no lodging is planned.</p>
        ) : (
          <MoneyField
            label="Planned lodging"
            value={lodging}
            onChange={setLodging}
            placeholder={String(lodgingFigure / 100)}
            note={
              lodging !== undefined
                ? undefined
                : city.trim() === ''
                  ? 'Worked out once the city is in.'
                  : lodgingFigure === 0
                    ? list || sameCity(city, tour.homeCity)
                      ? 'A night at home, so nothing is planned. Type a figure if there is a cost.'
                      : 'No lodging figure on this tour yet, so nothing is planned. Type what this night costs.'
                    : ownLodging
                      ? 'Left empty, it uses your lodging per night from Rates.'
                      : `Left empty, it uses ${money(lodgingFigure)}: ${tourRates(tour).rooms} ${tourRates(tour).rooms === 1 ? 'room' : 'rooms'} at the federal lodging rate for ${city.trim()} that month.`
            }
          />
        )}

        <button className="btn" type="submit" disabled={!valid} style={valid ? undefined : { opacity: 0.5 }}>
          {existing ? 'Save date' : 'Add date'}
        </button>
        {existing && kind === 'show' && (
          <a className="btn quiet" href={href('/offer/' + existing.id)}>
            {existing.offer ? 'Edit the offer' : 'Enter the offer'}
          </a>
        )}
        {existing && (
          <button
            className="btn plain"
            type="button"
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              update((t) => {
                t.dates = t.dates.filter((d) => d.id !== existing.id);
              });
              go('/dates');
            }}
          >
            {confirmRemove ? 'Tap again to remove this date and its figures' : 'Remove this date'}
          </button>
        )}
      </form>
    </main>
  );
}

function nextDay(iso: string): string {
  return new Date(new Date(iso + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
}
