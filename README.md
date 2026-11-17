# Tourmo

A phone-first prototype for a self-managed band: plan a tour budget, then track
real money against it night by night.

It opens on the list of tours. Three samples are there to start with:
**Spring run**, mid-tour with three of five shows settled, and two finished
tours before it, **Fall run** and **Summer weekender**. All figures are
invented. **Plan a new tour** sets one up in three steps.

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

## Put it on a phone

`npm run build` writes a static site into `dist/`. Put that folder on any
static host and open it on the phone. After one visit with a signal it opens
with none, and the browser's "Add to Home Screen" installs it with its own
icon. A new build reaches a phone the next time the app is opened after being
fully closed. `npm run preview` serves `dist/` on this machine to try it.

The hosted app has no lookup server (see "Not built yet"), so it plans with
the figures saved in the build, straight-line drive estimates and whatever
you type.

Tours are kept in the browser on one device. **Backup** on the Tours screen
saves all of them to a file and loads a file back; that is how to keep a
copy, move to a new phone or hand a tour to a bandmate.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the calculation, parser and tour-setup tests, with Spring run as the worked example |
| `npm run typecheck` | Type-checks the project |
| `npm run build` | Builds the static app into `dist/`, with the service worker that keeps it on the device |
| `npm run preview` | Serves `dist/` on port 4173 |
| `node scripts/build-icons.mjs` | Redraws the app icon in `public/` |
| `npm run estimates` | Looks up this week's gas prices and this year's lodging rates, and saves them as the figures the app falls back on |
| `npm run lookups` | Runs the lookup server by itself on port 8787 (`npm run dev` already includes it) |

## Where things are

```
src/core/        Pure TypeScript. No React, no storage. Reusable in a native app.
  types.ts       The data model: a tour, its dates, offers and lines
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
offline/         sw.js: the service worker that keeps the built app on the device.
                 plugin.mjs: writes it into the build with the list of files to keep
public/          The web manifest and the icons, copied into the build as they are
server/          The lookup server: sources.mjs (where figures come from),
                 lookups.mjs (what it answers and keeps), index.mjs (running it alone)
src/data/        cities.json: 19,623 US and Canadian places, built by scripts/build-cities.mjs
                 estimates.json: gas, lodging and van figures, refreshed by npm run estimates
src/CityField.tsx  The city field with suggestions, and the miles field beside it
src/store.tsx    Saves tours on the device (localStorage). No accounts, no sync
src/theme.css    Every colour, font and size. The style is not signed off yet
src/screens/     Tours, the new-tour steps, Budget (Plan, Actuals and Split),
                 Offers, One date, Dates, Rates
```

## Screens

- **Tours**: every tour on the device, grouped as Setting up, On the road,
  Coming up and Past, each with its net. Tap one to open it. **Backup** saves
  every tour to a file and loads one back.
- **Plan a new tour**: three steps. Name the tour (and its home city), add the
  dates, set the rates. The tour is saved from the first step, so setup can be
  left and continued from the Tours list. Finishing opens the budget.
- **Budget > Plan**: projected net at guaranteed minimums, every line with how
  it was worked out, "Add other income" (tour support from a label, say) and
  "Add an expense" (a hired player's fee, insurance). Tap Show guarantees to
  reach the offers.
- **Offer entry**: type the offer as the promoter sent it; the "Read as" panel
  shows the reading and lets you correct it. When part of the text was not
  understood (a date in front, two percentages, "225 tickets"), the panel says
  what was left out and asks you to check, instead of guessing silently.
- **Budget > Actuals**: where the tour is tracking, the Plan / Now / vs plan
  table, and the By date list.
- **Budget > Split**: what there is to share out on the figures so far, an
  even share for each person, and the money a member or a label put in, which
  is paid back first.
- **One date**: enter box office, merch, lodging, fuel and food; the payout,
  commissions and merch costs are worked out; the summary updates as you type. Every entry is
  saved as it is typed, so there is no Save button to forget.
- **Dates** and **Rates**: the tabs for changes after setup. Dates adds,
  edits and removes a date, and editing one has a tick for a night with no
  room to pay for. Rates holds every figure the plan is worked out from.

## Rules it follows

Where a deal or a figure can be read more than one way, this is the reading
the app takes:

- `<` in `$1K + 70% < $2250` means the percentage applies above 2,250.
- The percentage is taken of gross unless the offer says net.
- A split such as `70/30` gives the band's share first.
- A commission is rounded to the dollar on each show and then added up, so the
  By date differences always sum to the tour's difference.
- Commissions apply to show income only (changeable per commission in Rates).
- One device, no accounts. Tours are stored as a list. A backup file is the
  only copy anywhere else.
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
    that month, times the rooms (one for every two people unless changed),
    rounded up to $5. Each
    night is planned for its own city, so a night in New York costs more than
    a night in Tulsa; the rates step shows the average. Cities without their
    own rate use the standard one. A lodging figure you type applies to every
    night instead.
  - **Van daily rate and mileage**: $215 a day and 15 mpg, from a published
    market guide (August 2026). No public source gives van rates by region,
    so these two do not vary by place.
  - **Merch**: left at $0 until a figure is set, so the plan does not count on it.
  - **People**: 4 on the road until a number is set. Everyone who travels
    counts, hired players and crew too.
  - **Food**: $20 a person a day, from the first date to the last. It is
    bought day by day against that one figure, as fuel is.
  - **Merch costs**: 40% of sales, for the goods and card fees. A venue's cut
    is yours to add to the share.
  Estimates lean high on purpose. Typing a figure replaces the estimate; 0 is
  a real figure. Choosing "Our own" for the van sets its daily rate to 0.
- When setup ends, the estimates in use are written into the tour and marked
  as estimates, so the plan does not move when the figures are refreshed
  later. Van days stay worked out from the dates.
- A new tour starts from your latest tour's headcount, commissions, van rate,
  mileage, per diem, merch (what the shows really sold), merch costs and
  lodging, where those were your own figures. Fuel is one tour-wide budget,
  and so is food.
- A tour set up before food and merch costs were planned keeps the plan it
  had: both are set to 0 on it, and Rates can clear either to take the
  estimate. The samples do the same, so their figures stay as the tests
  expect.
- Money put in to be paid back is not income and not a cost. It was spent on
  things the budget already counts, so it is paid back beside the split, not
  out of it. If the tour loses money, the loss comes out of what was put in.
- The split is even, in whole dollars, between everyone on the road unless a
  number is set. A hired player's fee is a tour-wide expense, and they are
  left out of the number sharing.
- **Safe to spend** on Actuals is the tracking net divided by the days left,
  through the day the van goes back. It is one function, `safeToSpend` in
  `calc.ts`, and easy to redefine or remove.
- The look is a plain ledger. Blue marks a figure ahead of plan and orange
  one behind.
- Platform: a web app, so it runs on any phone with nothing to install. The
  core module has no framework dependency, so a native app could reuse it.

Parts of the data model worth knowing:

- `Tour.people`, `Tour.perDiem`, `Tour.foodFinal` and `TourDate.food`: the
  headcount and the food line.
- `Tour.merchCostRate`: the share of merch sales planned as its cost.
- `Tour.putIn` and `Tour.splitBetween`: money to pay back, and how many share
  the net.
- `Tour.drives`: the miles each drive is planned at, kept once setup ends.
- `Tour.milesHome`: the miles of the leg home from the last date.
- `Tour.demoToday`: pins "today" for the sample tour so it reads as mid-run.
  A real tour uses the device's date.
- `Tour.setup`: the setup step a new tour has reached. It is removed when
  setup is finished. The dates are entered before the rates, so finishing
  fills each date's plan from the rates: merch on every show, and lodging on
  every night away from the home city.

## Not built yet

- A hosted copy. The build is ready for any static host; none is set up.
- Other currencies, kilometres and litres, for touring outside the United
  States. Every figure is in dollars, miles and gallons.
- What is agreed on settlement night beyond the payout: a deposit already
  paid and who holds it, a venue's merch cut for that night, tax withheld.
  These can be typed as expenses on the date.
- Named members, uneven shares and who paid for what. The split is even and
  by headcount.
- Opening a tour by its own address. The Budget, Dates and Rates tabs show
  whichever tour was opened last from the Tours list.
- Changing a date during setup. It can be removed and added again, or edited
  under Dates once setup is finished.
- Several fuel fill-ups per date on screen (the data model holds a list; the
  screen has one field).
- A lookup server anywhere but this machine. It runs inside `npm run dev`
  and `npm run preview`; a hosted app would need it hosted too, with keys of
  its own.
- Gas and lodging figures for Canada. Canadian cities are in the list and
  their drives are worked out, but they use the U.S. average gas price and
  the standard lodging rate.
- Towns of under 1,000 people in the city list.
- Sharing a tour live between devices. A backup file is the way to pass one
  on.

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
