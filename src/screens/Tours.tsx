// The first screen: every tour on the device, grouped by where it sits
// against today. A plain list in the same ledger style as the other screens.

import { useState } from 'react';
import { budget, currentEstimates, formatMonth, formatRange, localToday, SAMPLE_TOUR_IDS, showDates, tourPhase, type Tour, type TourPhase } from '../core';
import { Amount } from '../components';
import { href } from '../router';
import { backupOf, readSaved, todayFor, UNREADABLE_KEY, useTours } from '../store';

const GROUPS: [TourPhase, string][] = [
  ['setup', 'Setting up'],
  ['underway', 'On the road'],
  ['upcoming', 'Coming up'],
  ['past', 'Past'],
];

const NEXT_STEP = { dates: 'add the dates', rates: 'set the rates' };

const firstDate = (t: Tour) => t.dates[0]?.date ?? '';

function sorted(tours: Tour[], phase: TourPhase): Tour[] {
  // Past tours read newest first; everything else in the order it happens.
  const byStart = [...tours].sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
  return phase === 'past' ? byStart.reverse() : byStart;
}

function when(tour: Tour): string {
  const shows = showDates(tour).length;
  const first = tour.dates[0];
  const last = tour.dates.at(-1);
  if (!first || !last) return 'No dates yet';
  return `${shows} ${shows === 1 ? 'show' : 'shows'} · ${formatRange(first.date, last.date)}`;
}

function TourRow({ tour, phase }: { tour: Tour; phase: TourPhase }) {
  const { openTour } = useTours();
  const sample = SAMPLE_TOUR_IDS.includes(tour.id);

  if (phase === 'setup') {
    const step = tour.setup ?? 'dates';
    return (
      <li>
        <a className="row" href={href('/setup/' + step)} onClick={() => openTour(tour.id)}>
          <span className="name">
            <span className="label">{tour.name || 'Untitled tour'}</span>
            <span className="note">
              {when(tour)} {'·'} next: {NEXT_STEP[step]}
            </span>
          </span>
          <span className="end">
            <span className="status">Continue</span>
            <span className="chev" aria-hidden="true">
              {'›'}
            </span>
          </span>
        </a>
      </li>
    );
  }

  const b = budget(tour);
  const [net, label] = phase === 'upcoming' ? [b.plan.net, 'Projected net'] : phase === 'underway' ? [b.now.net, 'Tracking net'] : [b.now.net, 'Final net'];
  return (
    <li>
      <a className="row" href={href('/budget/plan')} onClick={() => openTour(tour.id)}>
        <span className="name">
          <span className="label">{tour.name || 'Untitled tour'}</span>
          <span className="note">
            {when(tour)}
            {sample ? ' · Sample' : ''}
          </span>
        </span>
        <span className="end">
          <Amount value={net} />
          <span className="chev" aria-hidden="true">
            {'›'}
          </span>
          <span className="note">{label}</span>
        </span>
      </a>
    </li>
  );
}

const count = (n: number) => `${n} ${n === 1 ? 'tour' : 'tours'}`;

/** A backup file chosen to load, read but not yet taken. */
interface Picked {
  tours: Tour[];
  /** How many of them are on the device already, and would be replaced. */
  held: number;
  /** True when some tours in the file could not be read and are left out. */
  partial: boolean;
}

/**
 * Tours live on one device, so a file is the only copy anywhere else: it is
 * the way to keep them safe, move them to a new phone or hand them to a
 * bandmate. Loading asks first, since a tour already here is replaced.
 */
function Backup() {
  const { tours, loadBackup } = useTours();
  const [picked, setPicked] = useState<Picked | 'unreadable'>();
  const [loaded, setLoaded] = useState(0);

  const save = () => {
    const url = URL.createObjectURL(new Blob([backupOf(tours)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tourmo-backup-${localToday()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLoaded(0);
    const result = readSaved(await file.text().catch(() => ''));
    if (!result || result.data.tours.length === 0) return setPicked('unreadable');
    const have = new Set(tours.map((t) => t.id));
    setPicked({ tours: result.data.tours, held: result.data.tours.filter((t) => have.has(t.id)).length, partial: !result.complete });
  };

  return (
    <section className="section" aria-labelledby="tours-backup">
      <div className="section-head">
        <h2 className="heading" id="tours-backup">
          Backup
        </h2>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Your tours are kept on this device only. A backup file holds all of them: keep it somewhere safe, or send it to a bandmate to load into the app on their own phone.
      </p>
      <button className="btn quiet" type="button" onClick={save}>
        Save a backup file
      </button>
      <label className="btn quiet">
        Load a backup file
        <input
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = ''; // so the same file can be chosen again
          }}
        />
      </label>

      {picked === 'unreadable' && (
        <p className="note bad" role="alert" style={{ marginTop: 12 }}>
          That file is not a tourmo backup, so nothing was loaded.
        </p>
      )}
      {picked && picked !== 'unreadable' && (
        <div role="alert">
          <p className="note" style={{ marginTop: 12 }}>
            The file holds {count(picked.tours.length)}.{' '}
            {picked.held === 0
              ? 'None of them is on this device yet, so they are added.'
              : picked.held === picked.tours.length
                ? "All of them are on this device already and are replaced by the file's copy."
                : `${picked.held} of them ${picked.held === 1 ? 'is' : 'are'} on this device already and ${picked.held === 1 ? 'is' : 'are'} replaced by the file's copy. The rest are added.`}{' '}
            No other tour is touched.
          </p>
          {picked.partial && <p className="note bad">Some tours in the file could not be read and are left out.</p>}
          <div className="btn-row">
            <button className="btn quiet" type="button" onClick={() => setPicked(undefined)}>
              Cancel
            </button>
            <button
              className="btn"
              type="button"
              style={{ marginTop: 16, minHeight: 48 }}
              onClick={() => {
                loadBackup(picked.tours);
                setLoaded(picked.tours.length);
                setPicked(undefined);
              }}
            >
              Load {count(picked.tours.length)}
            </button>
          </div>
        </div>
      )}
      {loaded > 0 && (
        <p className="note" role="status" style={{ marginTop: 12 }}>
          Loaded {count(loaded)} from the file.
        </p>
      )}
    </section>
  );
}

export function Tours() {
  const { tours, setAside, figures, restoreSamples } = useTours();
  const { gas, lodging, van } = currentEstimates();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const phases = new Map(tours.map((t) => [t.id, tourPhase(t, todayFor(t))]));

  return (
    <main className="screen">
      <header className="screen-head">
        <h1 className="title">Tours</h1>
        <p className="note">
          {count(tours.length)} on this device.
        </p>
      </header>

      {setAside && (
        <p className="note bad" role="alert" style={{ marginBottom: 16 }}>
          Some saved data on this device could not be read, so it is not shown. A copy was kept in the browser's storage under {UNREADABLE_KEY}.
        </p>
      )}

      {tours.length === 0 && <p>No tours yet. Plan the first one below.</p>}

      {GROUPS.map(([phase, heading], i) => {
        const group = sorted(
          tours.filter((t) => phases.get(t.id) === phase),
          phase,
        );
        if (group.length === 0) return null;
        const id = 'tours-' + phase;
        return (
          <section className="section" key={phase} aria-labelledby={id} style={i === 0 ? { marginTop: 0 } : undefined}>
            <div className="section-head">
              <h2 className="heading" id={id}>
                {heading}
              </h2>
            </div>
            <ul className="rows">
              {group.map((t) => (
                <TourRow key={t.id} tour={t} phase={phase} />
              ))}
            </ul>
          </section>
        );
      })}

      <a className="btn" href={href('/tours/new')}>
        Plan a new tour
      </a>

      <Backup />

      <section className="section" aria-labelledby="tours-figures">
        <div className="section-head">
          <h2 className="heading" id="tours-figures">
            Figures behind the estimates
          </h2>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          {figures === 'live'
            ? 'Looked up just now.'
            : figures === 'kept'
              ? 'Kept from the last time they were looked up. The lookup server is not answering, so these and straight-line drive estimates are used.'
              : 'The figures saved with the app. The lookup server is not answering, so these and straight-line drive estimates are used.'}{' '}
          Gas prices: week of {formatRange(gas.asOf, gas.asOf)}. Lodging rates: federal year {lodging.fiscalYear}. Van rental: {formatMonth(van.asOf)}.
        </p>
      </section>

      <section className="section" aria-labelledby="tours-sample">
        <div className="section-head">
          <h2 className="heading" id="tours-sample">
            Sample tours
          </h2>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Summer weekender, Fall run and Spring run are samples with invented figures. Restoring puts those three back as they first loaded. Your own tours are left alone.
        </p>
        <button
          className="btn plain"
          type="button"
          onClick={() => {
            if (!confirmRestore) return setConfirmRestore(true);
            restoreSamples();
            setConfirmRestore(false);
          }}
        >
          {confirmRestore ? 'Tap again to restore the three samples' : 'Restore the sample tours'}
        </button>
      </section>
    </main>
  );
}
