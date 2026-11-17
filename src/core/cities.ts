// Looking a city up as it is typed. The list itself (src/data/cities.json) is
// loaded by the screen; this module only searches it, so it stays testable.

import type { Place } from './types';

export interface City extends Place {
  name: string;
  /** Two-letter state or province. */
  state: string;
  /** "Tulsa, OK": what goes in the field and is saved on the tour. */
  label: string;
  /** The name as it is compared: lower case, no accents or punctuation. */
  key: string;
}

/** "St. Louis" and "saint louis" compare equal, as do "Montréal" and "montreal". */
export function cityKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '')
    .replace(/[-\s]+/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bfort\b/g, 'ft')
    .replace(/\bmount\b/g, 'mt')
    .trim();
}

/** Turns the stored "Name|ST|lat|lon|Area" lines, largest city first, into cities. */
export function prepareCities(rows: string[]): City[] {
  return rows.map((row) => {
    const [name, state, lat, lon, area] = row.split('|');
    return { name, state, label: `${name}, ${state}`, lat: Number(lat), lon: Number(lon), ...(area ? { area } : {}), key: cityKey(name) };
  });
}

/** Splits "springfield, mo" or "springfield mo" into the name and the start of a state. */
function parts(query: string): { name: string; state: string }[] {
  const comma = query.indexOf(',');
  if (comma >= 0) return [{ name: cityKey(query.slice(0, comma)), state: query.slice(comma + 1).trim().toUpperCase() }];
  const whole = { name: cityKey(query), state: '' };
  const trailing = /^(.+)\s+([a-z]{1,2})$/i.exec(query.trim());
  return trailing ? [whole, { name: cityKey(trailing[1]), state: trailing[2].toUpperCase() }] : [whole];
}

/**
 * Cities whose name starts with what was typed, largest first, then cities
 * with a later word that does ("city" finds Oklahoma City). A state can be
 * added to narrow it: "springfield, mo".
 */
export function searchCities(cities: City[], query: string, limit = 6): City[] {
  const wanted = parts(query).filter((p) => p.name !== '');
  if (wanted.length === 0) return [];
  const starts: City[] = [];
  const within: City[] = [];
  for (const city of cities) {
    let rank = 0;
    for (const { name, state } of wanted) {
      if (state && !city.state.startsWith(state)) continue;
      if (city.key.startsWith(name)) rank = 2;
      else if (rank === 0 && city.key.includes(' ' + name)) rank = 1;
    }
    if (rank === 2) starts.push(city);
    else if (rank === 1 && within.length < limit) within.push(city);
    if (starts.length >= limit) break;
  }
  return [...starts, ...within].slice(0, limit);
}

/**
 * The city a finished entry means: "Tulsa, OK" exactly, or a name only one
 * city has ("Tulsa"). Undefined when it is not in the list or is ambiguous.
 */
export function matchCity(cities: City[], text: string): City | undefined {
  const comma = text.indexOf(',');
  if (comma >= 0) {
    const name = cityKey(text.slice(0, comma));
    const state = text.slice(comma + 1).trim().toUpperCase();
    return cities.find((c) => c.key === name && c.state === state);
  }
  const name = cityKey(text);
  if (name === '') return undefined;
  const named = cities.filter((c) => c.key === name);
  return named.length === 1 ? named[0] : undefined;
}
