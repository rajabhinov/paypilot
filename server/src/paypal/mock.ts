import type { CreateInvoiceInput, PayPalGateway, RemoteInvoice } from './gateway.js';

/**
 * Offline stand-in for PayPal so the app runs with no credentials.
 * Behaves like the Invoicing API's state machine; payments are triggered from the UI.
 */
interface MockInvoice extends RemoteInvoice {
  number: string;
  currency: string;
}

const invoices = new Map<string, MockInvoice>();
let counter = 1000;

export const mockPayPal: PayPalGateway & {
  simulatePayment(paypalId: string, amount?: number): void;
  restore(paypalId: string, number: string, total: number, currency: string, status: RemoteInvoice['status']): void;
} = {
  mode: 'mock',

  async createInvoice(input: CreateInvoiceInput) {
    counter += 1;
    const paypalId = `MOCK-INV-${counter}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const total = input.items.reduce((s, i) => s + i.quantity * i.unitAmount, 0);
    const number = `INQ-${new Date().getFullYear()}-${counter}`;
    invoices.set(paypalId, { number, currency: input.currency, status: 'DRAFT', total, amountPaid: 0, transactions: [] });
    return { paypalId, number };
  },

  async sendInvoice(paypalId) {
    const inv = must(paypalId);
    inv.status = 'SENT';
    return { payUrl: undefined };
  },

  async remind(paypalId) {
    const inv = must(paypalId);
    if (inv.status !== 'SENT' && inv.status !== 'PARTIALLY_PAID') throw new Error(`Cannot remind an invoice in status ${inv.status}`);
  },

  async cancel(paypalId) {
    must(paypalId).status = 'CANCELLED';
  },

  async getInvoice(paypalId) {
    const inv = must(paypalId);
    return { ...inv, transactions: [...inv.transactions] };
  },

  async verifyWebhook() {
    return true;
  },

  simulatePayment(paypalId, amount) {
    const inv = must(paypalId);
    const remaining = inv.total - inv.amountPaid;
    const amt = Math.min(amount ?? remaining, remaining);
    if (amt <= 0) return;
    inv.amountPaid += amt;
    inv.transactions.push({
      id: `MOCKTX-${Date.now().toString(36).toUpperCase()}`,
      amount: amt,
      currency: inv.currency,
      method: 'PAYPAL',
    });
    inv.status = inv.amountPaid + 0.005 >= inv.total ? 'PAID' : 'PARTIALLY_PAID';
  },

  /** Rebuild simulator state from the data file after a restart. */
  restore(paypalId, number, total, currency, status) {
    if (!invoices.has(paypalId)) invoices.set(paypalId, { number, total, currency, status, amountPaid: 0, transactions: [] });
  },
};

function must(id: string) {
  const inv = invoices.get(id);
  if (!inv) throw new Error(`Invoice ${id} not found in simulator`);
  return inv;
}
