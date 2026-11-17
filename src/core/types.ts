// Data model from the handoff doc. A few fields were added for the prototype
// and are marked "added" below; everything else follows the doc.

export type Money = number; // the tour's currency, stored as whole cents

/** The currencies a tour can be kept in. One per tour; nothing is converted. */
export type Currency = 'USD' | 'EUR' | 'GBP';

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

/**
 * The miles a drive is planned at, written into the tour so the fuel plan
 * does not move when a road lookup arrives later or is lost with the device's
 * kept figures. `exact` marks road miles; without it the figure is the
 * straight-line estimate.
 */
export interface KeptDrive {
  miles: number;
  exact?: boolean;
}

/** Money a member or a label put in to get the tour on the road, and is owed back. */
export interface PutIn {
  id: string;
  who: string;
  amount: Money;
}

/** The outside figures a tour can hold as estimates rather than as the band's own. */
export type EstimatedRate = 'vanDailyRate' | 'mpg' | 'gasPrice' | 'lodgingPerNight' | 'perDiem' | 'merchCost';

export interface Tour {
  id: string;
  name: string;
  homeCity: string; // the route starts and ends here
  homePlace?: Place; // added
  currency?: Currency; // added: what every amount on the tour is in. Empty = US dollars
  commissions: Commission[];
  // Any rate left empty is estimated or worked out; see rates.ts. 0 is a real figure.
  vehicle: { dailyRate?: Money; days?: number; actual?: Money; final?: boolean };
  fuel: { mpg?: number; pricePerGallon?: Money; final?: boolean };
  people?: number; // added: everyone who travels, hired players and crew included. Empty = 4
  perDiem?: Money; // added: food for one person for one day
  foodFinal?: boolean; // added: food spending is finished, so what was spent is the figure
  merchPerShowDefault?: Money;
  merchCostRate?: number; // added: the share of merch sales that goes on the goods, fees and cuts. 0.40 = 40%
  lodgingPerNightDefault?: Money;
  lodgingRooms?: number; // added: rooms a night, behind the lodging estimate. Empty = one for every two people
  estimated?: EstimatedRate[]; // added: rates that hold an estimate kept from setup
  ratesFrom?: string; // added: the earlier tour a new tour's rates were started from
  putIn?: PutIn[]; // added: money to pay back before anything is shared out
  splitBetween?: number; // added: how many people share what the tour makes. Empty = everyone on the road
  dates: TourDate[]; // ordered by date
  lines: ExtraLine[]; // tour-wide extras, e.g. merch cost reimbursement
  milesHome?: number; // added: the leg from the last date back to homeCity. Empty = estimated
  drives?: Record<string, KeptDrive>; // added: the miles each untyped drive is planned at, kept once setup ends
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
  food?: Money; // added: food and per diems paid that day
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
