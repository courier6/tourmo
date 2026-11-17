// The context the store is handed down through. It lives in its own file so
// that it stays the same object when store.tsx is hot-reloaded during
// development; otherwise the screens and the provider stop matching.

import { createContext } from 'react';
import type { Place, Tour } from './core';

export interface Store {
  tours: Tour[];
  /** True when saved data could not be read at start-up and a copy was kept. */
  setAside: boolean;
  /** Where the gas and lodging figures in use came from: looked up now, kept from an earlier visit, or saved with the app. */
  figures: 'live' | 'kept' | 'saved';
  /** The open tour, if there is one. */
  tour: Tour | undefined;
  openTour: (id: string) => void;
  /** Adds an empty tour at the first setup step, opens it and returns its id. */
  createTour: (name: string, homeCity: string, homePlace?: Place) => string;
  deleteTour: (id: string) => void;
  /** Change the open tour by editing the draft that is passed in. */
  update: (edit: (draft: Tour) => void) => void;
  /** Puts the sample tours back as they first loaded. Other tours are kept. */
  restoreSamples: () => void;
}

export const Ctx = createContext<Store | null>(null);
