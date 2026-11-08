// Quick PayPal sandbox check: auth, create a draft invoice, read it back, delete it.
// Usage: node scripts/sandbox-check.mjs   (reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from .env)
import fs from 'node:fs';

for (const line of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env');
  process.exit(1);
}
const BASE = 'https://api-m.sandbox.paypal.com';

const step = async (label, fn) => {
  try {
    const r = await fn();
    console.log(`OK   ${label}`);
    return r;
  } catch (e) {
    console.error(`FAIL ${label}\n     ${e.message}`);
    process.exit(1);
  }
};

const tokenRes = await step('OAuth token', async () => {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
  return j;
});
const call = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokenRes.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : {};
};

const hasInvoicing = /invoicing/.test(tokenRes.scope ?? '');
console.log(`     invoicing scope: ${hasInvoicing ? 'yes' : 'NOT FOUND - enable Invoicing for this app in the developer dashboard'}`);

const { invoice_number } = await step('Generate invoice number', () => call('POST', '/v2/invoicing/generate-next-invoice-number'));
const today = new Date().toISOString().slice(0, 10);
const inv = await step(`Create draft invoice ${invoice_number}`, () =>
  call('POST', '/v2/invoicing/invoices', {
    detail: { invoice_number, currency_code: 'USD', invoice_date: today, payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: today } },
    invoicer: { business_name: 'PayPilot sandbox check' },
    primary_recipients: [{ billing_info: { name: { given_name: 'Test' }, email_address: 'buyer@example.com' } }],
    items: [{ name: 'Sandbox check', quantity: '1', unit_amount: { currency_code: 'USD', value: '1.00' }, unit_of_measure: 'QUANTITY' }],
  }),
);
const invId = inv.id ?? String(inv.href ?? '').split('/').pop();
await step('Read it back', () => call('GET', `/v2/invoicing/invoices/${invId}`));
await step('Delete draft', () => call('DELETE', `/v2/invoicing/invoices/${invId}`));
console.log('\nPayPal sandbox invoicing works. Run `npm run dev` and open http://localhost:5173');
