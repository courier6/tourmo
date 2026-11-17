// The lookup server, with the outside services replaced by stand-ins so the
// tests need no network: what it answers, what it keeps, and what it does
// when a service cannot be reached.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLookups } from './lookups.mjs';

const GAS = { asOf: '2026-11-09', source: 'test', us: 4, regions: { R30: 3.5 }, states: { TX: 3.4 } };
const LODGING = { fiscalYear: 2027, source: 'test', standard: 113, areas: [] };
const HOUR = 60 * 60 * 1000;

let dir;
let calls;
let clock;
let failing;

const sources = {
  fetchGas: async () => {
    calls.gas += 1;
    if (failing) throw new Error('Gas prices: no answer');
    return GAS;
  },
  fetchLodging: async () => {
    calls.lodging += 1;
    return LODGING;
  },
  fetchRoad: async (from, to) => {
    calls.road.push(`${from.lat},${from.lon} to ${to.lat},${to.lon}`);
    if (from.lat === 0) throw new Error('Road miles: no route between those two places');
    return { miles: 256, minutes: 289 };
  },
};

const lookups = (options = {}) => createLookups({ sources, cacheDir: pathToFileURL(dir + '/'), now: () => clock, roadGap: 0, ...options });

/** Calls the server the way a browser would, and gives back the status and the answer. */
async function ask(server, url, method = 'GET') {
  const res = { headers: {}, setHeader: (k, v) => (res.headers[k] = v), end: (text) => (res.body = text), statusCode: 0 };
  const answered = await server.handle({ url, method }, res);
  return { answered, status: res.statusCode, body: res.body === undefined ? undefined : JSON.parse(res.body) };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tour-lookups-'));
  calls = { gas: 0, lodging: 0, road: [] };
  clock = Date.UTC(2026, 10, 14, 12);
  failing = false;
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('figures', () => {
  it('looks up gas and lodging, and adds the van figures saved with the app', async () => {
    const { status, body } = await ask(lookups(), '/api/estimates');
    expect(status).toBe(200);
    expect(body).toMatchObject({ gas: GAS, lodging: LODGING, live: true, fetchedAt: clock });
    expect(body.van.dailyRate).toBeGreaterThan(0);
  });

  it('asks the outside services once, then answers from what it kept for half a day', async () => {
    const server = lookups();
    await ask(server, '/api/estimates');
    clock += 11 * HOUR;
    await ask(server, '/api/estimates');
    expect(calls).toMatchObject({ gas: 1, lodging: 1 });
    clock += 2 * HOUR;
    await ask(server, '/api/estimates');
    expect(calls).toMatchObject({ gas: 2, lodging: 2 });
  });

  it('keeps the figures on disk, so a restart does not ask again', async () => {
    await ask(lookups(), '/api/estimates');
    const { body } = await ask(lookups(), '/api/estimates');
    expect(body.live).toBe(true);
    expect(calls.gas).toBe(1);
  });

  it('shares one lookup between requests that arrive together', async () => {
    const server = lookups();
    await Promise.all([ask(server, '/api/estimates'), ask(server, '/api/estimates'), ask(server, '/api/estimates')]);
    expect(calls.gas).toBe(1);
  });

  it('serves the saved figures, marked as not live, when a service cannot be reached', async () => {
    failing = true;
    const server = lookups();
    const { status, body } = await ask(server, '/api/estimates');
    expect(status).toBe(200);
    expect(body.live).toBe(false);
    expect(body.problem).toBe('Gas prices: no answer');
    expect(body.gas.us).toBeGreaterThan(1); // from src/data/estimates.json
    expect(body.lodging.areas.length).toBeGreaterThan(100);
  });

  it('tries again a few minutes after a failure, not half a day later', async () => {
    failing = true;
    const server = lookups();
    await ask(server, '/api/estimates');
    clock += 60 * 1000;
    await ask(server, '/api/estimates');
    expect(calls.gas).toBe(1);
    failing = false;
    clock += 5 * 60 * 1000;
    expect((await ask(server, '/api/estimates')).body).toMatchObject({ live: true, gas: GAS });
    expect(calls.gas).toBe(2);
  });

  it('goes on serving the last good figures when a refresh fails', async () => {
    const server = lookups();
    await ask(server, '/api/estimates');
    failing = true;
    clock += 13 * HOUR;
    expect((await ask(server, '/api/estimates')).body).toMatchObject({ live: false, gas: GAS });
  });
});

describe('road miles', () => {
  const dallasToTulsa = '/api/road?from=32.78,-96.81&to=36.15,-95.99';

  it('gives the miles and minutes between two points', async () => {
    expect(await ask(lookups(), dallasToTulsa)).toMatchObject({ status: 200, body: { miles: 256, minutes: 289 } });
    expect(calls.road).toEqual(['32.78,-96.81 to 36.15,-95.99']);
  });

  it('asks about a road once, and remembers it across restarts', async () => {
    const server = lookups();
    await ask(server, dallasToTulsa);
    await ask(server, dallasToTulsa);
    await ask(lookups(), dallasToTulsa);
    expect(calls.road).toHaveLength(1);
  });

  it('asks once when the same road is wanted twice at the same moment', async () => {
    const server = lookups();
    await Promise.all([ask(server, dallasToTulsa), ask(server, dallasToTulsa)]);
    expect(calls.road).toHaveLength(1);
  });

  it('spaces out its calls to the shared routing service', async () => {
    const server = lookups({ roadGap: 60, now: () => Date.now() });
    const started = Date.now();
    await Promise.all([ask(server, dallasToTulsa), ask(server, '/api/road?from=36.15,-95.99&to=37.69,-97.34'), ask(server, '/api/road?from=37.69,-97.34&to=32.78,-96.81')]);
    expect(calls.road).toHaveLength(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
  });

  it('refuses anything that is not two points on the map', async () => {
    const server = lookups();
    for (const url of ['/api/road', '/api/road?from=32.78,-96.81', '/api/road?from=abc&to=36.15,-95.99', '/api/road?from=132.78,-96.81&to=36.15,-95.99', '/api/road?from=32.78,-96.81;rm&to=36.15,-95.99']) {
      expect(await ask(server, url)).toMatchObject({ status: 400 });
    }
    expect(calls.road).toEqual([]);
  });

  it('reports a road that cannot be found, and carries on', async () => {
    const server = lookups();
    expect(await ask(server, '/api/road?from=0,0&to=36.15,-95.99')).toMatchObject({ status: 502, body: { problem: 'Road miles: no route between those two places' } });
    expect(await ask(server, dallasToTulsa)).toMatchObject({ status: 200 });
  });
});

describe('addresses', () => {
  it('says it is there', async () => {
    expect(await ask(lookups(), '/api/status')).toMatchObject({ answered: true, status: 200, body: { ok: true } });
  });

  it('leaves everything outside /api/ to the server it sits in front of', async () => {
    expect(await ask(lookups(), '/')).toMatchObject({ answered: false, status: 0 });
    expect(await ask(lookups(), '/src/main.tsx')).toMatchObject({ answered: false });
  });

  it('answers only GET, and only the addresses it knows', async () => {
    expect(await ask(lookups(), '/api/estimates', 'POST')).toMatchObject({ answered: true, status: 405 });
    expect(await ask(lookups(), '/api/nothing')).toMatchObject({ answered: true, status: 404 });
    expect(calls.gas).toBe(0);
  });
});
