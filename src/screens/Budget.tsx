import { useState } from 'react';
import {
  budget,
  cityName,
  dateAgainstPlan,
  dateStatus,
  expenseDiff,
  formatDay,
  formatMoney,
  formatNumber,
  formatRange,
  lineDiff,
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
  STATUS_LABEL,
  type Budget as BudgetData,
  type BudgetLine,
  type Money,
  type Tour,
  type TourDate,
} from '../core';
import { Amount, Back, DiffText, MoneyField, TextField } from '../components';
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
            {route} {'·'} {formatNumber(routeMiles(tour))} mi
          </p>
        </>
      ) : (
        <p className="note">No dates yet. Add them under Dates.</p>
      )}
    </header>
  );
}

function Switch({ view }: { view: 'plan' | 'actuals' }) {
  return (
    <nav className="switch" aria-label="Budget view">
      <a href={href('/budget/plan')} aria-current={view === 'plan' ? 'page' : undefined}>
        Plan
      </a>
      <a href={href('/budget/actuals')} aria-current={view === 'actuals' ? 'page' : undefined}>
        Actuals
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

function AddExpense() {
  const { update } = useTour();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<Money | undefined>();

  if (!open) {
    return (
      <button className="btn quiet" type="button" onClick={() => setOpen(true)}>
        Add an expense
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
          t.lines.push({ id: newId('line'), label: label.trim(), direction: 'out', plan: amount ?? 0 });
        });
        close();
      }}
    >
      <TextField label="What is it for?" value={label} onChange={setLabel} />
      <MoneyField label="Planned amount" value={amount} onChange={setAmount} note="A tour-wide cost, such as insurance or a trailer." />
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

function Plan({ b }: { b: BudgetData }) {
  const net = b.plan.net;
  return (
    <>
      <div className="headline">
        <p className="label">Projected net at guaranteed minimums</p>
        <p className="figure">{formatMoney(net)}</p>
        <p className={`verdict ${net >= 0 ? 'good' : 'bad'}`}>{net >= 0 ? 'In the black' : `Short by ${formatMoney(-net)}`}</p>
        <p className="sub pair">
          <span>
            In <Amount value={b.plan.revenue} />
          </span>
          <span>
            Out <Amount value={b.plan.expenses} />
          </span>
        </p>
      </div>

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
        <AddExpense />
      </section>
    </>
  );
}

// ---------- Actuals ----------

function LedgerRow({ line }: { line: BudgetLine }) {
  const to = line.kind === 'extra' ? lineLink(line) : line.kind === 'vehicle' || line.kind === 'fuel' ? '/rates' : undefined;
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
        <DiffText diff={lineDiff(line)} className="vs" />
      </td>
    </tr>
  );
}

function DateRow({ tour, date, today }: { tour: Tour; date: TourDate; today: string }) {
  const status = dateStatus(date, today);
  const result = dateAgainstPlan(tour, date);
  const paid = showActual(date);
  let figures: string;
  if (date.kind !== 'show') figures = date.kind === 'off' ? 'Off day' : 'Travel day';
  else if (result.hasActuals) {
    const parts = [paid !== undefined ? `Show ${formatMoney(paid)}` : `Guarantee ${formatMoney(showPlan(date))}`];
    if (date.merch.actual !== undefined) parts.push(`Merch ${formatMoney(date.merch.actual)}`);
    figures = parts.join(' · ');
  } else figures = date.offer ? `Guarantee ${formatMoney(showPlan(date))}` : 'No offer yet';
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
          {result.hasActuals && <DiffText diff={netDiff(0, result.vsPlan)} className="note" />}
        </span>
      </a>
    </li>
  );
}

function Actuals({ b, tour, today }: { b: BudgetData; tour: Tour; today: string }) {
  const diff = netDiff(b.plan.net, b.now.net);
  const safe = safeToSpend(tour, today);
  const unpaid = tour.dates.filter(settledWithoutPayout).length;
  return (
    <>
      <div className="headline">
        <p className="label">Now tracking to</p>
        <p className="figure">{formatMoney(b.now.net)}</p>
        <p className={`verdict ${diff.tone === 'flat' ? '' : diff.tone}`}>{diff.tone === 'flat' ? 'On plan' : `${diff.text} of plan`}</p>
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
          b.now.net <= 0 && <p className="sub">Nothing spare to spend: the tour is tracking {formatMoney(-b.now.net)} short.</p>
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
              <DiffText diff={revenueDiff(b.plan.revenue, b.now.revenue)} className="vs" />
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
              <DiffText diff={expenseDiff(b.plan.expenses, b.now.expenses)} className="vs" />
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

export function Budget({ view }: { view: 'plan' | 'actuals' }) {
  const { tour, today } = useTour();
  const b = budget(tour);
  return (
    <main className="screen">
      <Back to="/tours">Tours</Back>
      <TourHeader tour={tour} />
      <Switch view={view} />
      {view === 'plan' ? <Plan b={b} /> : <Actuals b={b} tour={tour} today={today} />}
      {tour.demoToday ? (
        <p className="sample">Sample tour. Figures are invented, and today is set to {formatDay(tour.demoToday)} so it reads as mid-run.</p>
      ) : (
        SAMPLE_TOUR_IDS.includes(tour.id) && <p className="sample">Sample tour. Figures are invented.</p>
      )}
    </main>
  );
}
