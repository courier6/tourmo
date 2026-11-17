import { useState } from 'react';
import {
  budget,
  cityName,
  dateAgainstPlan,
  dateStatus,
  expenseDiff,
  CURRENCIES,
  formatDay,
  formatDistance,
  formatRange,
  lineDiff,
  listed,
  missingFigures,
  netDiff,
  newId,
  revenueDiff,
  routeMiles,
  safeToSpend,
  SAMPLE_TOUR_IDS,
  showActual,
  showDates,
  settledWithoutPayout,
  showPlan,
  splitFor,
  STATUS_LABEL,
  unitsOf,
  type Budget as BudgetData,
  type BudgetLine,
  type Money,
  type Tour,
  type TourDate,
} from '../core';
import { Amount, Back, DiffText, MoneyField, NumberField, TextField } from '../components';
import { useCurrency, useMoney } from '../currency';
import { href } from '../router';
import { useTour } from '../store';

function lineLink(line: BudgetLine): string | undefined {
  if (line.kind === 'shows') return '/offers';
  if (line.kind === 'extra') return '/line/' + line.id.replace('line:', '');
  return undefined;
}

function TourHeader({ tour }: { tour: Tour }) {
  const shows = showDates(tour);
  const first = tour.dates[0];
  const last = tour.dates.at(-1);
  const stops = tour.dates.map((d) => cityName(d.city)).filter((c, i, all) => c !== all[i - 1]);
  const home = cityName(tour.homeCity);
  const route = [...(stops[0] === home ? [] : [home]), ...stops, 'home'].join(' → ');
  return (
    <header className="screen-head">
      <h1 className="title">{tour.name}</h1>
      {first && last ? (
        <>
          <p className="note">
            {shows.length} {shows.length === 1 ? 'show' : 'shows'} {'·'} {formatRange(first.date, last.date)}
          </p>
          <p className="note">
            {route} {'·'} {formatDistance(routeMiles(tour), unitsOf(tour))}
          </p>
        </>
      ) : (
        <p className="note">No dates yet. Add them under Dates.</p>
      )}
    </header>
  );
}

type View = 'plan' | 'actuals' | 'split';

function Switch({ view }: { view: View }) {
  return (
    <nav className="switch" aria-label="Budget view">
      <a href={href('/budget/plan')} aria-current={view === 'plan' ? 'page' : undefined}>
        Plan
      </a>
      <a href={href('/budget/actuals')} aria-current={view === 'actuals' ? 'page' : undefined}>
        Actuals
      </a>
      <a href={href('/budget/split')} aria-current={view === 'split' ? 'page' : undefined}>
        Split
      </a>
    </nav>
  );
}

// ---------- Plan ----------

function PlanRow({ line }: { line: BudgetLine }) {
  const to = lineLink(line);
  const body = (
    <>
      <span className="name">
        <span className="label">{line.label}</span>
        <span className="note">{line.how}</span>
      </span>
      <span className="end">
        <Amount value={line.plan} />
        {to && (
          <span className="chev" aria-hidden="true">
            {'›'}
          </span>
        )}
      </span>
    </>
  );
  return to ? (
    <li>
      <a className="row" href={href(to)}>
        {body}
      </a>
    </li>
  ) : (
    <li className="row">{body}</li>
  );
}

/** Adds a tour-wide line to the plan: an expense, or income from outside the shows. */
function AddLine({ direction }: { direction: 'in' | 'out' }) {
  const { update } = useTour();
  const out = direction === 'out';
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<Money | undefined>();

  if (!open) {
    return (
      <button className="btn quiet" type="button" onClick={() => setOpen(true)}>
        {out ? 'Add an expense' : 'Add other income'}
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setLabel('');
    setAmount(undefined);
  };
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        update((t) => {
          t.lines.push({ id: newId('line'), label: label.trim(), direction, plan: amount ?? 0 });
        });
        close();
      }}
    >
      <TextField label={out ? 'What is it for?' : 'What is it?'} value={label} onChange={setLabel} />
      <MoneyField
        label="Planned amount"
        value={amount}
        onChange={setAmount}
        note={out ? "A tour-wide cost, such as a hired player's fee, insurance or a trailer." : 'Money for the tour that is not from a show or merch, such as tour support from a label.'}
      />
      <div className="btn-row">
        <button className="btn quiet" type="button" onClick={close}>
          Cancel
        </button>
        <button className="btn" style={{ marginTop: 16, minHeight: 48 }} type="submit">
          Add to plan
        </button>
      </div>
    </form>
  );
}

function Plan({ b, tour }: { b: BudgetData; tour: Tour }) {
  const money = useMoney();
  const net = b.plan.net;
  const missing = missingFigures(tour);
  const them = missing.length === 1 ? 'it' : 'them';
  return (
    <>
      <div className="headline">
        <p className="label">Projected net at guaranteed minimums</p>
        <p className="figure">{money(net)}</p>
        <p className={`verdict ${net >= 0 ? 'good' : 'bad'}`}>{net >= 0 ? 'In the black' : `Short by ${money(-net)}`}</p>
        <p className="sub pair">
          <span>
            In <Amount value={b.plan.revenue} />
          </span>
          <span>
            Out <Amount value={b.plan.expenses} />
          </span>
        </p>
      </div>

      {missing.length > 0 && (
        <p className="note bad" role="status" style={{ marginTop: 12 }}>
          Not in this plan yet: {listed(missing)}. There is no estimate for {them} outside the United States, so the plan counts {them} as 0. Type {them} under Rates.
        </p>
      )}

      <section className="section" aria-labelledby="plan-revenue">
        <div className="section-head">
          <h2 className="heading" id="plan-revenue">
            Revenue
          </h2>
          <Amount value={b.plan.revenue} />
        </div>
        <ul className="rows">
          {b.revenue.map((l) => (
            <PlanRow key={l.id} line={l} />
          ))}
        </ul>
        <AddLine direction="in" />
      </section>

      <section className="section" aria-labelledby="plan-expenses">
        <div className="section-head">
          <h2 className="heading" id="plan-expenses">
            Expenses
          </h2>
          <Amount value={b.plan.expenses} />
        </div>
        <ul className="rows">
          {b.expenses.map((l) => (
            <PlanRow key={l.id} line={l} />
          ))}
        </ul>
        <AddLine direction="out" />
      </section>
    </>
  );
}

// ---------- Actuals ----------

function LedgerRow({ line }: { line: BudgetLine }) {
  const currency = useCurrency();
  const to = line.kind === 'extra' ? lineLink(line) : line.kind === 'vehicle' || line.kind === 'fuel' || line.kind === 'food' || line.kind === 'merchCost' ? '/rates' : undefined;
  return (
    <tr>
      <th scope="row">
        {to ? <a href={href(to)}>{line.label}</a> : line.label}
        <span className="note">{line.progress}</span>
      </th>
      <td>
        <Amount value={line.plan} />
      </td>
      <td>
        <Amount value={line.now} />
      </td>
      <td>
        <DiffText diff={lineDiff(line, currency)} className="vs" />
      </td>
    </tr>
  );
}

function DateRow({ tour, date, today }: { tour: Tour; date: TourDate; today: string }) {
  const currency = useCurrency();
  const money = useMoney();
  const status = dateStatus(date, today);
  const result = dateAgainstPlan(tour, date);
  const paid = showActual(date);
  let figures: string;
  if (date.kind !== 'show') figures = date.kind === 'off' ? 'Off day' : 'Travel day';
  else if (result.hasActuals) {
    const parts = [paid !== undefined ? `Show ${money(paid)}` : `Guarantee ${money(showPlan(date))}`];
    if (date.merch.actual !== undefined) parts.push(`Merch ${money(date.merch.actual)}`);
    figures = parts.join(' · ');
  } else figures = date.offer ? `Guarantee ${money(showPlan(date))}` : 'No offer yet';
  // Ticked settled with no payout in: it still counts at its plan, so the row says what is missing.
  const unpaid = settledWithoutPayout(date);

  return (
    <li>
      <a className="row" href={href('/date/' + date.id)}>
        <span className="name">
          <span className="label">
            {formatDay(date.date)} {'·'} {cityName(date.city)}
          </span>
          <span className="note">{figures}</span>
        </span>
        <span className="end">
          <span className={`status ${unpaid ? 'bad' : status}`}>{unpaid ? 'Payout not entered' : STATUS_LABEL[status]}</span>
          {result.hasActuals && <DiffText diff={netDiff(0, result.vsPlan, currency)} className="note" />}
        </span>
      </a>
    </li>
  );
}

function Actuals({ b, tour, today }: { b: BudgetData; tour: Tour; today: string }) {
  const currency = useCurrency();
  const money = useMoney();
  const diff = netDiff(b.plan.net, b.now.net, currency);
  const safe = safeToSpend(tour, today);
  const unpaid = tour.dates.filter(settledWithoutPayout).length;
  return (
    <>
      <div className="headline">
        <p className="label">Now tracking to</p>
        <p className="figure">{money(b.now.net)}</p>
        <p className={`verdict ${diff.tone === 'flat' ? '' : diff.tone}`}>{diff.tone === 'flat' ? 'On plan' : diff.tone === 'good' ? `${diff.text} of plan` : `${diff.text} plan`}</p>
        <p className="label" style={{ marginTop: 2 }}>
          {b.settledCount} of {b.showCount} shows settled
          {unpaid > 0 && `, ${unpaid} with no payout entered and counted at plan`}
        </p>
        {safe ? (
          <p className="sub">
            Safe to spend: <Amount value={safe.perDay} /> a day for the {safe.daysLeft} {safe.daysLeft === 1 ? 'day' : 'days'} left, and the tour
            still ends in the black.
          </p>
        ) : (
          b.now.net <= 0 && <p className="sub">Nothing spare to spend: the tour is tracking {money(-b.now.net)} short.</p>
        )}
      </div>

      <table className="ledger">
        <caption className="sr-only">Every line: plan, where it stands now, and the difference</caption>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Plan</th>
            <th scope="col">Now</th>
            <th scope="col">vs plan</th>
          </tr>
        </thead>
        <tbody>
          {b.revenue.map((l) => (
            <LedgerRow key={l.id} line={l} />
          ))}
          <tr className="total">
            <th scope="row">Revenue</th>
            <td>
              <Amount value={b.plan.revenue} />
            </td>
            <td>
              <Amount value={b.now.revenue} />
            </td>
            <td>
              <DiffText diff={revenueDiff(b.plan.revenue, b.now.revenue, currency)} className="vs" />
            </td>
          </tr>
          <tr className="gap" aria-hidden="true">
            <td colSpan={4} />
          </tr>
          {b.expenses.map((l) => (
            <LedgerRow key={l.id} line={l} />
          ))}
          <tr className="total">
            <th scope="row">Expenses</th>
            <td>
              <Amount value={b.plan.expenses} />
            </td>
            <td>
              <Amount value={b.now.expenses} />
            </td>
            <td>
              <DiffText diff={expenseDiff(b.plan.expenses, b.now.expenses, currency)} className="vs" />
            </td>
          </tr>
          <tr className="total">
            <th scope="row">Net</th>
            <td>
              <Amount value={b.plan.net} />
            </td>
            <td>
              <Amount value={b.now.net} />
            </td>
            <td>
              <DiffText diff={diff} className="vs" />
            </td>
          </tr>
        </tbody>
      </table>

      <section className="section" aria-labelledby="by-date">
        <div className="section-head">
          <h2 className="heading" id="by-date">
            By date
          </h2>
        </div>
        <ul className="rows">
          {tour.dates.map((d) => (
            <DateRow key={d.id} tour={tour} date={d} today={today} />
          ))}
        </ul>
      </section>
    </>
  );
}

// ---------- Split ----------

function AddPutIn() {
  const { update } = useTour();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState<Money | undefined>();

  if (!open) {
    return (
      <button className="btn quiet" type="button" onClick={() => setOpen(true)}>
        Add money to pay back
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setWho('');
    setAmount(undefined);
  };
  return (
    <form
      className="inline-form"
      aria-label="Add money to pay back"
      onSubmit={(e) => {
        e.preventDefault();
        if (!who.trim() || !amount) return;
        update((t) => {
          (t.putIn ??= []).push({ id: newId('in'), who: who.trim(), amount });
        });
        close();
      }}
    >
      <TextField label="Who put it in?" value={who} onChange={setWho} note="A name, or the label." />
      <MoneyField label="Amount" value={amount} onChange={setAmount} />
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

/** Who gets what at the end: money put in is paid back, and what the tour made is shared. */
function Split({ b, tour }: { b: BudgetData; tour: Tour }) {
  const { update } = useTour();
  const currency = useCurrency();
  const money = useMoney();
  const s = splitFor(tour);
  const short = s.net < 0;
  const putIn = tour.putIn ?? [];
  const people = `${s.ways} ${s.ways === 1 ? 'person' : 'people'}`;

  return (
    <>
      <div className="headline">
        <p className="label">{short ? 'Nothing to share out, on the figures so far' : 'To share out, on the figures so far'}</p>
        <p className="figure">{money(short ? s.net : s.toShare)}</p>
        <p className={`verdict ${short ? 'bad' : 'good'}`}>{short ? `The tour is ${money(-s.net)} short` : s.ways === 1 ? 'All to one person' : `${money(s.each)} each, between ${people}`}</p>
        <p className="sub">
          {b.showCount === 0
            ? 'No shows yet.'
            : s.open
              ? `${s.open} of ${b.showCount} ${b.showCount === 1 ? 'show is' : 'shows are'} not settled, so this can still move.`
              : 'Every show is settled.'}
        </p>
      </div>

      <section className="section" aria-labelledby="split-ways">
        <div className="section-head">
          <h2 className="heading" id="split-ways">
            Shared between
          </h2>
        </div>
        <NumberField
          label="People sharing what the tour makes"
          suffix="people"
          value={tour.splitBetween}
          placeholder={String(s.ways)}
          onChange={(v) => update((t) => (t.splitBetween = v))}
          note={tour.splitBetween === undefined ? `Everyone on the road (${s.ways}) until you say otherwise. Leave out anyone who is paid a fee.` : undefined}
        />
      </section>

      <section className="section" aria-labelledby="split-in">
        <div className="section-head">
          <h2 className="heading" id="split-in">
            Money to pay back
          </h2>
          <Amount value={s.putIn} />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Money a member or a label put in to get the tour on the road, and is owed back. It is paid back before anything is shared out. Money that does not have to be paid back goes on the Plan, as other income.
        </p>
        {putIn.length > 0 && (
          <ul className="rows">
            {putIn.map((p) => (
              <li className="row" key={p.id}>
                <span className="name">
                  <span className="label">{p.who}</span>
                  <button className="text-btn" type="button" style={{ display: 'block', padding: 0 }} onClick={() => update((t) => (t.putIn = t.putIn?.filter((x) => x.id !== p.id)))}>
                    Remove<span className="sr-only"> {p.who}</span>
                  </button>
                </span>
                <span className="end">
                  <Amount value={p.amount} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <AddPutIn />
      </section>

      <section className="section" aria-labelledby="split-out">
        <div className="section-head">
          <h2 className="heading" id="split-out">
            Who gets what
          </h2>
        </div>
        <ul className="rows">
          {!short &&
            putIn.map((p) => (
              <li className="row" key={p.id}>
                <span className="name">
                  <span className="label">{p.who}</span>
                  <span className="note">Paid back</span>
                </span>
                <span className="end">
                  <Amount value={p.amount} />
                </span>
              </li>
            ))}
          {short && s.putIn > 0 && (
            <li className="row">
              <span className="name">
                <span className="label">Paid back</span>
                <span className="note">
                  Of the {money(s.putIn)} put in. The other {money(s.putIn - s.paidBack)} went on the shortfall.
                </span>
              </span>
              <span className="end">
                <Amount value={s.paidBack} />
              </span>
            </li>
          )}
          <li className="row">
            <span className="name">
              <span className="label">{s.ways === 1 ? 'One share' : `Each of ${people}`}</span>
              <span className="note">{short ? 'Nothing to share while the tour is short' : 'An even share of what the tour made'}</span>
            </span>
            <span className="end">
              <Amount value={s.each} />
            </span>
          </li>
          {s.left > 0 && (
            <li className="row">
              <span className="name">
                <span className="label">Left over</span>
                <span className="note">The odd {CURRENCIES[currency].name} an even split leaves</span>
              </span>
              <span className="end">
                <Amount value={s.left} />
              </span>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}

export function Budget({ view }: { view: View }) {
  const { tour, today } = useTour();
  const b = budget(tour);
  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <TourHeader tour={tour} />
      <Switch view={view} />
      {view === 'plan' ? <Plan b={b} tour={tour} /> : view === 'actuals' ? <Actuals b={b} tour={tour} today={today} /> : <Split b={b} tour={tour} />}
      {tour.demoToday ? (
        <p className="sample">Sample tour. Figures are invented, and today is set to {formatDay(tour.demoToday)} so it reads as mid-run.</p>
      ) : (
        SAMPLE_TOUR_IDS.includes(tour.id) && <p className="sample">Sample tour. Figures are invented.</p>
      )}
    </main>
  );
}
