import { href, useRoute } from './router';
import { Budget } from './screens/Budget';
import { DateForm, Dates } from './screens/Dates';
import { DatesStep, NameStep, RatesStep } from './screens/NewTour';
import { OfferEntry, Offers } from './screens/Offers';
import { OneDate } from './screens/OneDate';
import { LineEdit, Rates } from './screens/Rates';
import { Tours } from './screens/Tours';
import { useTours } from './store';
import type { Tour } from './core';

type Tab = 'budget' | 'dates' | 'rates';

/** A screen inside the open tour, with the tab it belongs to. */
function tourScreen(route: string[]): { tab: Tab; el: React.ReactNode } {
  const [a, b, c] = route;
  switch (a) {
    case 'offers':
      return { tab: 'budget', el: <Offers /> };
    case 'offer':
      return { tab: 'budget', el: <OfferEntry key={b} dateId={b} /> };
    case 'date':
      return { tab: 'budget', el: <OneDate dateId={b} /> };
    case 'line':
      return { tab: 'budget', el: <LineEdit key={b} lineId={b} /> };
    case 'dates':
      if (b === 'new') return { tab: 'dates', el: <DateForm key="new" /> };
      if (b && c === 'edit') return { tab: 'dates', el: <DateForm key={b} dateId={b} /> };
      return { tab: 'dates', el: <Dates /> };
    case 'rates':
      return { tab: 'rates', el: <Rates /> };
    default:
      return { tab: 'budget', el: <Budget view={b === 'actuals' ? 'actuals' : 'plan'} /> };
  }
}

/**
 * The tour list is the way in. The Budget, Dates and Rates tabs belong to the
 * open tour, and a tour still being set up shows its setup steps instead.
 */
function screenFor(route: string[], tour: Tour | undefined): { tab?: Tab; el: React.ReactNode } {
  const [a, b] = route;
  if (a === 'tours' && b === 'new') return { el: <NameStep /> };
  if (!a || a === 'tours' || !tour) return { el: <Tours /> };
  if (tour.setup) {
    const step = a === 'setup' && (b === 'dates' || b === 'rates') ? b : tour.setup;
    return { el: step === 'rates' ? <RatesStep key={tour.id} /> : <DatesStep key={tour.id} /> };
  }
  return tourScreen(route);
}

const TABS: [Tab, string, string][] = [
  ['budget', 'Budget', '/budget/plan'],
  ['dates', 'Dates', '/dates'],
  ['rates', 'Rates', '/rates'],
];

export function App() {
  const { tour } = useTours();
  const { tab, el } = screenFor(useRoute(), tour);
  return (
    <div className="app">
      {el}
      {tab && (
        <nav className="bar" aria-label="Sections">
          {TABS.map(([id, label, to]) => (
            <a key={id} href={href(to)} aria-current={tab === id ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
