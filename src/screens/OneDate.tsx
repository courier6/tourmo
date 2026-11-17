import { useState } from 'react';
import {
  dateAgainstPlan,
  dateCommissions,
  expenseDiff,
  explainPayout,
  foodPlan,
  foodSpent,
  formatDay,
  formatMoney,
  formatNumber,
  fuelForDrive,
  fuelOnDate,
  fuelPlan,
  fuelSpent,
  netDiff,
  newId,
  revenueDiff,
  settledWithoutPayout,
  showActual,
  showPlan,
  tourRates,
  type Diff,
  type Money,
  type Tour,
  type TourDate,
} from '../core';
import { Amount, Back, Check, MoneyField, MoneyInput, TextField } from '../components';
import { href } from '../router';
import { useTour } from '../store';

/** "$50 over plan" under a line that differs. */
function VsPlan({ diff }: { diff: Diff }) {
  if (diff.tone === 'flat') return null;
  const words = /over|under/.test(diff.text) ? `${diff.text} plan` : `${diff.text} vs plan`;
  return <span className={`note ${diff.tone}`}>{words}</span>;
}

const NoPlan = () => (
  <span className="note" aria-label="No plan amount">
    {'—'}
  </span>
);

function AddDateExpense({ onAdd }: { onAdd: (label: string, amount: Money) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<Money | undefined>();
  if (!open) {
    return (
      <button className="btn quiet" type="button" onClick={() => setOpen(true)}>
        Add an expense for this date
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setLabel('');
    setAmount(undefined);
  };
  const add = () => {
    if (!label.trim() || amount === undefined) return;
    onAdd(label.trim(), amount);
    close();
  };
  return (
    <form
      className="inline-form"
      aria-label="Add an expense for this date"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <TextField label="What was it for?" value={label} onChange={setLabel} />
      <MoneyField label="Amount paid" value={amount} onChange={setAmount} note="Not in the plan, so the whole amount counts as over." />
      <div className="btn-row">
        <button className="btn quiet" type="button" onClick={close}>
          Cancel
        </button>
        <button className="btn" style={{ marginTop: 16, minHeight: 48 }} type="submit">
          Add
        </button>
      </div>
    </form>
  );
}

function Entries({ tour, date }: { tour: Tour; date: TourDate }) {
  const { update } = useTour();
  // Each entry is saved as it is typed, like Rates. Nothing waits for a Save
  // button, so leaving the screen by any route keeps what was entered.
  const edit = (change: (d: TourDate) => void) =>
    update((t) => {
      const d = t.dates.find((x) => x.id === date.id);
      if (d) change(d);
    });
  const [overrideOpen, setOverrideOpen] = useState(date.showActualOverride !== undefined);

  const isShow = date.kind === 'show';
  const offer = date.offer;
  const paid = showActual(date);
  const result = dateAgainstPlan(tour, date);
  const commissions = dateCommissions(tour, date);
  const fuelLeft = fuelPlan(tour) - fuelSpent(tour);
  const drive = fuelForDrive(tour, date);
  const foodLeft = foodPlan(tour) - foodSpent(tour);
  const { perDiem, people } = tourRates(tour);
  const summary = netDiff(0, result.vsPlan);
  const extrasIn = date.lines.filter((l) => l.direction === 'in');
  const extrasOut = date.lines.filter((l) => l.direction === 'out');
  const setLineActual = (id: string, actual: Money | undefined) =>
    edit((d) => {
      const line = d.lines.find((l) => l.id === id);
      if (line) line.actual = actual;
    });

  return (
    <>
      {(isShow || extrasIn.length > 0) && (
        <section className="section" style={{ marginTop: 8 }} aria-label="Money in">
          <div className="pa-head">
            <h2>Money in</h2>
            <span>Plan</span>
            <span>Actual</span>
          </div>

          {isShow && offer && offer.type !== 'flat' && (
            <div className="pa-row">
              <div className="name">
                <label htmlFor="box-office">Box office, {offer.basis}</label>
                <span className="note">The figure on the settlement sheet</span>
              </div>
              <div className="plan">
                <NoPlan />
              </div>
              <MoneyInput id="box-office" value={date.boxOffice} onChange={(v) => edit((d) => (d.boxOffice = v))} />
            </div>
          )}

          {isShow && (
            <div className="pa-row">
              <div className="name">
                <span className="label">Show payout</span>
                <span className="note" role="status">
                  {!offer
                    ? 'No offer entered for this date.'
                    : date.showActualOverride !== undefined
                      ? 'Entered by hand, in place of the calculated payout.'
                      : date.boxOffice !== undefined || offer.type === 'flat'
                        ? explainPayout(offer, date.boxOffice ?? 0)
                        : 'Enter the box office to work this out.'}
                </span>
                {paid !== undefined && <VsPlan diff={revenueDiff(showPlan(date), paid)} />}
              </div>
              <div className="plan">
                <Amount value={showPlan(date)} />
              </div>
              <div className="actual">{paid === undefined ? <NoPlan /> : <Amount value={paid} />}</div>
            </div>
          )}

          {isShow && (
            <details className="more" open={overrideOpen} onToggle={(e) => setOverrideOpen(e.currentTarget.open)}>
              <summary>Promoter paid a different amount?</summary>
              <div className="pa-row" style={{ border: 0, minHeight: 0, padding: 0 }}>
                <div className="name">
                  <label htmlFor="override">Amount actually paid</label>
                  <span className="note">Replaces the calculated payout. Leave empty to use the formula.</span>
                </div>
                <div className="plan" />
                <MoneyInput id="override" value={date.showActualOverride} onChange={(v) => edit((d) => (d.showActualOverride = v))} />
              </div>
            </details>
          )}

          {isShow && (
            <div className="pa-row">
              <div className="name">
                <label htmlFor="merch">Merch</label>
                {date.merch.actual !== undefined && <VsPlan diff={revenueDiff(date.merch.plan, date.merch.actual)} />}
              </div>
              <div className="plan">
                <Amount value={date.merch.plan} />
              </div>
              <MoneyInput id="merch" value={date.merch.actual} onChange={(v) => edit((d) => (d.merch.actual = v))} />
            </div>
          )}

          {extrasIn.map((l) => (
            <div className="pa-row" key={l.id}>
              <div className="name">
                <label htmlFor={'line-' + l.id}>{l.label}</label>
                {l.actual !== undefined && <VsPlan diff={revenueDiff(l.plan, l.actual)} />}
              </div>
              <div className="plan">
                <Amount value={l.plan} />
              </div>
              <MoneyInput id={'line-' + l.id} value={l.actual} onChange={(v) => setLineActual(l.id, v)} />
            </div>
          ))}
        </section>
      )}

      <section className="section" aria-label="Money out">
        <div className="pa-head">
          <h2>Money out</h2>
          <span>Plan</span>
          <span>Actual</span>
        </div>

        <div className="pa-row">
          <div className="name">
            <label htmlFor="lodging">Lodging</label>
            {date.lodging.plan === 0 && date.lodging.actual === undefined && <span className="note">None planned tonight</span>}
            {date.lodging.actual !== undefined && <VsPlan diff={expenseDiff(date.lodging.plan, date.lodging.actual)} />}
          </div>
          <div className="plan">
            <Amount value={date.lodging.plan} />
          </div>
          <MoneyInput id="lodging" value={date.lodging.actual} onChange={(v) => edit((d) => (d.lodging.actual = v))} />
        </div>

        <div className="pa-row">
          <div className="name">
            <label htmlFor="fuel">Fuel bought</label>
            {drive.miles > 0 && (
              <span className="note">
                About {formatMoney(drive.cost)} for the {formatNumber(drive.miles)} mi drive in
              </span>
            )}
            <span className="note">
              {fuelLeft >= 0 ? `${formatMoney(fuelLeft)} left in the tour fuel budget` : `Tour fuel budget is ${formatMoney(-fuelLeft)} over`}
            </span>
          </div>
          <div className="plan">
            <NoPlan />
          </div>
          <MoneyInput id="fuel" value={date.fuelFillUps.length ? fuelOnDate(date) : undefined} onChange={(v) => edit((d) => (d.fuelFillUps = v === undefined ? [] : [v]))} />
        </div>

        <div className="pa-row">
          <div className="name">
            <label htmlFor="food">Food and per diems</label>
            {perDiem.value > 0 && (
              <span className="note">
                About {formatMoney(perDiem.value * people)} a day for {people} {people === 1 ? 'person' : 'people'}
              </span>
            )}
            <span className="note">{foodLeft >= 0 ? `${formatMoney(foodLeft)} left in the tour food budget` : `Tour food budget is ${formatMoney(-foodLeft)} over`}</span>
          </div>
          <div className="plan">
            <NoPlan />
          </div>
          <MoneyInput id="food" value={date.food} onChange={(v) => edit((d) => (d.food = v))} />
        </div>

        {commissions.map((c) => (
          <div className="pa-row" key={c.id}>
            <div className="name">
              <span className="label">{c.label}</span>
              <span className="note">Worked out from the payout</span>
              {c.actual !== undefined && <VsPlan diff={expenseDiff(c.plan, c.actual)} />}
            </div>
            <div className="plan">
              <Amount value={c.plan} />
            </div>
            <div className="actual">{c.actual === undefined ? <NoPlan /> : <Amount value={c.actual} />}</div>
          </div>
        ))}

        {extrasOut.map((l) => (
          <div className="pa-row" key={l.id}>
            <div className="name">
              <label htmlFor={'line-' + l.id}>{l.label}</label>
              {l.actual !== undefined && <VsPlan diff={expenseDiff(l.plan, l.actual)} />}
              <button className="text-btn" type="button" style={{ display: 'block', padding: 0 }} onClick={() => edit((d) => (d.lines = d.lines.filter((x) => x.id !== l.id)))}>
                Remove<span className="sr-only"> {l.label}</span>
              </button>
            </div>
            <div className="plan">
              <Amount value={l.plan} />
            </div>
            <MoneyInput id={'line-' + l.id} value={l.actual} onChange={(v) => setLineActual(l.id, v)} />
          </div>
        ))}

        <AddDateExpense onAdd={(label, amount) => edit((d) => d.lines.push({ id: newId('line'), label, direction: 'out', plan: 0, actual: amount }))} />
      </section>

      <div className="headline" style={{ marginTop: 24 }} role="status">
        <p className="label">This date against plan</p>
        {result.hasActuals ? (
          <>
            <p className={`figure ${summary.tone === 'flat' ? '' : summary.tone}`} style={{ fontSize: 32 }}>
              {summary.tone === 'flat' ? 'On plan' : summary.text}
            </p>
            {result.causes.length > 0 && (
              <ul>
                {result.causes.map((c, i) => (
                  <li key={i}>
                    <span>{c.label}</span>
                    <span className={`money ${c.diff.tone}`}>{c.diff.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="sub">Fuel and food are left out here. They count against their tour-wide budgets.</p>
          </>
        ) : (
          <p className="verdict" style={{ marginTop: 4 }}>
            Nothing entered yet
          </p>
        )}
      </div>

      <Check label="This date is settled" checked={date.settled} onChange={(v) => edit((d) => (d.settled = v))} />
      {settledWithoutPayout(date) && (
        <p className="note bad" role="alert">
          {offer
            ? `Settled, but the payout is not in. Until the box office or the amount paid is entered above, this show counts at its plan of ${formatMoney(showPlan(date))}.`
            : 'Settled, but this date has no offer and no amount paid, so it counts as $0. Enter the amount paid above.'}
        </p>
      )}

      <a className="btn" href={href('/budget/actuals')} style={{ marginTop: 12 }}>
        Done
      </a>
    </>
  );
}

export function OneDate({ dateId }: { dateId: string }) {
  const { tour } = useTour();
  const date = tour.dates.find((d) => d.id === dateId);
  if (!date) {
    return (
      <main className="screen">
        <Back to="/budget/actuals">Actuals</Back>
        <p>That date is no longer on the tour.</p>
      </main>
    );
  }
  return (
    <main className="screen">
      <Back to="/budget/actuals">Actuals</Back>
      <header className="screen-head">
        <h1 className="title">{date.city}</h1>
        <p className="note">
          {formatDay(date.date)}
          {date.kind === 'show' ? (
            <>
              {' · '}
              <a href={href('/offer/' + date.id)} className="money">
                {date.offer?.raw || 'Add the offer'}
              </a>
            </>
          ) : (
            ` · ${date.kind === 'off' ? 'Off day' : 'Travel day'}`
          )}
        </p>
        <p className="note">Changes save as you type.</p>
      </header>
      <Entries key={date.id} tour={tour} date={date} />
    </main>
  );
}
