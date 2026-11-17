// Refreshes src/data/estimates.json, the figures the app falls back on when
// the lookup server is not running. Run it with:  npm run estimates
//
// Gas and lodging are looked up fresh on every run; see server/sources.mjs
// for where from and how to use your own free keys.
//
// Not looked up: the `van` block. No public source publishes van rental
// rates, so it is kept as it is in the file. Its figures come from a
// published guide and are edited by hand; its `asOf` says how old they are.

import { readFileSync, writeFileSync } from 'node:fs';
import { fetchGas, fetchLodging } from '../server/sources.mjs';

const FILE = new URL('../src/data/estimates.json', import.meta.url);

const current = JSON.parse(readFileSync(FILE, 'utf8'));
const next = { gas: await fetchGas(), lodging: await fetchLodging(), van: current.van };

// One lodging area to a line keeps the file readable and its diffs small.
const text = JSON.stringify({ ...next, lodging: { ...next.lodging, areas: '@areas' } }, null, 1).replace(
  '"@areas"',
  '[\n' + next.lodging.areas.map((a) => '   ' + JSON.stringify(a)).join(',\n') + '\n  ]',
);
writeFileSync(FILE, text + '\n');

console.log(`Gas: week of ${next.gas.asOf}, U.S. average $${next.gas.us}. ${Object.keys(next.gas.regions).length} regions, ${Object.keys(next.gas.states).length} states.`);
console.log(`Lodging: fiscal year ${next.lodging.fiscalYear}, standard rate $${next.lodging.standard}, ${next.lodging.areas.length} areas with their own rate.`);
console.log(`Van: unchanged, as of ${next.van.asOf}. Edit src/data/estimates.json to update it.`);
console.log('If the lodging areas changed, rebuild the city list too: see scripts/build-cities.mjs.');
