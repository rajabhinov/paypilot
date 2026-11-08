import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, llmLive } from './config.js';
import { advanceDays, now, nowIso, resetClock } from './clock.js';
import { store } from './store.js';
import { seedIfEmpty } from './seed.js';
import { gateway, mockPayPal } from './paypal/index.js';
import { runAgent } from './agent/agent.js';
import { cancelInvoice, findInvoice, sendInvoice, setFollowup } from './services/invoices.js';
import { followupTick, sendReminder } from './services/followups.js';
import { pollOpenInvoices, syncInvoice } from './services/reconcile.js';
import { computeInsights } from './services/insights.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

function byId(req: Request) {
  const inv = store.data.invoices.find((i) => i.id === req.params.id) ?? findInvoice(String(req.params.id));
  if (!inv) throw Object.assign(new Error('Invoice not found'), { status: 404 });
  return inv;
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/state', (_req, res) => {
  res.json({
    status: {
      paypal: gateway.mode,
      ai: llmLive ? { mode: 'llm', model: config.llm.model } : { mode: 'offline' },
      business: config.businessName,
      currency: config.currency,
      webhookVerification: Boolean(config.paypal.webhookId),
    },
    clock: { now: nowIso(), offsetDays: Math.round((store.data.clockOffsetMs || 0) / 86_400_000) },
    invoices: store.data.invoices,
    payments: store.data.payments.slice(0, 100),
    activity: store.data.activity.slice(0, 80),
    conversation: store.data.conversation.slice(-40),
    insights: computeInsights(),
  });
});

app.post(
  '/api/agent',
  wrap(async (req, res) => {
    const message = String(req.body?.message ?? '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });
    res.json(await runAgent(message.slice(0, 2000)));
  }),
);

app.post('/api/agent/reset', (_req, res) => {
  store.data.conversation = [];
  store.save();
  res.json({ ok: true });
});

app.post('/api/invoices/:id/send', wrap(async (req, res) => {
  const inv = byId(req);
  await sendInvoice(inv, 'user');
  res.json(inv);
}));

app.post('/api/invoices/:id/remind', wrap(async (req, res) => {
  const inv = byId(req);
  res.json(await sendReminder(inv, { tone: req.body?.tone, auto: false, actor: 'user' }));
}));

app.post('/api/invoices/:id/followup', wrap(async (req, res) => {
  const inv = byId(req);
  setFollowup(inv, { enabled: Boolean(req.body?.enabled), cadenceDays: req.body?.cadenceDays, maxReminders: req.body?.maxReminders });
  res.json(inv);
}));

app.post('/api/invoices/:id/cancel', wrap(async (req, res) => {
  const inv = byId(req);
  await cancelInvoice(inv, String(req.body?.reason ?? ''), 'user');
  res.json(inv);
}));

app.post('/api/invoices/:id/sync', wrap(async (req, res) => {
  const inv = byId(req);
  await syncInvoice(inv, 'manual');
  res.json(inv);
}));

/** Simulator only: stands in for the client paying, then reconciles like a webhook would. */
app.post('/api/invoices/:id/simulate-payment', wrap(async (req, res) => {
  if (gateway.mode !== 'mock') return res.status(400).json({ error: 'Pay the invoice from the PayPal sandbox payer link instead.' });
  const inv = byId(req);
  const amount = req.body?.amount ? Number(req.body.amount) : undefined;
  mockPayPal.simulatePayment(inv.paypalId, amount);
  store.log('webhook', `Simulated INVOICING.INVOICE.${amount ? 'PARTIALLY_PAID' : 'PAID'} event for ${inv.number}`, { invoiceId: inv.id, actor: 'paypal', at: nowIso() });
  await syncInvoice(inv, 'simulated');
  res.json(inv);
}));

/** PayPal webhook. The event only triggers a re-fetch; amounts always come from PayPal's API. */
app.post('/api/paypal/webhook', wrap(async (req, res) => {
  const event = req.body ?? {};
  if (config.paypal.webhookId) {
    const ok = await gateway.verifyWebhook(req.headers, event).catch(() => false);
    if (!ok) return res.status(400).json({ error: 'signature verification failed' });
  }
  res.status(200).json({ received: true });

  const type: string = event.event_type ?? 'unknown';
  const paypalId: string | undefined = event.resource?.id ?? event.resource?.invoice?.id;
  const inv = paypalId ? store.data.invoices.find((i) => i.paypalId === paypalId) : undefined;
  store.log('webhook', `PayPal webhook ${type}${inv ? ` for ${inv.number}` : ''}${config.paypal.webhookId ? ' (signature verified)' : ''}`, {
    invoiceId: inv?.id,
    actor: 'paypal',
    at: nowIso(),
  });
  if (inv && type.startsWith('INVOICING.')) await syncInvoice(inv, 'webhook').catch((e) => console.error('[webhook]', e));
}));

app.post('/api/clock/advance', wrap(async (req, res) => {
  const days = Math.max(1, Math.min(60, Number(req.body?.days) || 1));
  advanceDays(days);
  store.log('system', `Demo clock moved forward ${days} day${days === 1 ? '' : 's'} to ${now().toISOString().slice(0, 10)}`, { at: nowIso() });
  await followupTick();
  res.json({ now: nowIso() });
}));

app.post('/api/clock/reset', (_req, res) => {
  resetClock();
  res.json({ now: nowIso() });
});

app.post('/api/demo/reset', (_req, res) => {
  store.reset();
  seedIfEmpty();
  res.json({ ok: true });
});

// Serve the built web app in production.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api]', err.message);
  res.status(err.status ?? 500).json({ error: err.message });
});

// Boot
seedIfEmpty();
if (gateway.mode === 'mock') {
  for (const i of store.data.invoices) if (i.source === 'mock') mockPayPal.restore(i.paypalId, i.number, i.total, i.currency, i.status);
}
setInterval(() => void followupTick(), config.schedulerIntervalMs);
setInterval(() => void pollOpenInvoices(), config.pollIntervalMs);

app.listen(config.port, () => {
  console.log(`PayPilot API on http://localhost:${config.port}`);
  console.log(`  PayPal: ${gateway.mode === 'mock' ? 'offline simulator (set PAYPAL_CLIENT_ID/SECRET for sandbox)' : `${gateway.mode} API`}`);
  console.log(`  AI:     ${llmLive ? `${config.llm.model} via ${config.llm.baseUrl}` : 'offline parser (set LLM_API_KEY for the AI agent)'}`);
});
