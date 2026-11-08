import { nowIso } from '../clock.js';
import { gateway } from '../paypal/index.js';
import { store } from '../store.js';
import type { Invoice, Reconciliation } from '../types.js';
import { clientLabel, fmt, isOpen, round2 } from './invoices.js';

/**
 * Pull the invoice's true state from PayPal and reconcile any new payments.
 * Webhooks only *trigger* this; we never trust a webhook body for amounts.
 */
export async function syncInvoice(inv: Invoice, source: 'webhook' | 'poll' | 'manual' | 'simulated') {
  if (inv.source === 'sample' || !inv.paypalId) return;
  const remote = await gateway.getInvoice(inv.paypalId);
  if (remote.payUrl && !inv.payUrl) inv.payUrl = remote.payUrl;

  for (const tx of remote.transactions) {
    if (store.data.payments.some((p) => p.paypalTransactionId === tx.id)) continue;
    const paidSoFar = round2(inv.amountPaid + tx.amount);
    let reconciliation: Reconciliation =
      Math.abs(paidSoFar - inv.total) < 0.01 ? 'MATCHED' : paidSoFar < inv.total ? 'PARTIAL' : 'OVERPAID';
    let note: string | undefined;
    if (tx.currency && tx.currency !== inv.currency) {
      reconciliation = 'UNMATCHED';
      note = `Currency mismatch: received ${tx.currency}, invoiced ${inv.currency}`;
    }
    inv.amountPaid = paidSoFar;
    store.data.payments.unshift({
      id: store.nextId('pay'),
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      paypalTransactionId: tx.id,
      amount: tx.amount,
      currency: tx.currency || inv.currency,
      method: tx.method,
      receivedAt: nowIso(),
      reconciliation,
      note,
    });
    store.log('payment_received', `Payment of ${fmt(tx.amount, tx.currency || inv.currency)} received from ${clientLabel(inv)} for ${inv.number} (${tx.method}, txn ${tx.id})`, {
      invoiceId: inv.id,
      actor: 'paypal',
      at: nowIso(),
    });
    const outcome =
      reconciliation === 'MATCHED'
        ? `matched in full to ${inv.number}`
        : reconciliation === 'PARTIAL'
          ? `partial - ${fmt(round2(inv.total - paidSoFar), inv.currency)} still due on ${inv.number}`
          : reconciliation === 'OVERPAID'
            ? `overpaid by ${fmt(round2(paidSoFar - inv.total), inv.currency)} on ${inv.number} - needs review`
            : `needs review: ${note}`;
    store.log('reconciled', `Reconciled txn ${tx.id}: ${outcome} (via ${source})`, { invoiceId: inv.id, actor: 'agent', at: nowIso() });
  }

  if (remote.status !== inv.status) {
    const prev = inv.status;
    inv.status = remote.status;
    if (inv.status === 'PAID') {
      inv.paidAt = nowIso();
      if (inv.followup.enabled) {
        inv.followup.enabled = false;
        inv.followup.nextReminderAt = undefined;
        store.log('followup', `Stopped follow-ups for ${inv.number} - paid in full`, { invoiceId: inv.id, actor: 'agent', at: nowIso() });
      }
    }
    if (inv.status === 'CANCELLED') {
      inv.followup.enabled = false;
      inv.followup.nextReminderAt = undefined;
    }
    if (prev !== 'DRAFT' || inv.status !== 'SENT') {
      store.log('system', `${inv.number} status ${prev} -> ${inv.status}`, { invoiceId: inv.id, actor: 'paypal', at: nowIso() });
    }
  }
  store.save();
}

let polling = false;
/** Fallback for when webhooks can't reach a local machine: poll open invoices. */
export async function pollOpenInvoices() {
  if (polling || gateway.mode === 'mock') return;
  polling = true;
  try {
    for (const inv of store.data.invoices.filter((i) => isOpen(i) && i.source === 'paypal')) {
      try {
        await syncInvoice(inv, 'poll');
      } catch (err) {
        console.error(`[poll] ${inv.number}:`, (err as Error).message);
      }
    }
  } finally {
    polling = false;
  }
}
