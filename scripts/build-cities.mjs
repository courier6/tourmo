// Builds src/data/cities.json, the list behind city autocomplete, the
// distance estimates and the lodging estimates, from the open GeoNames files.
//
//   1. Download and unzip https://download.geonames.org/export/dump/cities1000.zip
//   2. Download https://download.geonames.org/export/dump/admin2Codes.txt
//   3. node scripts/build-cities.mjs path/to/cities1000.txt path/to/admin2Codes.txt
//
// Each line of the output is "Name|ST|lat|lon" or "Name|ST|lat|lon|Area",
// largest population first, for places of 1,000 people or more in the United
// States and Canada. "Area" is the lodging-rate area the place falls in, by
// its name in src/data/estimates.json; places without one use the standard
// rate. A place is matched to an area by its county, so run this again after
// `npm run estimates` reports that the areas changed.
// Data: GeoNames (geonames.org), licensed CC BY 4.0.

import { readFileSync, writeFileSync } from 'node:fs';

const [source, countiesFile] = process.argv.slice(2);
if (!source || !countiesFile) {
  console.error('Usage: node scripts/build-cities.mjs path/to/cities1000.txt path/to/admin2Codes.txt');
  process.exit(1);
}

// GeoNames numbers the Canadian provinces; the United States already uses postal codes.
const PROVINCES = { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU' };
const SKIP = new Set(['PPLQ', 'PPLH', 'PPLW']); // abandoned, historical, destroyed

/** Names compared without case, accents, punctuation or the word for the kind of county. */
const plain = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '')
    .replace(/\b(county|parish|borough|census area|municipality)\b/g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/^city of | city$/g, '') // "City of Baltimore" and "Baltimore City" are one place
    .replace(/\s+/g, ' ')
    .trim();

// County names by "US.TX.113".
const countyNames = new Map();
for (const line of readFileSync(countiesFile, 'utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code?.startsWith('US.')) countyNames.set(code, plain(name));
}

// Lodging areas: which counties and cities each one covers.
const estimates = JSON.parse(readFileSync(new URL('../src/data/estimates.json', import.meta.url), 'utf8'));
const areas = estimates.lodging.areas.map((area) => {
  const counties = new Set();
  const cities = new Set(area.name.split('/').map(plain));
  for (const piece of area.counties.split(/[\/,;()]|\band\b/)) {
    const text = plain(piece);
    if (!text) continue;
    const city = /^(?:the )?cit(?:y|ies) of (.+)$/.exec(text);
    if (city) cities.add(city[1]);
    else counties.add(text);
  }
  return { name: area.name, state: area.state, counties, cities, top: Math.max(...area.months) };
});

function areaFor(name, state, county) {
  const inState = areas.filter((a) => a.state === state);
  if (state === 'DC') return inState[0]?.name; // the District is one area
  const city = plain(name);
  const matches = inState.filter((a) => a.cities.has(city) || (county && (a.counties.has(county) || a.cities.has(county))));
  // Where two areas claim a place, the dearer one is used, so the plan errs high.
  return matches.sort((a, b) => b.top - a.top)[0]?.name;
}

const best = new Map();
for (const line of readFileSync(source, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  const [, name, , , lat, lon, , feature, country, , admin1, admin2] = f;
  const population = Number(f[14]);
  if (country !== 'US' && country !== 'CA') continue;
  if (SKIP.has(feature) || population < 1000) continue;
  const state = country === 'US' ? admin1 : PROVINCES[admin1];
  if (!state || !/^[A-Z]{2}$/.test(state) || name.includes('|')) continue;
  const key = `${name}|${state}`;
  const seen = best.get(key);
  if (seen && population <= seen.population) continue;
  const area = country === 'US' ? areaFor(name, state, countyNames.get(`US.${admin1}.${admin2}`)) : undefined;
  best.set(key, { name, state, lat: Number(lat), lon: Number(lon), population, area });
}

const places = [...best.values()].sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
const rows = places.map((c) => `${c.name}|${c.state}|${c.lat.toFixed(2)}|${c.lon.toFixed(2)}` + (c.area ? `|${c.area}` : ''));

writeFileSync(new URL('../src/data/cities.json', import.meta.url), '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');

const used = new Set(places.map((c) => c.area && `${c.area}|${c.state}`).filter(Boolean));
const unused = areas.filter((a) => !used.has(`${a.name}|${a.state}`)).map((a) => `${a.name}, ${a.state}`);
console.log(`${rows.length} places written to src/data/cities.json; ${places.filter((c) => c.area).length} fall in a lodging area with its own rate.`);
if (unused.length) console.log(`${unused.length} lodging areas matched no place: ${unused.join('; ')}`);
