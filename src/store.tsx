// Tours are saved on the device (localStorage), so the app works with no
// signal. No accounts and no sync: one device, as the handoff's default says.

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { blankTour, carryOver, isTour, keepDrives, legs, localToday, newId, SAMPLE_TOUR_IDS, seedTours, tourPhase, type Place, type Tour } from './core';
import { figuresFrom, onLookup, refreshFigures, wantRoad } from './lookups';
import { Ctx, type Store } from './storeContext';

// The storage keys keep the project's first name. Renaming them would leave
// tours already saved in a browser where the app no longer looks.
const KEY = 'tour-money/v1';
/** Saved data that could not be read is copied here before anything replaces it. */
export const UNREADABLE_KEY = 'tour-money/unreadable';

const VERSION = 5;

interface Stored {
  version: typeof VERSION;
  tours: Tour[];
  /** The tour the Budget, Dates and Rates screens show. Empty when none is open. */
  activeTourId: string;
}

function fresh(): Stored {
  return { version: VERSION, tours: seedTours(), activeTourId: '' };
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
function fromVersion2(data: { tours: Tour[]; activeTourId: string }): { tours: Tour[]; activeTourId: string } {
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
  return { tours, activeTourId: data.activeTourId };
}

/**
 * Version 4 plans food. A tour set up before then was planned without it, and
 * a plan must not grow a cost after the fact, so each of those is given a per
 * diem of 0: a real figure, which Rates can clear to take the estimate. A tour
 * still being set up is left to be estimated.
 */
function fromVersion3(data: { tours: Tour[]; activeTourId: string }): { tours: Tour[]; activeTourId: string } {
  const tours = data.tours.map((tour) => (tour.setup || tour.perDiem !== undefined ? tour : { ...tour, perDiem: 0 }));
  return { tours, activeTourId: data.activeTourId };
}

/**
 * Version 5 plans a share of merch sales as its cost. As with food, a tour
 * set up before then keeps the plan it had: a share of 0.
 */
function fromVersion4(data: { tours: Tour[]; activeTourId: string }): { tours: Tour[]; activeTourId: string } {
  const tours = data.tours.map((tour) => (tour.setup || tour.merchCostRate !== undefined ? tour : { ...tour, merchCostRate: 0 }));
  return { tours, activeTourId: data.activeTourId };
}

interface Loaded {
  data: Stored;
  /** True when some saved data could not be read and was copied to UNREADABLE_KEY. */
  setAside: boolean;
}

/**
 * Reads the saved text. Undefined when it is not tours this version
 * understands. Tours that are not in the shape the screens read are left out,
 * and `complete` is false so that a copy of the text is kept. Every screen
 * takes the dates to be in order, so they are put in order here too.
 */
export function readSaved(text: string): { data: Stored; complete: boolean } | undefined {
  try {
    const saved = JSON.parse(text) as { version?: unknown; tours?: unknown; activeTourId?: unknown } | null;
    if (!saved || !Array.isArray(saved.tours) || ![1, 2, 3, 4, VERSION].includes(saved.version as number)) return undefined;
    const tours = saved.tours.filter(isTour);
    for (const tour of tours) tour.dates.sort((a, b) => a.date.localeCompare(b.date));
    const activeTourId = typeof saved.activeTourId === 'string' ? saved.activeTourId : '';
    let read = { tours, activeTourId };
    if (saved.version === 1) read = fromVersion1(read);
    if ((saved.version as number) <= 2) read = fromVersion2(read);
    if ((saved.version as number) <= 3) read = fromVersion3(read);
    if ((saved.version as number) <= 4) read = fromVersion4(read);
    return { data: { version: VERSION, ...read }, complete: tours.length === saved.tours.length };
  } catch {
    return undefined;
  }
}

/**
 * A tour that is past setup holds the miles of its own drives. One saved
 * before drives were kept takes them now, from what this device knows.
 */
function withDrives(data: Stored): Stored {
  for (const tour of data.tours) if (!tour.setup && !tour.drives) keepDrives(tour);
  return data;
}

/**
 * Road miles have arrived. A tour that is not over yet takes them in place of
 * its straight-line estimates, once; a finished tour keeps the miles it was
 * planned at, so its figures against plan never move after the fact.
 */
function sharpenDrives(data: Stored): Stored {
  let changed = false;
  const tours = data.tours.map((tour) => {
    if (tour.setup || tourPhase(tour, todayFor(tour)) === 'past') return tour;
    const draft = structuredClone(tour);
    if (!keepDrives(draft, true)) return tour;
    changed = true;
    return draft;
  });
  return changed ? { ...data, tours } : data;
}

function load(): Loaded {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: the app still works for the session.
  }
  if (!text) return { data: withDrives(fresh()), setAside: false };

  const result = readSaved(text);
  if (result?.complete) return { data: withDrives(result.data), setAside: false };

  // Something in the saved text is damaged or from a version this one does not
  // know. Keep a copy before the next save writes over it.
  try {
    localStorage.setItem(UNREADABLE_KEY, text);
  } catch {
    // Nothing more can be done without storage.
  }
  return { data: withDrives(result?.data ?? fresh()), setAside: true };
}

/**
 * Writes the tours to the device. False when the browser refused, because its
 * storage is full or switched off (as some private windows do): the app still
 * works for the visit, and the screen says that nothing is being kept.
 */
function save(data: Stored): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** What a backup file holds: every tour, as it is saved on the device, with none open. */
export function backupOf(tours: Tour[]): string {
  const data: Stored = { version: VERSION, tours, activeTourId: '' };
  return JSON.stringify(data);
}

/**
 * The tours of a backup laid over the ones held. A tour in both is replaced
 * by the backup's copy; every other tour held is kept, so loading a backup
 * never removes a tour.
 */
export function withBackup(held: Tour[], backup: Tour[]): Tour[] {
  const incoming = new Set(backup.map((t) => t.id));
  return [...held.filter((t) => !incoming.has(t.id)), ...backup];
}

/** Today for a tour. A sample tour can pin it so it reads as mid-run. */
export const todayFor = (tour: Tour) => tour.demoToday ?? localToday();

export function TourProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(load);
  const [data, setData] = useState<Stored>(loaded.data);

  const [unsaved, setUnsaved] = useState(false);
  const held = useRef(data);
  /** Tours taken from another tab, which are on the device already and must not be written back. */
  const received = useRef<Stored | undefined>(undefined);
  useEffect(() => {
    held.current = data;
    if (received.current === data) return;
    setUnsaved(!save(data));
  }, [data]);

  // Each tab holds its own copy and writes all of it, so a tab left open would
  // write its old tours over what another tab has saved since. When another
  // tab saves, its tours replace the ones held here. The tour open in this tab
  // stays open, since which tour is open belongs to the tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue === null) return;
      const result = readSaved(e.newValue);
      if (!result?.complete) return;
      const mine = held.current.activeTourId;
      const next = { ...withDrives(result.data), activeTourId: result.data.tours.some((t) => t.id === mine) ? mine : '' };
      received.current = next;
      setData(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Figures looked up after the page opened (gas, lodging, road miles) change
  // what the screens work out, so each one redraws them.
  const [lookups, setLookups] = useState(0);
  useEffect(() => {
    const stop = onLookup(() => {
      setLookups((n) => n + 1);
      setData(sharpenDrives);
    });
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
        // A drive that is new since setup (a date added, a city changed) is held from here on.
        if (!draft.setup) keepDrives(draft);
        return draft;
      }),
    }));
  }, []);

  const restoreSamples = useCallback(() => {
    setData((prev) => ({ ...prev, tours: [...seedTours(), ...prev.tours.filter((t) => !SAMPLE_TOUR_IDS.includes(t.id))] }));
  }, []);

  const loadBackup = useCallback((tours: Tour[]) => {
    setData((prev) => withDrives({ ...prev, tours: withBackup(prev.tours, structuredClone(tours)) }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      tours: data.tours,
      setAside: loaded.setAside,
      unsaved,
      figures: figuresFrom(),
      tour: data.tours.find((t) => t.id === data.activeTourId),
      openTour,
      createTour,
      deleteTour,
      update,
      restoreSamples,
      loadBackup,
    }),
    // `lookups` is listed so that a new figure reaches every screen.
    [data, loaded, unsaved, lookups, openTour, createTour, deleteTour, update, restoreSamples, loadBackup],
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
