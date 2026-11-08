import { config } from '../config.js';
import { nowIso } from '../clock.js';
import type { AgentAction, ChatMessage } from '../types.js';
import { fmt } from '../services/invoices.js';
import { runTool, type ToolResult } from './tools.js';

/**
 * Rule-based fallback used when no LLM key is configured, so the app always runs.
 * It covers the core demo commands; the real agent (agent.ts) handles free-form language.
 */
type Reply = Omit<ChatMessage, 'mode'>;

const CUR: Record<string, string> = { '$': 'USD', usd: 'USD', '₹': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR', '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP' };

export async function runOffline(text: string): Promise<Reply> {
  const t = text.trim();
  const lower = t.toLowerCase();
  const actions: AgentAction[] = [];
  const act = async (tool: string, args: Record<string, unknown>) => {
    const r = await runTool(tool, args);
    actions.push({ tool, args, ok: r.ok, summary: r.summary });
    return r;
  };
  const done = (content: string): Reply => ({ role: 'assistant', content, at: nowIso(), actions });

  // Reminders
  if (/\b(remind(er)?|chase|nudge|follow up with|follow-up with)\b/.test(lower) && !/\b(bill|invoice|charge)\b.*\d/.test(lower)) {
    const target = refFrom(t);
    if (!target) return done('Which invoice or client should I remind? e.g. "remind Northwind" or "remind INQ-2026-1001".');
    const tone = /\bfinal\b/.test(lower) ? 'final' : /\bfirm\b/.test(lower) ? 'firm' : /\bfriendly|gentle\b/.test(lower) ? 'friendly' : undefined;
    const r = await act('send_reminder', { invoice: target, tone });
    if (!r.ok) return done(r.error!);
    const d = r.data as { subject: string; note: string };
    return done(`${r.summary}.\n\nSubject: ${d.subject}\n${d.note}`);
  }

  // Cancel
  if (/\bcancel\b/.test(lower)) {
    const target = refFrom(t);
    if (!target) return done('Which invoice should I cancel?');
    const r = await act('cancel_invoice', { invoice: target });
    return done(r.ok ? `${r.summary}. Follow-ups stopped.` : r.error!);
  }

  // Create
  if (/\b(bill|invoice|charge)\b/.test(lower) && /\d/.test(lower)) {
    const parsed = parseCreate(t);
    if (!parsed.amount) return done('How much should the invoice be for?');
    if (!parsed.email) return done(`What's the billing email for ${parsed.client || 'the client'}? PayPal needs it to deliver the invoice.`);
    const r = await act('create_invoice', {
      client_name: parsed.client || parsed.email.split('@')[0],
      client_company: parsed.client || undefined,
      client_email: parsed.email,
      items: [{ description: parsed.description || 'Professional services', quantity: 1, unit_amount: parsed.amount }],
      currency: parsed.currency,
      due_in_days: parsed.dueDays,
      send: !/\bdraft\b/.test(lower),
      auto_followup: !/\b(no|don't|dont) (follow|chase|remind)/.test(lower),
    });
    if (!r.ok) return done(r.error!);
    const d = r.data as { invoice: { payUrl?: string; followup: string }; clientHistory: string };
    return done(`${r.summary}. ${d.clientHistory} Automatic follow-ups: ${d.invoice.followup}.`);
  }

  // Insights / forecast
  if (/\b(cash|forecast|insight|summary|how much|owed|receivable|collect)/.test(lower)) {
    const r = await act('cash_insights', {});
    return done(describeInsights(r));
  }

  // Lists
  if (/\b(overdue|late|unpaid|outstanding|open|paid|draft|list|show)\b/.test(lower)) {
    const status = /overdue|late/.test(lower) ? 'overdue' : /\bpaid\b/.test(lower) && !/unpaid/.test(lower) ? 'paid' : /draft/.test(lower) ? 'draft' : 'open';
    const r = await act('list_invoices', { status });
    const list = r.data as { number: string; client: string; total: number; currency: string; daysOverdue: number; dueDate: string }[];
    if (!list.length) return done(`No ${status} invoices right now.`);
    return done(
      `${list.length} ${status} invoice(s):\n` +
        list
          .slice(0, 8)
          .map((i) => `- ${i.number} - ${i.client} - ${fmt(i.total, i.currency)} - ${i.daysOverdue ? `${i.daysOverdue}d overdue` : `due ${i.dueDate}`}`)
          .join('\n'),
    );
  }

  return done(
    'I run in offline mode right now (no AI key set), so I understand a few commands:\n' +
      '- "Bill Acme Retail $4,000 for October retainer, net 15, accounts@acme.example.com"\n' +
      '- "What\'s overdue?"\n- "Forecast my cash"\n- "Send a firm reminder to Northwind"\n' +
      'Add LLM_API_KEY to .env for the full AI agent.',
  );
}

function describeInsights(r: ToolResult) {
  const i = r.data as any;
  const c = i.currency;
  const lines = [
    `Outstanding: ${fmt(i.outstanding, c)} across ${i.openCount} open invoice(s); overdue ${fmt(i.overdue.amount, c)} (${i.overdue.count}).`,
    `Collected last 30 days: ${fmt(i.collected30, c)}. Average days to pay: ${i.avgDaysToPay ?? 'n/a'}.`,
    `Expected next 4 weeks: ${fmt(i.expected30, c)}.`,
  ];
  if (i.risks.length) lines.push(`At risk: ${i.risks.map((x: any) => `${x.invoice} (${x.client}, ${x.reason})`).join('; ')}.`);
  return lines.join('\n');
}

function refFrom(t: string) {
  const num = t.match(/\b([A-Z]{2,}-\d{4}-\d+|SAMPLE-\d+)\b/i);
  if (num) return num[1];
  const m = t.match(/\b(?:to|for|remind|chase|nudge|cancel)\s+(?:invoice\s+)?([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)/);
  return m?.[1];
}

export function parseCreate(t: string) {
  const email = t.match(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/i)?.[0];
  const noEmail = email ? t.replace(email, ' ') : t;
  const amt = noEmail.match(/(\$|₹|€|£|rs\.?|inr|usd|eur|gbp)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|lakh|lakhs|l)?\b\s*(usd|inr|eur|gbp)?/i);
  let amount: number | undefined;
  let currency: string | undefined;
  if (amt) {
    amount = Number(amt[2].replace(/,/g, ''));
    const mult = (amt[3] || '').toLowerCase();
    if (mult === 'k') amount *= 1000;
    if (mult.startsWith('l')) amount *= 100000;
    const sym = (amt[1] || amt[4] || '').toLowerCase();
    currency = CUR[sym];
  }
  const client = noEmail.match(/\b(?:bill|invoice|charge)\s+(.+?)\s+(?:for\s+)?(?:\$|₹|€|£|rs\.?|inr|usd|eur|gbp)?\s?\d/i)?.[1]?.replace(/\bfor\b$/i, '').trim();
  const description = noEmail.match(/\bfor\s+([^,.;]+?)(?=,|\.|;|\s+net\b|\s+due\b|\s+and\b|$)/i)?.[1]?.trim();
  const net = noEmail.match(/\bnet\s?(\d{1,3})\b/i) ?? noEmail.match(/\bdue in\s+(\d{1,3})\s+days?\b/i);
  return {
    email,
    amount,
    currency: currency ?? config.currency,
    client,
    description: description && !/^\$?\d/.test(description) ? description.replace(/^the\s+/i, '').replace(/^./, (c) => c.toUpperCase()) : undefined,
    dueDays: net ? Number(net[1]) : 15,
  };
}
