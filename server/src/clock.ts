import { store } from './store.js';

/**
 * Demo clock. PayPilot's scheduler, insights and activity feed read time from here,
 * so a demo can "fast-forward" days to show the agent chasing an unpaid invoice.
 * Dates sent to PayPal always use real time.
 */
const DAY = 86_400_000;

export const now = () => new Date(Date.now() + (store.data.clockOffsetMs || 0));
export const nowIso = () => now().toISOString();
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Whole days from a to b (b - a), comparing calendar dates in UTC. */
export function daysBetween(a: string | Date, b: string | Date) {
  const da = new Date(typeof a === 'string' ? a.slice(0, 10) : isoDate(a));
  const db = new Date(typeof b === 'string' ? b.slice(0, 10) : isoDate(b));
  return Math.round((db.getTime() - da.getTime()) / DAY);
}

export function advanceDays(days: number) {
  store.data.clockOffsetMs = (store.data.clockOffsetMs || 0) + days * DAY;
  store.save();
}

export function resetClock() {
  store.data.clockOffsetMs = 0;
  store.save();
}
