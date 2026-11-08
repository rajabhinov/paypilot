import { config } from '../config.js';
import { addDays, isoDate } from '../clock.js';
import { PayPalError, type CreateInvoiceInput, type PayPalGateway, type RemoteInvoice } from './gateway.js';
import type { InvoiceStatus } from '../types.js';

/**
 * PayPal REST client for the Invoicing v2 API.
 * Docs: https://developer.paypal.com/docs/api/invoicing/v2/
 */
const BASE = config.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status}). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? safeJson(text) : {};
  if (!res.ok) {
    const details = Array.isArray(json?.details)
      ? json.details.map((d: any) => `${d.issue ?? ''}${d.field ? ` (${d.field})` : ''}: ${d.description ?? ''}`).join('; ')
      : '';
    throw new PayPalError(
      `PayPal ${method} ${path} failed (${res.status}): ${json?.message ?? json?.name ?? text}${details ? ` - ${details}` : ''}`,
      res.status,
      json?.debug_id,
    );
  }
  return json as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const money = (v: unknown) => Number((v as { value?: string } | undefined)?.value ?? 0);

function mapStatus(s: string): InvoiceStatus {
  switch (s) {
    case 'PAID':
    case 'MARKED_AS_PAID':
      return 'PAID';
    case 'PARTIALLY_PAID':
    case 'MARKED_AS_PARTIALLY_PAID':
      return 'PARTIALLY_PAID';
    case 'CANCELLED':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return s === 'CANCELLED' ? 'CANCELLED' : 'PAID';
    case 'DRAFT':
      return 'DRAFT';
    default:
      return 'SENT'; // SENT, SCHEDULED, PAYMENT_PENDING, UNPAID
  }
}

export const livePayPal: PayPalGateway = {
  mode: config.paypal.env,

  async createInvoice(input: CreateInvoiceInput) {
    const { invoice_number } = await call<{ invoice_number: string }>('POST', '/v2/invoicing/generate-next-invoice-number');
    const today = new Date();
    const [given, ...rest] = input.client.name.trim().split(/\s+/);
    const payload = {
      detail: {
        invoice_number,
        currency_code: input.currency,
        note: input.note?.slice(0, 4000),
        invoice_date: isoDate(today),
        payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: isoDate(addDays(today, input.dueInDays)) },
      },
      invoicer: { business_name: input.businessName.slice(0, 300) },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: given || input.client.name, surname: rest.join(' ') || undefined },
            email_address: input.client.email,
            business_name: input.client.company || undefined,
          },
        },
      ],
      items: input.items.map((i) => ({
        name: i.name.slice(0, 200),
        quantity: String(i.quantity),
        unit_amount: { currency_code: input.currency, value: i.unitAmount.toFixed(2) },
        unit_of_measure: 'QUANTITY',
      })),
    };
    const created = await call<any>('POST', '/v2/invoicing/invoices', payload);
    const paypalId: string = created?.id ?? String(created?.href ?? '').split('/').pop();
    if (!paypalId) throw new PayPalError('PayPal did not return an invoice id');
    return { paypalId, number: created?.detail?.invoice_number ?? invoice_number };
  },

  async sendInvoice(paypalId) {
    const res = await call<any>('POST', `/v2/invoicing/invoices/${paypalId}/send`, {
      send_to_invoicer: true,
      send_to_recipient: true,
    });
    let payUrl: string | undefined = res?.href;
    if (!payUrl) {
      const inv = await call<any>('GET', `/v2/invoicing/invoices/${paypalId}`);
      payUrl = inv?.detail?.metadata?.recipient_view_url;
    }
    return { payUrl };
  },

  async remind(paypalId, subject, note) {
    await call('POST', `/v2/invoicing/invoices/${paypalId}/remind`, {
      subject: subject.slice(0, 200),
      note: note.slice(0, 4000),
      send_to_invoicer: false,
      send_to_recipient: true,
    });
  },

  async cancel(paypalId, note) {
    const inv = await call<any>('GET', `/v2/invoicing/invoices/${paypalId}`);
    if (inv?.status === 'DRAFT') {
      await call('DELETE', `/v2/invoicing/invoices/${paypalId}`);
      return;
    }
    await call('POST', `/v2/invoicing/invoices/${paypalId}/cancel`, {
      subject: 'Invoice cancelled',
      note: note.slice(0, 4000),
      send_to_invoicer: false,
      send_to_recipient: true,
    });
  },

  async getInvoice(paypalId): Promise<RemoteInvoice> {
    const inv = await call<any>('GET', `/v2/invoicing/invoices/${paypalId}`);
    const txs: any[] = inv?.payments?.transactions ?? [];
    return {
      status: mapStatus(inv?.status),
      total: money(inv?.amount),
      amountPaid: money(inv?.payments?.paid_amount),
      payUrl: inv?.detail?.metadata?.recipient_view_url,
      transactions: txs.map((t, idx) => ({
        id: t.payment_id ?? t.transaction_id ?? `${paypalId}-${idx}`,
        amount: money(t.amount),
        currency: t.amount?.currency_code ?? inv?.detail?.currency_code,
        method: t.method ?? 'PAYPAL',
        date: t.payment_date,
      })),
    };
  },

  async verifyWebhook(headers, event) {
    if (!config.paypal.webhookId) return false;
    const h = (k: string) => {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    };
    const res = await call<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    });
    return res.verification_status === 'SUCCESS';
  },
};
