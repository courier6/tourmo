// The lookup server: a handful of read-only addresses the app calls for
// figures it cannot work out by itself. It runs inside `npm run dev` and
// `npm run preview` (see vite.config.ts), or alone with `npm run lookups`.
//
//   GET /api/estimates                     gas, lodging and van figures
//   GET /api/road?from=lat,lon&to=lat,lon  driving miles and minutes
//   GET /api/status                        whether the server is there
//
// Every answer from outside is kept in server/.cache, so the outside services
// are asked as rarely as possible: gas and lodging twice a day at most, and a
// road between two places only once. If an outside service cannot be reached,
// the figures saved in src/data/estimates.json are served instead, marked as
// not live. Nothing about a tour is sent anywhere: the routing service sees
// two map points and nothing else.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchGas, fetchLodging, fetchRoad } from './sources.mjs';

const HALF_DAY = 12 * 60 * 60 * 1000;
const ROAD_GAP = 1100; // the routing demo server asks for no more than one call a second

function readJson(url, fallback) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    return fallback;
  }
}

export function createLookups({ sources = { fetchGas, fetchLodging, fetchRoad }, cacheDir = new URL('./.cache/', import.meta.url), now = () => Date.now(), roadGap = ROAD_GAP } = {}) {
  const savedFile = new URL('../src/data/estimates.json', import.meta.url);
  const estimatesFile = new URL('estimates.json', cacheDir);
  const roadsFile = new URL('roads.json', cacheDir);

  const save = (file, value) => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(value));
    } catch {
      // A cache that cannot be written only means asking again next time.
    }
  };

  let estimates = readJson(estimatesFile, undefined);
  let refreshing;
  const roads = readJson(roadsFile, {});
  let roadQueue = Promise.resolve();
  let lastRoadCall = 0;

  async function getEstimates() {
    if (estimates && now() - estimates.fetchedAt < HALF_DAY) return estimates;
    refreshing ??= (async () => {
      const saved = readJson(savedFile, {});
      try {
        const [gas, lodging] = await Promise.all([sources.fetchGas(), sources.fetchLodging()]);
        estimates = { gas, lodging, van: saved.van, live: true, fetchedAt: now() };
        save(estimatesFile, estimates);
      } catch (error) {
        // Keep serving the last good answer, or the saved file, and try again in a few minutes.
        estimates = { ...(estimates ?? saved), live: false, problem: String(error.message ?? error), fetchedAt: now() - HALF_DAY + 5 * 60 * 1000 };
      } finally {
        refreshing = undefined;
      }
      return estimates;
    })();
    return refreshing;
  }

  /** "32.78,-96.81" to { lat, lon }, or undefined when it is not a point on the map. */
  function point(text) {
    const match = /^(-?\d{1,2}(?:\.\d{1,4})?),(-?\d{1,3}(?:\.\d{1,4})?)$/.exec(text ?? '');
    if (!match) return undefined;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
  }

  async function getRoad(from, to) {
    const key = `${from.lat},${from.lon};${to.lat},${to.lon}`;
    if (roads[key]) return roads[key];
    // One call at a time, spaced out, so the shared routing server is not hammered.
    const call = roadQueue.then(async () => {
      if (roads[key]) return roads[key];
      const wait = lastRoadCall + roadGap - now();
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
      lastRoadCall = now();
      roads[key] = await sources.fetchRoad(from, to);
      save(roadsFile, roads);
      return roads[key];
    });
    roadQueue = call.catch(() => undefined);
    return call;
  }

  function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  }

  /** Answers a request under /api/. Returns false for anything else, so it can sit in front of another server. */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method !== 'GET') {
      send(res, 405, { problem: 'Only GET is answered here.' });
      return true;
    }
    try {
      if (url.pathname === '/api/status') {
        send(res, 200, { ok: true });
      } else if (url.pathname === '/api/estimates') {
        send(res, 200, await getEstimates());
      } else if (url.pathname === '/api/road') {
        const from = point(url.searchParams.get('from'));
        const to = point(url.searchParams.get('to'));
        if (!from || !to) send(res, 400, { problem: 'Give from and to as lat,lon.' });
        else send(res, 200, await getRoad(from, to));
      } else {
        send(res, 404, { problem: 'Nothing is answered at this address.' });
      }
    } catch (error) {
      send(res, 502, { problem: String(error.message ?? error) });
    }
    return true;
  }

  return { handle, getEstimates, getRoad };
}

/** A Vite plugin that answers /api/ from the dev and preview servers. */
export function lookupsPlugin() {
  const { handle } = createLookups();
  const middleware = (req, res, next) => {
    handle(req, res).then((answered) => answered || next(), next);
  };
  return {
    name: 'tour-lookups',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
