import { config } from '../config.js';
import { addDays, daysBetween, isoDate, now } from '../clock.js';
import { store } from '../store.js';
import { clientLabel, isOpen, round2 } from './invoices.js';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface ClientStats {
  client: string;
  email: string;
  invoices: number;
  paidInvoices: number;
  avgDaysLate: number | null;
  onTimeRate: number | null;
  outstanding: number;
}

export function clientStats(): Record<string, ClientStats> {
  const out: Record<string, ClientStats> = {};
  for (const inv of store.data.invoices) {
    if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') continue;
    const key = inv.client.email.toLowerCase();
    const s = (out[key] ??= { client: clientLabel(inv), email: inv.client.email, invoices: 0, paidInvoices: 0, avgDaysLate: null, onTimeRate: null, outstanding: 0 });
    s.invoices += 1;
    if (isOpen(inv)) s.outstanding = round2(s.outstanding + inv.total - inv.amountPaid);
  }
  for (const s of Object.values(out)) {
    const paid = store.data.invoices.filter((i) => i.client.email.toLowerCase() === s.email.toLowerCase() && i.status === 'PAID' && i.paidAt);
    const late = paid.map((i) => daysBetween(i.dueDate, i.paidAt!));
    s.paidInvoices = paid.length;
    const a = avg(late);
    s.avgDaysLate = a === null ? null : Math.round(a * 10) / 10;
    s.onTimeRate = paid.length ? Math.round((late.filter((d) => d <= 0).length / paid.length) * 100) / 100 : null;
  }
  return out;
}

export function computeInsights() {
  const t = now();
  const currency = config.currency;
  const invs = store.data.invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT' && i.currency === currency);
  const open = invs.filter(isOpen);
  const paid = invs.filter((i) => i.status === 'PAID' && i.paidAt);
  const clients = clientStats();

  const outstanding = round2(open.reduce((s, i) => s + i.total - i.amountPaid, 0));
  const overdue = open.filter((i) => daysBetween(i.dueDate, t) > 0);
  const overdueAmount = round2(overdue.reduce((s, i) => s + i.total - i.amountPaid, 0));
  const daysToPay = paid.map((i) => daysBetween(i.issueDate, i.paidAt!));
  const late = paid.map((i) => daysBetween(i.dueDate, i.paidAt!));
  const globalLate = avg(late) ?? 0;
  const onTimeRate = paid.length ? late.filter((d) => d <= 0).length / paid.length : null;
  const since = addDays(t, -30);
  const collected30 = round2(
    store.data.payments.filter((p) => new Date(p.receivedAt) >= since && p.currency === currency).reduce((s, p) => s + p.amount, 0) +
      // sample history has no payment rows; count its paidAt
      invs.filter((i) => i.source === 'sample' && i.paidAt && new Date(i.paidAt) >= since).reduce((s, i) => s + i.total, 0),
  );

  // Forecast: expected pay date = due date + this client's typical lateness (or the global average).
  const weeks = [0, 1, 2, 3].map((w) => ({ label: w === 0 ? 'This week' : `Week ${w + 1}`, start: isoDate(addDays(t, w * 7)), expected: 0, atRisk: 0 }));
  const expectations = open.map((i) => {
    const c = clients[i.client.email.toLowerCase()];
    const lateDays = c?.avgDaysLate ?? globalLate;
    const expectedDate = addDays(new Date(`${i.dueDate}T00:00:00Z`), Math.max(0, Math.round(lateDays)));
    const overdueDays = daysBetween(i.dueDate, t);
    const confidence = overdueDays > 14 ? 0.5 : (c?.onTimeRate ?? onTimeRate ?? 0.7) >= 0.7 ? 0.9 : 0.7;
    const when = expectedDate < t ? t : expectedDate;
    return { inv: i, when, confidence, remaining: round2(i.total - i.amountPaid), lateDays };
  });
  for (const e of expectations) {
    const idx = Math.floor((e.when.getTime() - t.getTime()) / (7 * 86_400_000));
    if (idx >= 0 && idx < 4) {
      weeks[idx].expected = round2(weeks[idx].expected + e.remaining * e.confidence);
      weeks[idx].atRisk = round2(weeks[idx].atRisk + e.remaining * (1 - e.confidence));
    }
  }
  const expected30 = round2(weeks.reduce((s, w) => s + w.expected, 0));

  const risks = expectations
    .map((e) => {
      const overdueDays = daysBetween(e.inv.dueDate, t);
      const c = clients[e.inv.client.email.toLowerCase()];
      let reason = '';
      if (overdueDays > 0) reason = `${overdueDays} days overdue`;
      if (c?.avgDaysLate && c.avgDaysLate > 3) reason += `${reason ? '; ' : ''}usually pays ~${Math.round(c.avgDaysLate)} days late`;
      return reason ? { invoice: e.inv.number, client: clientLabel(e.inv), amount: e.remaining, reason, score: overdueDays + (c?.avgDaysLate ?? 0) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 5);

  return {
    asOf: isoDate(t),
    currency,
    outstanding,
    openCount: open.length,
    overdue: { count: overdue.length, amount: overdueAmount },
    collected30,
    avgDaysToPay: daysToPay.length ? Math.round(avg(daysToPay)! * 10) / 10 : null,
    onTimeRate: onTimeRate === null ? null : Math.round(onTimeRate * 100) / 100,
    expected30,
    forecast: weeks,
    risks,
    clients: Object.values(clients),
  };
}
