# Tourmo

A phone-first prototype for a self-managed band: plan a tour budget, then track
real money against it night by night. Built from the handoff doc "Tour budget
app — handoff for Claude Code".

It opens on the list of tours. Three samples are there to start with: the
handoff's **Spring run**, mid-tour with three of five shows settled, and two
finished tours before it, **Fall run** and **Summer weekender**. All figures
are invented. **Plan a new tour** sets one up in three steps.

## Run it

Needs Node 20 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` also runs the lookup server,
which fetches this week's gas prices, the year's lodging rates and real road
miles. Without it, or with no signal, the app still works: it uses the last
figures it was given and estimates drives from the map distance. To try it on a phone on the same Wi-Fi, run
`npm run dev:phone` and open the "Network" address it prints.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the calculation, parser and tour-setup tests (the handoff's worked example) |
| `npm run typecheck` | Type-checks the project |
| `npm run build` | Builds the static app into `dist/` |
| `npm run estimates` | Looks up this week's gas prices and this year's lodging rates, and saves them as the figures the app falls back on |
| `npm run lookups` | Runs the lookup server by itself on port 8787 (`npm run dev` already includes it) |

## Where things are

```
src/core/        Pure TypeScript. No React, no storage. Reusable in a native app.
  types.ts       The data model from the handoff
  payout.ts      Show payout for each offer type, and the plain-words reading
  parser.ts      Offer shorthand: "$1K + 70% < $2250" to an Offer
  calc.ts        Plan amounts, tracking ("Now") amounts, differences, one date
  rates.ts       Every rate of a tour: typed, worked out from the dates, or estimated by region
  route.ts       The drives of a tour: typed miles, or an estimate between two cities
  cities.ts      City lookup as you type
  tours.ts       A blank tour, the defaults applied when setup ends, past or upcoming
  seed.ts        The three sample tours
  calc.test.ts   Parse tests, payout tests and every expected result
  tours.test.ts  The sample tours, a new tour and where a tour sits against today
  route.test.ts  City lookup and drive estimates
  rates.test.ts  Regional gas and lodging estimates, van days, starting from the last tour
src/lookups.ts   Asks the lookup server for fresher figures and road miles, and keeps them
server/          The lookup server: sources.mjs (where figures come from),
                 lookups.mjs (what it answers and keeps), index.mjs (running it alone)
src/data/        cities.json: 19,623 US and Canadian places, built by scripts/build-cities.mjs
                 estimates.json: gas, lodging and van figures, refreshed by npm run estimates
src/CityField.tsx  The city field with suggestions, and the miles field beside it
src/store.tsx    Saves tours on the device (localStorage). No accounts, no sync
src/theme.css    Every colour, font and size. The style is not signed off yet
src/screens/     Tours, the new-tour steps, Budget (Plan and Actuals), Offers,
                 One date, Dates, Rates
```

## Screens

- **Tours**: every tour on the device, grouped as Setting up, On the road,
  Coming up and Past, each with its net. Tap one to open it.
- **Plan a new tour**: three steps. Name the tour (and its home city), add the
  dates, set the rates. The tour is saved from the first step, so setup can be
  left and continued from the Tours list. Finishing opens the budget.
- **Budget > Plan**: projected net at guaranteed minimums, every line with how
  it was worked out, "Add an expense". Tap Show guarantees to reach the offers.
- **Offer entry**: type the offer as the promoter sent it; the "Read as" panel
  shows the reading and lets you correct it. When part of the text was not
  understood (a date in front, two percentages, "225 tickets"), the panel says
  what was left out and asks you to check, instead of guessing silently.
- **Budget > Actuals**: where the tour is tracking, the Plan / Now / vs plan
  table, and the By date list.
- **One date**: enter box office, merch, lodging and fuel; the payout and
  commissions are worked out; the summary updates as you type. Every entry is
  saved as it is typed, so there is no Save button to forget.
- **Tours**, the new-tour steps, **Dates** and **Rates** were not in the
  mockups. They are plain versions in the same style so a tour can be set up
  end to end. Dates and Rates stay as tabs for changes after setup.

## Assumptions made

The handoff's open decisions, with the default taken for each:

- `<` in `$1K + 70% < $2250` means the percentage applies above 2,250.
- The percentage is taken of gross unless the offer says net.
- A split such as `70/30` gives the band's share first.
- A commission is rounded to the dollar on each show and then added up, so the
  By date differences always sum to the tour's difference.
- Commissions apply to show income only (changeable per commission in Rates).
- One device, no accounts. Tours are stored as a list.
- Cities are picked from a bundled list as you type, so it works with no
  signal. A city that is not in the list can still be typed; its drives then
  need the miles typed too, and the budget says how many drives are not counted.
- A drive between two picked cities is looked up as real road miles, with the
  time to allow, by the lookup server. Until the answer arrives, or with no
  server, it is estimated: the straight-line distance plus 15% for roads, to
  the nearest 5 miles, which lands within about 15% of the real drive between
  most cities. Typed miles always replace either. Looked-up drives are kept
  on the device, so they are still there with no signal.
- Driving times come from the routing service, which assumes modest speeds
  and no stops. They are shown as time to allow, not a forecast.
- No rate has to be typed. A rate left empty shows a grey figure and uses it:
  - **Van days**: worked out from the dates, first to last plus a day to
    return it. They follow the dates when those change.
  - **Gas price**: the EIA's weekly price for regular in the states the tour
    drives through. Each drive is priced at the dearer of its two ends (the
    states in between are not looked at), the drives are averaged by miles,
    and the result is rounded up to 5 cents.
  - **Lodging**: the federal (GSA) lodging rate for each city slept in, for
    that month, times the rooms (2 unless changed), rounded up to $5. Each
    night is planned for its own city, so a night in New York costs more than
    a night in Tulsa; the rates step shows the average. Cities without their
    own rate use the standard one. A lodging figure you type applies to every
    night instead.
  - **Van daily rate and mileage**: $215 a day and 15 mpg, from a published
    market guide (August 2026). No public source gives van rates by region,
    so these two do not vary by place.
  - **Merch**: left at $0 until a figure is set, so the plan does not count on it.
  Estimates lean high on purpose. Typing a figure replaces the estimate; 0 is
  a real figure (no van rental, say).
- When setup ends, the estimates in use are written into the tour and marked
  as estimates, so the plan does not move when the figures are refreshed
  later. Van days stay worked out from the dates.
- A new tour starts from your latest tour's commissions, van rate, mileage,
  merch (what the shows really sold) and lodging, where those were your own
  figures. Fuel is one tour-wide budget.
- The ledger look and the blue and orange pairing are kept.
- Platform: a web app, since the goal was a prototype on a local server. The
  core module has no framework dependency, so a native app could reuse it.

Four things were added that the handoff does not specify:

- `Tour.milesHome`: the leg home needs somewhere to live in the data.
- `Tour.demoToday`: pins "today" for the sample tour so it reads as mid-run.
  A real tour uses the device's date.
- `Tour.setup`: the setup step a new tour has reached. It is removed when
  setup is finished. The dates are entered before the rates, so finishing
  fills each date's plan from the rates: merch on every show, and lodging on
  every night away from the home city.
- **Safe to spend** on Actuals, from the earlier planning whiteboard: the
  tracking net divided by the days left (through the day the van goes back).
  It is one function, `safeToSpend` in `calc.ts`, and easy to redefine or remove.

## Not built yet

- Installing to the home screen and working with the server switched off
  (a service worker). Data is already stored on the device.
- Opening a tour by its own address. The Budget, Dates and Rates tabs show
  whichever tour was opened last from the Tours list.
- Changing a date during setup. It can be removed and added again, or edited
  under Dates once setup is finished.
- Several fuel fill-ups per date on screen (the data model holds a list; the
  screen has one field).
- A lookup server anywhere but this machine. It runs inside `npm run dev`;
  putting the app online would need it hosted, with keys of its own.
- Gas and lodging figures for Canada. Canadian cities are in the list and
  their drives are worked out, but they use the U.S. average gas price and
  the standard lodging rate.
- A food or per-diem line. The budget has none; the GSA publishes meal rates
  by city that could feed one.
- Towns of under 1,000 people in the city list.
- Export or sharing, and everything the handoff lists as out of scope.

## Data

City names and coordinates come from [GeoNames](https://www.geonames.org/),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The list
is every place of 1,000 people or more in the United States and Canada. To
rebuild it, follow the steps at the top of `scripts/build-cities.mjs`.

Gas prices come from the [U.S. Energy Information Administration](https://www.eia.gov/petroleum/gasdiesel/)
and lodging rates from the [U.S. General Services Administration](https://www.gsa.gov/travel/plan-book/per-diem-rates);
both are public domain. The lookup server and `npm run estimates` use their
public demo key, which allows a few calls an hour; the server asks at most
twice a day and keeps the answers in `server/.cache`. The top of
`server/sources.mjs` says how to use free keys of your own.

Road miles and driving times come from the public demo server of
[OSRM](https://project-osrm.org/), computed from
[OpenStreetMap](https://www.openstreetmap.org/copyright) data (ODbL). It is a
shared service with no guarantee, so the lookup server asks for each pair of
cities once, at most one a second, and keeps the answer. It is sent two map
points and nothing else: no tour names, dates or amounts. Van rental figures are from
[Bandago's rental cost guide](https://www.bandago.com/guides/15-passenger-van-rental-cost/)
and are edited by hand in `src/data/estimates.json`.
