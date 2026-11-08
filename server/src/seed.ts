import { config } from './config.js';
import { addDays, isoDate, now } from './clock.js';
import { store } from './store.js';
import type { Invoice } from './types.js';

/**
 * Seeds ~90 days of PAID sample history so insights (payment behaviour, forecast) have data.
 * Sample records are clearly flagged, never sent to PayPal, and never reminded.
 * Every open invoice in the demo is created live.
 */
const clients = [
  { name: 'Priya Raman', email: 'accounts@acmeretail.example.com', company: 'Acme Retail', late: [0, -1, 1] },
  { name: 'Daniel Ortiz', email: 'ap@northwind.example.com', company: 'Northwind Traders', late: [11, 14, 12] },
  { name: 'Mei Lin', email: 'finance@bluepeak.example.com', company: 'Bluepeak Studios', late: [2, 6] },
  { name: 'Arjun Mehta', email: 'billing@saffronfoods.example.com', company: 'Saffron Foods', late: [0, 0] },
];
const work = ['Monthly retainer', 'Website maintenance', 'Cloud hosting & support', 'Mobile app sprint', 'SEO campaign'];

export function seedIfEmpty() {
  if (!config.seedSampleHistory || store.data.invoices.length) return;
  const t = now();
  let n = 1;
  for (const c of clients) {
    c.late.forEach((lateDays, k) => {
      const issued = addDays(t, -95 + k * 30 + n * 2);
      const due = addDays(issued, 15);
      const paidAt = addDays(due, lateDays);
      const amount = [1800, 2400, 3200, 950, 4100][(n + k) % 5];
      const inv: Invoice = {
        id: store.nextId('inv'),
        paypalId: '',
        number: `SAMPLE-${String(n).padStart(3, '0')}`,
        source: 'sample',
        client: { name: c.name, email: c.email, company: c.company },
        items: [{ name: work[(n + k) % work.length], quantity: 1, unitAmount: amount }],
        currency: config.currency,
        total: amount,
        issueDate: isoDate(issued),
        dueDate: isoDate(due),
        status: 'PAID',
        amountPaid: amount,
        paidAt: paidAt.toISOString(),
        followup: { enabled: false, cadenceDays: 3, maxReminders: 3, remindersSent: 0 },
        reminders: [],
        createdAt: issued.toISOString(),
        createdBy: 'seed',
      };
      store.data.invoices.push(inv);
      n += 1;
    });
  }
  store.data.invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  store.log('system', `Loaded ${n - 1} paid sample invoices as payment history (marked SAMPLE, never sent)`, { at: t.toISOString() });
}
