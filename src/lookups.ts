// Fresher figures from the lookup server (see server/lookups.mjs): this
// week's gas prices, the year's lodging rates, and real road miles between
// two cities. The app works without it: with no server, or no signal, it uses
// the last figures it was given, or the ones saved with the app, and drives
// stay straight-line estimates.

import { ESTIMATES, knownRoad, loadRoads, rememberRoad, roadsTable, setFigures, type Place } from './core';

const BASE: string = import.meta.env.VITE_LOOKUP_URL ?? '';
const FIGURES_KEY = 'tour-money/figures';
const ROADS_KEY = 'tour-money/roads';

/** Where the figures in use came from. */
export type FiguresFrom = 'live' | 'kept' | 'saved';
let from: FiguresFrom = 'saved';
export const figuresFrom = (): FiguresFrom => from;

const listeners = new Set<() => void>();
/** Calls back whenever a lookup changes a figure, so screens can redraw. Returns how to stop. */
export function onLookup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const changed = () => listeners.forEach((listener) => listener());

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null; // storage blocked or damaged: carry on without the kept copy
  }
}

function keep(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only a convenience; the figures are still in use for this visit.
  }
}

// What earlier visits looked up is put back before anything is drawn.
loadRoads(read(ROADS_KEY));
const kept = read(FIGURES_KEY) as { gas?: { asOf?: string } } | null;
// A kept copy is only used when it is at least as new as the figures shipped with the app.
if (kept && String(kept.gas?.asOf) >= ESTIMATES.gas.asOf && setFigures(kept)) from = 'kept';

async function get(path: string): Promise<unknown> {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Lookup answered ${response.status}`);
  return response.json();
}

let asking: Promise<void> | undefined;
/** Asks the server for this week's figures. Quietly does nothing when there is no server. */
export function refreshFigures(): Promise<void> {
  asking ??= get('/api/estimates')
    .then((figures) => {
      const live = (figures as { live?: boolean }).live === true;
      if (!live || !setFigures(figures)) return;
      from = 'live';
      keep(FIGURES_KEY, figures);
      changed();
    })
    .catch(() => undefined);
  return asking;
}

const asked = new Set<string>();
/** Asks for the road miles between two places, once. The answer replaces the estimate when it arrives. */
export function wantRoad(a: Place, b: Place): void {
  const key = `${a.lat},${a.lon};${b.lat},${b.lon}`;
  if (asked.has(key) || knownRoad(a, b)) return;
  asked.add(key);
  get(`/api/road?from=${a.lat},${a.lon}&to=${b.lat},${b.lon}`)
    .then((road) => {
      const { miles, minutes } = road as { miles?: number; minutes?: number };
      if (!Number.isFinite(miles) || !Number.isFinite(minutes)) return;
      rememberRoad(a, b, { miles: Number(miles), minutes: Number(minutes) });
      keep(ROADS_KEY, roadsTable());
      changed();
    })
    .catch(() => undefined); // no server, no signal or no road: the estimate stays
}
