// A city field that suggests cities as you type. Picking one fills in
// "Tulsa, OK" and records where it is, so drives can be estimated. Anything
// can still be typed; a city that is not in the list just has no estimate.

import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';
import { formatDrive, matchCity, prepareCities, searchCities, type City, type Leg, type Place } from './core';
import { wantRoad } from './lookups';
import { NumberField } from './components';

// The list is large, so it is loaded once, the first time a city field appears.
let loading: Promise<City[]> | undefined;
const loadCities = () => (loading ??= import('./data/cities.json').then((m) => prepareCities(m.default)));

function useCities(): City[] | undefined {
  const [cities, setCities] = useState<City[]>();
  useEffect(() => {
    let live = true;
    loadCities().then(
      (list) => live && setCities(list),
      () => undefined, // without the list the field still takes typed text
    );
    return () => {
      live = false;
    };
  }, []);
  return cities;
}

const placeOf = (c: City): Place => ({ lat: c.lat, lon: c.lon, ...(c.area ? { area: c.area } : {}) });

export function CityField({
  label,
  value,
  place,
  onChange,
  note,
  autoFocus,
  inputRef,
}: {
  label: string;
  value: string;
  /** Where the city is, when it has been matched to the list. */
  place: Place | undefined;
  onChange: (city: string, place: Place | undefined) => void;
  note?: ReactNode;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const cities = useCities();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  const options = cities && focused && !dismissed && !place && value.trim().length >= 2 ? searchCities(cities, value) : [];
  const open = options.length > 0;
  const current = Math.min(active, options.length - 1);
  const unmatched = cities !== undefined && !focused && !place && value.trim() !== '';

  const pick = (c: City) => {
    onChange(c.label, placeOf(c));
    setDismissed(true);
  };

  return (
    <div className="field city">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        className="input"
        type="text"
        role="combobox"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + '-list'}
        aria-activedescendant={open ? `${id}-option-${current}` : undefined}
        aria-describedby={unmatched || note ? id + '-note' : undefined}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // A finished entry that can only mean one city is matched without a tap.
          const match = cities && !place ? matchCity(cities, value) : undefined;
          if (match) onChange(match.label, placeOf(match));
        }}
        onChange={(e) => {
          // Typing over a picked city lets go of where it was.
          onChange(e.target.value, undefined);
          setDismissed(false);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((current + step + options.length) % options.length);
          } else if (e.key === 'Enter') {
            e.preventDefault(); // choose the city; do not send the form yet
            pick(options[current]);
          } else if (e.key === 'Escape') {
            setDismissed(true);
          }
        }}
      />
      {open && (
        <ul className="suggestions" id={id + '-list'} role="listbox" aria-label={label}>
          {options.map((c, i) => (
            <li
              key={c.label}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === current}
              // Keep the field focused, so the tap is not lost to the blur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              {c.name}, <span className="note">{c.state}</span>
            </li>
          ))}
        </ul>
      )}
      {(unmatched || note) && (
        <p className={`note ${unmatched ? 'bad' : ''}`} id={id + '-note'}>
          {unmatched ? 'Not matched to a city in the list, so drives to and from it are not estimated. Pick one from the list, or type the miles yourself.' : note}
        </p>
      )}
    </div>
  );
}

/**
 * Miles for one drive. Left empty, the drive is estimated from the two cities;
 * a typed figure replaces the estimate. `leg` is the drive as it stands.
 */
export function MilesField({ label, value, onChange, leg }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; leg: Leg }) {
  const from = leg.from || 'the previous stop';
  const estimate = leg.estimate;
  // A drive that is still a straight-line estimate is looked up; the answer replaces it here.
  const [a, b] = leg.ends ?? [];
  const wanted = a && b && !leg.exact ? `${a.lat},${a.lon};${b.lat},${b.lon}` : '';
  useEffect(() => {
    if (wanted && a && b) wantRoad(a, b);
    // `wanted` stands for the two places.
  }, [wanted]);

  const figure = estimate === undefined ? '' : leg.exact ? `${estimate.toLocaleString('en-US')} road miles from ${from}${leg.minutes ? `, allow ${formatDrive(leg.minutes)}` : ''}` : `about ${estimate.toLocaleString('en-US')} mi from ${from}, estimated`;
  const note =
    estimate === undefined
      ? 'Pick both cities from the list to have this worked out, or type the miles.'
      : estimate === 0
        ? 'Same city as the stop before, so no drive is counted.'
        : value === undefined
          ? `Worked out for you: ${figure}. Type the miles to use your own figure.`
          : `Your figure is used. Clear it to go back to ${figure}.`;
  return <NumberField label={label} suffix="mi" value={value} onChange={onChange} placeholder={estimate ? String(estimate) : undefined} note={note} />;
}
