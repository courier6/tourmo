import { useState } from 'react';
import {
  cityName,
  describeOffer,
  examplePayouts,
  formatDay,
  guaranteedMinimum,
  parseOffer,
  SHORTHAND_EXAMPLES,
  showDates,
  showPlan,
  toOffer,
  type Money,
  type OfferBasis,
  type OfferType,
  type ParsedOffer,
} from '../core';
import { Amount, Back, MoneyField, NumberField, SelectField } from '../components';
import { useCurrency, useMoney } from '../currency';
import { go, href } from '../router';
import { useTour } from '../store';

/** Reached by tapping "Show guarantees" on the plan. */
export function Offers() {
  const { tour } = useTour();
  const shows = showDates(tour);
  return (
    <main className="screen">
      <Back to="/budget/plan">Plan</Back>
      <header className="screen-head">
        <h1 className="title">Show guarantees</h1>
        <p className="note">The guaranteed minimum of each offer goes into the plan.</p>
      </header>
      <ul className="rows" style={{ borderTop: '1px solid var(--ink)' }}>
        {shows.map((d) => (
          <li key={d.id}>
            <a className="row" href={href('/offer/' + d.id)}>
              <span className="name">
                <span className="label">
                  {formatDay(d.date)} {'·'} {cityName(d.city)}
                </span>
                <span className="note money">{d.offer?.raw || 'No offer yet'}</span>
              </span>
              <span className="end">
                <Amount value={showPlan(d)} />
                <span className="chev" aria-hidden="true">
                  {'›'}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {!shows.length && <p className="note" style={{ marginTop: 16 }}>No show dates yet. Add them under Dates.</p>}
    </main>
  );
}

interface Fields {
  type: OfferType;
  guarantee?: Money;
  percentage?: number;
  threshold?: Money;
  basis: OfferBasis;
}

const fromParse = (p: ParsedOffer): Fields => ({
  type: p.type ?? 'flat',
  guarantee: p.guarantee,
  percentage: p.percentage,
  threshold: p.threshold,
  basis: p.basis,
});

const FIELDS: (keyof Fields)[] = ['type', 'guarantee', 'percentage', 'threshold', 'basis'];
/** The fields where a and b differ. */
const differing = (a: Fields, b: Fields) => FIELDS.filter((k) => a[k] !== b[k]);

const TYPES: [OfferType, string][] = [
  ['flat', 'Flat guarantee'],
  ['versus', 'Versus: guarantee or a percentage'],
  ['plus', 'Plus: guarantee and a percentage over a threshold'],
  ['percentage', 'Percentage only'],
];

export function OfferEntry({ dateId }: { dateId: string }) {
  const { tour, update } = useTour();
  const currency = useCurrency();
  const money = useMoney();
  const date = tour.dates.find((d) => d.id === dateId);
  const shows = showDates(tour);

  const [raw, setRaw] = useState(date?.offer?.raw ?? '');
  const [fields, setFields] = useState<Fields>(() => (date?.offer ? { ...date.offer } : fromParse(parseOffer(''))));
  const [reading, setReading] = useState<ParsedOffer>(() => parseOffer(date?.offer?.raw ?? ''));
  // The fields corrected by hand. On a saved offer they are the ones that differ from what its text reads as.
  const [byHand, setByHand] = useState<(keyof Fields)[]>(() => (date?.offer ? differing({ ...date.offer }, fromParse(parseOffer(date.offer.raw))) : []));

  if (!date) {
    return (
      <main className="screen">
        <Back to="/offers">Offers</Back>
        <p>That date is no longer on the tour.</p>
      </main>
    );
  }

  // Editing the text reads it again. A field corrected by hand keeps the
  // correction unless the edit changed what the text says about that field, so
  // fixing a typo does not put "Taken of" back to gross.
  const onRaw = (text: string) => {
    setRaw(text);
    const p = parseOffer(text);
    const read = fromParse(p);
    const changed = differing(fromParse(reading), read);
    // Writing "gross" or "net" where neither stood before says something new about the basis, even when the reading is the same.
    if (p.basisAssumed !== reading.basisAssumed) changed.push('basis');
    const kept = byHand.filter((k) => !changed.includes(k));
    setReading(p);
    setByHand(kept);
    setFields({ ...read, ...Object.fromEntries(kept.map((k) => [k, fields[k]])) });
  };
  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setByHand((keys) => [...new Set([...keys, ...(Object.keys(patch) as (keyof Fields)[])])]);
  };

  const offer = toOffer({ raw, ...fields });
  const empty = raw.trim() === '';
  const needsPercentage = offer.type !== 'flat' && offer.percentage === undefined;
  const needsThreshold = offer.type === 'plus' && offer.threshold === undefined;

  return (
    <main className="screen">
      <Back to="/offers">Offers</Back>
      <header className="screen-head">
        <h1 className="title">{date.city}</h1>
        <p className="note">
          {formatDay(date.date)} {'·'} Show {shows.findIndex((d) => d.id === date.id) + 1} of {shows.length}
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update((t) => {
            const d = t.dates.find((x) => x.id === dateId);
            if (d) d.offer = offer;
          });
          go('/offers');
        }}
      >
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="offer-raw">The offer, the way the promoter sent it</label>
          <input
            id="offer-raw"
            className="input offer"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={raw}
            placeholder="$1K vs 70%"
            aria-describedby="offer-forms"
            onChange={(e) => onRaw(e.target.value)}
          />
        </div>

        <section className="panel" aria-labelledby="read-as">
          <h2 className="eyebrow" id="read-as">
            Read as
          </h2>
          <p className="reading" role="status">
            {empty ? 'Type an offer above, or fill in the fields.' : reading.ok || fields.guarantee !== undefined ? describeOffer(offer, currency) : 'Could not read that. Fill in the fields below; your text is kept as typed.'}
          </p>
          {!empty && reading.doubts.length > 0 && (
            <div className="note bad" role="alert" style={{ marginTop: 4 }}>
              <p>Check this reading. Correct the fields below if it is wrong; your text is kept as typed.</p>
              {reading.doubts.map((d) => (
                <p key={d}>{d}</p>
              ))}
            </div>
          )}
          {!empty && reading.type !== undefined && reading.basisAssumed && offer.type !== 'flat' && offer.basis === 'gross' && (
            <p className="note" style={{ marginTop: 4 }}>
              Neither gross nor net was written, so the percentage is taken of the gross.
            </p>
          )}
          {needsThreshold && (
            <p className="note bad" style={{ marginTop: 4 }}>
              A plus deal needs a threshold. Until one is entered, only the guarantee counts.
            </p>
          )}
          {needsPercentage && !needsThreshold && (
            <p className="note bad" style={{ marginTop: 4 }}>
              This deal needs a percentage.
            </p>
          )}

          <SelectField label="Deal type" value={fields.type} onChange={(type) => set({ type })} options={TYPES} />
          {fields.type !== 'percentage' && <MoneyField label="Guarantee" value={fields.guarantee} onChange={(guarantee) => set({ guarantee })} />}
          {fields.type !== 'flat' && (
            <div className="grid-2">
              <NumberField
                label="Percentage"
                suffix="%"
                value={fields.percentage === undefined ? undefined : Math.round(fields.percentage * 10000) / 100}
                onChange={(n) => set({ percentage: n === undefined ? undefined : n / 100 })}
              />
              <SelectField
                label="Taken of"
                value={fields.basis}
                onChange={(basis) => set({ basis })}
                options={[
                  ['gross', 'Gross'],
                  ['net', 'Net'],
                ]}
              />
            </div>
          )}
          {fields.type === 'plus' && <MoneyField label="Threshold" value={fields.threshold} onChange={(threshold) => set({ threshold })} note="The percentage applies to box office above this." />}
        </section>

        <section className="section" aria-labelledby="into-plan">
          <div className="section-head">
            <h2 className="heading" id="into-plan">
              Goes into your plan
            </h2>
            <Amount value={guaranteedMinimum(offer)} />
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            The guaranteed minimum. Anything the door adds shows up in Actuals once the show is settled.
          </p>
        </section>

        <section className="section" aria-labelledby="deal-pays">
          <div className="section-head">
            <h2 className="heading" id="deal-pays">
              What this deal pays
            </h2>
          </div>
          <ul className="rows">
            {examplePayouts(offer).map((row) => (
              <li className="row" key={row.basis} style={{ minHeight: 48 }}>
                <span className="name">
                  If the {offer.basis} is <span className="money">{money(row.basis)}</span>
                </span>
                <Amount value={row.payout} />
              </li>
            ))}
          </ul>
        </section>

        <p className="note" id="offer-forms" style={{ marginTop: 16 }}>
          Also reads: <span className="money">{SHORTHAND_EXAMPLES.join('  ·  ')}</span>
        </p>

        <button className="btn" type="submit">
          Save offer
        </button>
      </form>
    </main>
  );
}
