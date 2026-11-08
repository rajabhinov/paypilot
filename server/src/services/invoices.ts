import { config } from '../config.js';
import { addDays, daysBetween, isoDate, now, nowIso } from '../clock.js';
import { gateway } from '../paypal/index.js';
import { store } from '../store.js';
import type { Client, Invoice, LineItem } from '../types.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmt = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CreateArgs {
  client: Client;
  items: LineItem[];
  currency?: string;
  dueInDays?: number;
  note?: string;
  send?: boolean;
  followup?: { enabled?: boolean; cadenceDays?: number; maxReminders?: number };
  createdBy: Invoice['createdBy'];
}

export async function createInvoice(args: CreateArgs): Promise<Invoice> {
  if (!EMAIL_RE.test(args.client.email)) throw new Error('A valid client email is required to send a PayPal invoice.');
  const items = args.items
    .map((i) => ({ name: String(i.name || 'Services').trim(), quantity: Number(i.quantity) || 1, unitAmount: round2(Number(i.unitAmount)) }))
    .filter((i) => i.unitAmount > 0);
  if (!items.length) throw new Error('The invoice needs at least one line item with an amount above zero.');
  const currency = (args.currency || config.currency).toUpperCase();
  const dueInDays = Math.max(0, Math.min(120, Math.round(args.dueInDays ?? 15)));
  const total = round2(items.reduce((s, i) => s + i.quantity * i.unitAmount, 0));

  const remote = await gateway.createInvoice({
    client: args.client,
    items,
    currency,
    note: args.note,
    dueInDays,
    businessName: config.businessName,
  });

  const today = now();
  const inv: Invoice = {
    id: store.nextId('inv'),
    paypalId: remote.paypalId,
    number: remote.number,
    source: gateway.mode === 'mock' ? 'mock' : 'paypal',
    client: args.client,
    items,
    currency,
    total,
    note: args.note,
    issueDate: isoDate(today),
    dueDate: isoDate(addDays(today, dueInDays)),
    status: 'DRAFT',
    amountPaid: 0,
    followup: {
      enabled: args.followup?.enabled ?? true,
      cadenceDays: clamp(args.followup?.cadenceDays ?? 3, 1, 30),
      maxReminders: clamp(args.followup?.maxReminders ?? 3, 1, 10),
      remindersSent: 0,
    },
    reminders: [],
    createdAt: nowIso(),
    createdBy: args.createdBy,
  };
  store.data.invoices.unshift(inv);
  store.log('invoice_created', `Created invoice ${inv.number} for ${clientLabel(inv)} - ${fmt(total, currency)}, due ${inv.dueDate}`, {
    invoiceId: inv.id,
    actor: args.createdBy === 'agent' ? 'agent' : 'user',
    at: nowIso(),
  });

  if (args.send ?? true) await sendInvoice(inv, args.createdBy === 'agent' ? 'agent' : 'user');
  return inv;
}

export async function sendInvoice(inv: Invoice, actor: 'agent' | 'user' = 'user') {
  if (inv.status !== 'DRAFT') throw new Error(`Invoice ${inv.number} is already ${inv.status}.`);
  const { payUrl } = await gateway.sendInvoice(inv.paypalId);
  inv.status = 'SENT';
  inv.payUrl = payUrl;
  if (inv.followup.enabled) inv.followup.nextReminderAt = `${inv.dueDate}T00:00:00.000Z`;
  store.log('invoice_sent', `Sent ${inv.number} to ${inv.client.email} via PayPal`, { invoiceId: inv.id, actor, at: nowIso() });
  store.save();
}

export async function cancelInvoice(inv: Invoice, reason: string, actor: 'agent' | 'user' = 'user') {
  if (inv.status === 'PAID' || inv.status === 'CANCELLED') throw new Error(`Invoice ${inv.number} is ${inv.status} and can't be cancelled.`);
  await gateway.cancel(inv.paypalId, reason || 'This invoice has been cancelled.');
  inv.status = 'CANCELLED';
  inv.followup.enabled = false;
  inv.followup.nextReminderAt = undefined;
  store.log('invoice_cancelled', `Cancelled ${inv.number}${reason ? ` (${reason})` : ''}`, { invoiceId: inv.id, actor, at: nowIso() });
}

export function setFollowup(inv: Invoice, opts: { enabled: boolean; cadenceDays?: number; maxReminders?: number }) {
  const f = inv.followup;
  f.enabled = opts.enabled;
  if (opts.cadenceDays) f.cadenceDays = clamp(opts.cadenceDays, 1, 30);
  if (opts.maxReminders) f.maxReminders = clamp(opts.maxReminders, 1, 10);
  if (f.enabled && !f.nextReminderAt && (inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID')) {
    const due = new Date(`${inv.dueDate}T00:00:00.000Z`);
    f.nextReminderAt = (due > now() ? due : now()).toISOString();
  }
  if (!f.enabled) f.nextReminderAt = undefined;
  store.save();
}

/** Find an invoice by number, id or client name/company/email. Prefers open invoices, newest first. */
export function findInvoice(ref: string): Invoice | undefined {
  const q = ref.trim().toLowerCase();
  if (!q) return undefined;
  const all = store.data.invoices;
  const exact = all.find((i) => i.number.toLowerCase() === q || i.id === ref || i.paypalId === ref);
  if (exact) return exact;
  const matches = all.filter(
    (i) =>
      i.number.toLowerCase().endsWith(q) ||
      i.client.name.toLowerCase().includes(q) ||
      (i.client.company ?? '').toLowerCase().includes(q) ||
      i.client.email.toLowerCase().includes(q),
  );
  const open = matches.filter((i) => i.status === 'SENT' || i.status === 'PARTIALLY_PAID');
  return open[0] ?? matches.find((i) => i.status === 'DRAFT') ?? matches[0];
}

export const clientLabel = (i: Invoice) => i.client.company || i.client.name;
export const isOpen = (i: Invoice) => i.status === 'SENT' || i.status === 'PARTIALLY_PAID';

export function brief(i: Invoice) {
  const daysOverdue = isOpen(i) ? Math.max(0, daysBetween(i.dueDate, now())) : 0;
  return {
    number: i.number,
    client: clientLabel(i),
    email: i.client.email,
    total: i.total,
    currency: i.currency,
    status: i.status,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    daysOverdue,
    amountPaid: i.amountPaid,
    payUrl: i.payUrl,
    followup: i.followup.enabled
      ? `on - ${i.followup.remindersSent}/${i.followup.maxReminders} reminders sent, every ${i.followup.cadenceDays}d`
      : 'off',
    sample: i.source === 'sample' || undefined,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
}
