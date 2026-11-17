// ISO date helpers. Dates are plain "YYYY-MM-DD" strings handled in UTC so a
// phone's time zone never shifts a show to the wrong day.

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toUTC = (iso: string) => new Date(iso + 'T00:00:00Z');

export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b. Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

/** "Thu Mar 4" */
export function formatDay(iso: string): string {
  const d = toUTC(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Mar 4 – 8, 2027" or "Mar 30 – Apr 2, 2027" */
export function formatRange(startIso: string, endIso: string): string {
  const a = toUTC(startIso);
  const b = toUTC(endIso);
  const year = b.getUTCFullYear();
  const start = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  if (startIso === endIso) return `${start}, ${year}`;
  const end = a.getUTCMonth() === b.getUTCMonth() ? String(b.getUTCDate()) : `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
  return `${start} – ${end}, ${year}`;
}

/** "2026-08" to "Aug 2026". */
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** Today on this device, as an ISO date. */
export function localToday(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Whether two typed cities are the same place, ignoring case and spacing. */
export const sameCity = (a: string, b: string) => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** "Dallas, TX" to "Dallas" */
export function cityName(city: string): string {
  return city.split(',')[0].trim();
}
