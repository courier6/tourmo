// Data model from the handoff doc. A few fields were added for the prototype
// and are marked "added" below; everything else follows the doc.

export type Money = number; // US dollars, stored as whole cents

export interface PlanActual {
  plan: Money;
  actual?: Money; // undefined = not entered yet. This is different from 0.
}

/** Where a city is, for estimating drives. Set when a city is picked from the list. */
export interface Place {
  lat: number;
  lon: number;
  area?: string; // the lodging-rate area the city falls in, when it has its own rate
}

/** The outside figures a tour can hold as estimates rather than as the band's own. */
export type EstimatedRate = 'vanDailyRate' | 'mpg' | 'gasPrice' | 'lodgingPerNight';

export interface Tour {
  id: string;
  name: string;
  homeCity: string; // the route starts and ends here
  homePlace?: Place; // added
  commissions: Commission[];
  // Any rate left empty is estimated or worked out; see rates.ts. 0 is a real figure.
  vehicle: { dailyRate?: Money; days?: number; actual?: Money; final?: boolean };
  fuel: { mpg?: number; pricePerGallon?: Money; final?: boolean };
  merchPerShowDefault?: Money;
  lodgingPerNightDefault?: Money;
  lodgingRooms?: number; // added: rooms a night, behind the lodging estimate
  estimated?: EstimatedRate[]; // added: rates that hold an estimate kept from setup
  ratesFrom?: string; // added: the earlier tour a new tour's rates were started from
  dates: TourDate[]; // ordered by date
  lines: ExtraLine[]; // tour-wide extras, e.g. merch cost reimbursement
  milesHome?: number; // added: the leg from the last date back to homeCity. Empty = estimated
  demoToday?: string; // added: sample data only, pins "today" so the tour reads as mid-run
  setup?: SetupStep; // added: the step a new tour has reached; absent once it is set up
}

/** The new-tour steps that come after naming it. */
export type SetupStep = 'dates' | 'rates';

export interface Commission {
  id: string;
  name: string; // "Agent", "Manager"
  rate: number; // 0.10 = 10%
  base: 'show' | 'show+merch'; // v1 default: 'show'
}

export type DateKind = 'show' | 'off' | 'travel';

export interface TourDate {
  id: string;
  date: string; // ISO date
  city: string;
  place?: Place; // added
  kind: DateKind;
  milesFromPrevious?: number; // typed by hand. Empty = estimated from the two places
  offer?: Offer; // show dates only
  boxOffice?: Money; // the figure the percentage applies to, entered at settlement
  showActualOverride?: Money; // when the promoter pays something the formula does not give
  merch: PlanActual; // plan defaults from the tour, editable per date
  lodging: PlanActual; // plan is 0 on nights with no lodging
  fuelFillUps: Money[]; // logged on the day they are bought
  lines: ExtraLine[]; // per-date extras, in or out, e.g. a lodging buyout
  settled: boolean;
}

export type OfferType = 'flat' | 'versus' | 'plus' | 'percentage';
export type OfferBasis = 'gross' | 'net';

export interface Offer {
  raw: string; // exactly what the user typed, always kept
  type: OfferType;
  guarantee: Money; // 0 for a percentage-only deal
  percentage?: number; // 0.70 = 70%
  threshold?: Money; // 'plus' deals: the percentage applies above this
  basis: OfferBasis; // what the percentage is taken of
}

export interface ExtraLine {
  id: string;
  label: string;
  direction: 'in' | 'out';
  plan: Money;
  actual?: Money;
  final?: boolean; // tour-wide lines only
}
