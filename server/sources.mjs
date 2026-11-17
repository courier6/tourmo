// The outside sources the app's figures come from. Used by the lookup server
// (server/lookups.mjs) and by `npm run estimates`.
//
//   gas      U.S. Energy Information Administration: weekly retail price of
//            regular gasoline by region and state (api.eia.gov)
//   lodging  U.S. General Services Administration: per diem lodging rate for
//            a hotel room by area and month (api.gsa.gov)
//   roads    OSRM's public routing server: driving distance and time between
//            two points, from OpenStreetMap data (router.project-osrm.org)
//
// The first two work with the public DEMO_KEY, which allows a few calls an
// hour. For regular use, register free keys and set EIA_API_KEY and
// GSA_API_KEY. The routing server needs no key; it is a shared demo service,
// so calls to it are spaced out and every answer is kept.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AGENT = { 'User-Agent': 'tour-budget-prototype' };

/** One more try after a slow or dropped answer; a refusal (a bad key, too many calls) is final. */
async function getJson(url, what, attempts = 2) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(10000) });
      if (response.ok) return await response.json();
      if (response.status < 500 || attempt >= attempts) throw new Error(`${what}: the server answered ${response.status}`);
    } catch (error) {
      const refused = /the server answered/.test(String(error.message));
      if (refused || attempt >= attempts) throw refused ? error : new Error(`${what}: no answer (${error.message})`);
    }
  }
}

export async function fetchGas(key = process.env.EIA_API_KEY ?? 'DEMO_KEY') {
  const url =
    `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${key}&frequency=weekly&data[0]=value` +
    '&facets[product][]=EPMR&facets[process][]=PTE&sort[0][column]=period&sort[0][direction]=desc&length=60';
  const rows = (await getJson(url, 'Gas prices')).response.data;
  const asOf = rows[0].period;
  const week = rows.filter((r) => r.period === asOf);
  const price = (r) => Math.round(Number(r.value) * 1000) / 1000;
  const us = week.find((r) => r.duoarea === 'NUS');
  if (!us) throw new Error('Gas prices: no U.S. average in the answer');
  // "R..." rows are regions (PADDs); "S" plus a state code are single states.
  const regions = Object.fromEntries(week.filter((r) => /^R/.test(r.duoarea)).map((r) => [r.duoarea, price(r)]));
  const states = Object.fromEntries(week.filter((r) => /^S[A-Z]{2}$/.test(r.duoarea)).map((r) => [r.duoarea.slice(1), price(r)]));
  return { asOf, source: 'U.S. Energy Information Administration, weekly retail price of regular gasoline', us: price(us), regions, states };
}

export async function fetchLodging(key = process.env.GSA_API_KEY ?? 'DEMO_KEY', now = new Date()) {
  const fiscalYear = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear(); // the federal year starts in October
  const rows = await getJson(`https://api.gsa.gov/travel/perdiem/v2/rates/conus/lodging/${fiscalYear}?api_key=${key}`, 'Lodging rates');
  const standard = rows.find((r) => r.City === 'Standard Rate');
  if (!standard) throw new Error('Lodging rates: no standard rate in the answer');
  const areas = rows
    .filter((r) => r.City !== 'Standard Rate')
    .map((r) => ({ name: r.City.trim(), state: r.State, counties: (r.County ?? '').replace(/\s+/g, ' ').trim(), months: MONTHS.map((m) => Number(r[m])) }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  return {
    fiscalYear,
    source: 'U.S. General Services Administration, per diem lodging rates (one room, one night, before tax)',
    standard: Number(standard.Jan),
    areas,
  };
}

/** Driving miles and minutes between two points, each given as { lat, lon }. */
export async function fetchRoad(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const answer = await getJson(url, 'Road miles');
  const route = answer.routes?.[0];
  if (answer.code !== 'Ok' || !route) throw new Error('Road miles: no route between those two places');
  return { miles: Math.round(route.distance / 1609.344), minutes: Math.round(route.duration / 60) };
}
