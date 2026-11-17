// Tours are saved on the device (localStorage), so the app works with no
// signal. No accounts and no sync: one device, as the handoff's default says.

import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { blankTour, carryOver, isTour, legs, localToday, newId, SAMPLE_TOUR_IDS, seedTours, type Place, type Tour } from './core';
import { figuresFrom, onLookup, refreshFigures, wantRoad } from './lookups';
import { Ctx, type Store } from './storeContext';

const KEY = 'tour-money/v1';
/** Saved data that could not be read is copied here before anything replaces it. */
export const UNREADABLE_KEY = 'tour-money/unreadable';

interface Stored {
  version: 3;
  tours: Tour[];
  /** The tour the Budget, Dates and Rates screens show. Empty when none is open. */
  activeTourId: string;
}

function fresh(): Stored {
  return { version: 3, tours: seedTours(), activeTourId: '' };
}

/** Version 1 held the Spring run sample only. Version 2 adds the finished samples. */
function fromVersion1(data: { tours: Tour[]; activeTourId: string }): { tours: Tour[]; activeTourId: string } {
  const have = new Set(data.tours.map((t) => t.id));
  const added = seedTours().filter((t) => !have.has(t.id));
  return { tours: [...added, ...data.tours], activeTourId: data.activeTourId };
}

/**
 * Up to version 2 a rate that had not been entered was stored as 0. From
 * version 3 an empty rate is estimated and 0 is a real figure, so the zeros
 * that only meant "not entered" are cleared: van days and mileage on every
 * tour of the band's own, and every rate on a tour still being set up.
 */
function fromVersion2(data: { tours: Tour[]; activeTourId: string }): Stored {
  const tours = data.tours.map((tour) => {
    if (SAMPLE_TOUR_IDS.includes(tour.id)) return tour;
    const t = structuredClone(tour);
    if (!t.vehicle.days) delete t.vehicle.days;
    if (!t.fuel.mpg) delete t.fuel.mpg;
    if (t.setup) {
      if (!t.vehicle.dailyRate) delete t.vehicle.dailyRate;
      if (!t.fuel.pricePerGallon) delete t.fuel.pricePerGallon;
      if (!t.merchPerShowDefault) delete t.merchPerShowDefault;
      if (!t.lodgingPerNightDefault) delete t.lodgingPerNightDefault;
    }
    return t;
  });
  return { version: 3, tours, activeTourId: data.activeTourId };
}

interface Loaded {
  data: Stored;
  /** True when some saved data could not be read and was copied to UNREADABLE_KEY. */
  setAside: boolean;
}

/** Reads the saved text. Undefined when it is not tours this version understands. */
function read(text: string): { data: Stored; complete: boolean } | undefined {
  try {
    const saved = JSON.parse(text) as { version?: unknown; tours?: unknown; activeTourId?: unknown } | null;
    if (!saved || !Array.isArray(saved.tours) || ![1, 2, 3].includes(saved.version as number)) return undefined;
    const tours = saved.tours.filter(isTour);
    const activeTourId = typeof saved.activeTourId === 'string' ? saved.activeTourId : '';
    const data: Stored =
      saved.version === 3 ? { version: 3, tours, activeTourId } : fromVersion2(saved.version === 1 ? fromVersion1({ tours, activeTourId }) : { tours, activeTourId });
    return { data, complete: tours.length === saved.tours.length };
  } catch {
    return undefined;
  }
}

function load(): Loaded {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: the app still works for the session.
  }
  if (!text) return { data: fresh(), setAside: false };

  const result = read(text);
  if (result?.complete) return { data: result.data, setAside: false };

  // Something in the saved text is damaged or from a version this one does not
  // know. Keep a copy before the next save writes over it.
  try {
    localStorage.setItem(UNREADABLE_KEY, text);
  } catch {
    // Nothing more can be done without storage.
  }
  return { data: result?.data ?? fresh(), setAside: true };
}

function save(data: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private windows can refuse writes; the app still works for the session.
  }
}

/** Today for a tour. A sample tour can pin it so it reads as mid-run. */
export const todayFor = (tour: Tour) => tour.demoToday ?? localToday();

export function TourProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(load);
  const [data, setData] = useState<Stored>(loaded.data);

  useEffect(() => save(data), [data]);

  // Figures looked up after the page opened (gas, lodging, road miles) change
  // what the screens work out, so each one redraws them.
  const [lookups, setLookups] = useState(0);
  useEffect(() => {
    const stop = onLookup(() => setLookups((n) => n + 1));
    void refreshFigures();
    return stop;
  }, []);

  const openTour = useCallback((id: string) => setData((prev) => (prev.activeTourId === id ? prev : { ...prev, activeTourId: id })), []);

  const createTour = useCallback((name: string, homeCity: string, homePlace?: Place) => {
    const id = newId('tour');
    // Rates start from the band's own last tour; anything it cannot supply is estimated.
    setData((prev) => ({ ...prev, tours: [...prev.tours, blankTour(id, name, homeCity, homePlace, carryOver(prev.tours))], activeTourId: id }));
    return id;
  }, []);

  const deleteTour = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      tours: prev.tours.filter((t) => t.id !== id),
      activeTourId: prev.activeTourId === id ? '' : prev.activeTourId,
    }));
  }, []);

  const update = useCallback((edit: (draft: Tour) => void) => {
    setData((prev) => ({
      ...prev,
      tours: prev.tours.map((t) => {
        if (t.id !== prev.activeTourId) return t;
        const draft = structuredClone(t);
        edit(draft);
        draft.dates.sort((a, b) => a.date.localeCompare(b.date));
        return draft;
      }),
    }));
  }, []);

  const restoreSamples = useCallback(() => {
    setData((prev) => ({ ...prev, tours: [...seedTours(), ...prev.tours.filter((t) => !SAMPLE_TOUR_IDS.includes(t.id))] }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      tours: data.tours,
      setAside: loaded.setAside,
      figures: figuresFrom(),
      tour: data.tours.find((t) => t.id === data.activeTourId),
      openTour,
      createTour,
      deleteTour,
      update,
      restoreSamples,
    }),
    // `lookups` is listed so that a new figure reaches every screen.
    [data, loaded, lookups, openTour, createTour, deleteTour, update, restoreSamples],
  );

  // Real road miles for every drive of the open tour that is still an estimate.
  const open = value.tour;
  useEffect(() => {
    if (!open) return;
    for (const leg of legs(open)) if (leg.ends && !leg.exact) wantRoad(...leg.ends);
  }, [open]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Every tour on the device, for the tour list and the new-tour steps. */
export function useTours(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useTours must be used inside TourProvider');
  return store;
}

interface TourStore {
  tour: Tour;
  /** Today's ISO date for this tour. */
  today: string;
  update: Store['update'];
}

/** The open tour. Only for screens the app shows while a tour is open. */
export function useTour(): TourStore {
  const { tour, update } = useTours();
  if (!tour) throw new Error('useTour needs an open tour');
  return { tour, today: todayFor(tour), update };
}
