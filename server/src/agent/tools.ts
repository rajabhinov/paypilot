import { config } from '../config.js';
import { daysBetween, now } from '../clock.js';
import { store } from '../store.js';
import type { Tone } from '../types.js';
import type { ToolDef } from './llm.js';
import { brief, cancelInvoice, clientLabel, createInvoice, findInvoice, fmt, isOpen, sendInvoice, setFollowup } from '../services/invoices.js';
import { sendReminder } from '../services/followups.js';
import { clientStats, computeInsights } from '../services/insights.js';
import { syncInvoice } from '../services/reconcile.js';

export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

const ref = { type: 'string', description: 'Invoice number (e.g. INQ-2026-1001) or client name/company' };

const baseToolDefs: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description:
        'Create a PayPal invoice and (by default) send it to the client with a PayPal payment link. Enables automatic follow-up reminders by default.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Contact person name, or company name if no person given' },
          client_email: { type: 'string', description: 'Billing email. Required by PayPal. Never invent one.' },
          client_company: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unit_amount: { type: 'number', description: 'Price per unit as a plain number, e.g. 4000' },
              },
              required: ['description', 'unit_amount'],
            },
          },
          currency: { type: 'string', description: `ISO currency code. Default ${config.currency}.` },
          due_in_days: { type: 'number', description: 'Payment term in days, e.g. 15 for "net 15". Default 15.' },
          note: { type: 'string', description: 'Optional note to the client shown on the invoice' },
          send: { type: 'boolean', description: 'Send immediately (default true). false = save as draft.' },
          auto_followup: { type: 'boolean', description: 'Automatically chase if unpaid (default true)' },
          followup_cadence_days: { type: 'number', description: 'Days between reminders once due (default 3)' },
          max_reminders: { type: 'number', description: 'Maximum automatic reminders (default 3)' },
        },
        required: ['client_name', 'client_email', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: 'List invoices, optionally filtered by status and client.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'overdue', 'paid', 'draft', 'cancelled', 'all'] },
          client: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice',
      description: 'Get full details, payment state and reminder history of one invoice. Refreshes from PayPal.',
      parameters: { type: 'object', properties: { invoice: ref }, required: ['invoice'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_invoice',
      description: 'Send a draft invoice to the client via PayPal.',
      parameters: { type: 'object', properties: { invoice: ref }, required: ['invoice'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reminder',
      description: 'Send a payment reminder for an open invoice now through PayPal. The note is written by AI for the client and situation.',
      parameters: {
        type: 'object',
        properties: {
          invoice: ref,
          tone: { type: 'string', enum: ['friendly', 'firm', 'final'], description: 'Omit to pick automatically from how overdue it is' },
          extra_instruction: { type: 'string', description: 'Anything specific to mention' },
        },
        required: ['invoice'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_followup',
      description: 'Turn automatic follow-up reminders on/off for an invoice, or change cadence and maximum.',
      parameters: {
        type: 'object',
        properties: { invoice: ref, enabled: { type: 'boolean' }, cadence_days: { type: 'number' }, max_reminders: { type: 'number' } },
        required: ['invoice', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_invoice',
      description: 'Cancel an unpaid invoice in PayPal. Only when the user explicitly asks.',
      parameters: { type: 'object', properties: { invoice: ref, reason: { type: 'string' } }, required: ['invoice'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cash_insights',
      description:
        'Receivables snapshot: outstanding, overdue, collected last 30 days, average days to pay, 4-week cash-in forecast, at-risk invoices, and each client\'s payment behaviour.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/**
 * Some models (e.g. gpt-oss on Groq) send `null` for optional fields, and Groq rejects any call that
 * doesn't match the schema. Let every optional property be null; the agent drops nulls before running.
 */
function allowNullOptionals(schema: any): any {
  if (!schema || schema.type !== 'object' || !schema.properties) return schema;
  const required = new Set<string>(schema.required ?? []);
  const properties: Record<string, any> = {};
  for (const [key, prop] of Object.entries<any>(schema.properties)) {
    let p = prop.type === 'object' ? allowNullOptionals(prop) : prop.type === 'array' && prop.items ? { ...prop, items: allowNullOptionals(prop.items) } : prop;
    if (!required.has(key) && typeof p.type === 'string') {
      p = { ...p, type: [p.type, 'null'] };
      if (p.enum) p.enum = [...p.enum, null];
    }
    properties[key] = p;
  }
  return { ...schema, properties };
}

export const toolDefs: ToolDef[] = baseToolDefs.map((t) => ({ ...t, function: { ...t.function, parameters: allowNullOptionals(t.function.parameters) } }));

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (v == null || v === '' ? undefined : Number(String(v).replace(/[^\d.]/g, '')) || undefined);

export async function runTool(name: string, args: Record<string, any>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'create_invoice': {
        const items = (Array.isArray(args.items) ? args.items : []).map((i: any) => ({
          name: str(i.description || i.name || 'Services'),
          quantity: num(i.quantity) ?? 1,
          unitAmount: num(i.unit_amount ?? i.amount ?? i.price) ?? 0,
        }));
        const inv = await createInvoice({
          client: { name: str(args.client_name), email: str(args.client_email).trim(), company: str(args.client_company) || undefined },
          items,
          currency: str(args.currency) || undefined,
          dueInDays: num(args.due_in_days),
          note: str(args.note) || undefined,
          send: args.send !== false,
          followup: { enabled: args.auto_followup !== false, cadenceDays: num(args.followup_cadence_days), maxReminders: num(args.max_reminders) },
          createdBy: 'agent',
        });
        const history = clientStats()[inv.client.email.toLowerCase()];
        const behaviour =
          history && history.paidInvoices > 0
            ? `${clientLabel(inv)} has paid ${history.paidInvoices} past invoice(s), on average ${history.avgDaysLate! > 0 ? `${history.avgDaysLate} days late` : 'on time'}.`
            : 'No payment history for this client yet.';
        return {
          ok: true,
          summary: `${inv.status === 'SENT' ? 'Sent' : 'Drafted'} ${inv.number} - ${fmt(inv.total, inv.currency)} to ${clientLabel(inv)}, due ${inv.dueDate}`,
          data: { invoice: brief(inv), clientHistory: behaviour },
        };
      }
      case 'list_invoices': {
        const status = str(args.status) || 'open';
        const t = now();
        let list = store.data.invoices;
        if (status === 'open') list = list.filter(isOpen);
        if (status === 'overdue') list = list.filter((i) => isOpen(i) && daysBetween(i.dueDate, t) > 0);
        if (status === 'paid') list = list.filter((i) => i.status === 'PAID');
        if (status === 'draft') list = list.filter((i) => i.status === 'DRAFT');
        if (status === 'cancelled') list = list.filter((i) => i.status === 'CANCELLED');
        const c = str(args.client).toLowerCase();
        if (c) list = list.filter((i) => `${i.client.name} ${i.client.company ?? ''} ${i.client.email}`.toLowerCase().includes(c));
        return { ok: true, summary: `Found ${list.length} ${status} invoice(s)`, data: list.slice(0, 25).map(brief) };
      }
      case 'get_invoice': {
        const inv = must(args.invoice);
        if (inv.source !== 'sample') await syncInvoice(inv, 'manual');
        return {
          ok: true,
          summary: `${inv.number}: ${inv.status}`,
          data: {
            ...brief(inv),
            items: inv.items,
            reminders: inv.reminders,
            payments: store.data.payments.filter((p) => p.invoiceId === inv.id),
          },
        };
      }
      case 'send_invoice': {
        const inv = must(args.invoice);
        await sendInvoice(inv, 'agent');
        return { ok: true, summary: `Sent ${inv.number} to ${inv.client.email}`, data: brief(inv) };
      }
      case 'send_reminder': {
        const inv = must(args.invoice);
        if (inv.source === 'sample') throw new Error(`${inv.number} is sample history and is already paid.`);
        const r = await sendReminder(inv, { tone: (str(args.tone) || undefined) as Tone | undefined, customNote: str(args.extra_instruction) || undefined, auto: false, actor: 'agent' });
        return { ok: true, summary: `Sent ${r.tone} reminder for ${inv.number}`, data: { invoice: brief(inv), subject: r.subject, note: r.note } };
      }
      case 'set_followup': {
        const inv = must(args.invoice);
        setFollowup(inv, { enabled: args.enabled !== false, cadenceDays: num(args.cadence_days), maxReminders: num(args.max_reminders) });
        return { ok: true, summary: `Follow-ups for ${inv.number}: ${brief(inv).followup}`, data: brief(inv) };
      }
      case 'cancel_invoice': {
        const inv = must(args.invoice);
        await cancelInvoice(inv, str(args.reason), 'agent');
        return { ok: true, summary: `Cancelled ${inv.number}`, data: brief(inv) };
      }
      case 'cash_insights': {
        const i = computeInsights();
        return {
          ok: true,
          summary: `Outstanding ${fmt(i.outstanding, i.currency)}, overdue ${fmt(i.overdue.amount, i.currency)}, expected next 30d ${fmt(i.expected30, i.currency)}`,
          data: i,
        };
      }
      default:
        return { ok: false, summary: `Unknown tool ${name}`, error: `Unknown tool ${name}` };
    }
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, summary: message, error: message };
  }
}

function must(r: unknown) {
  const inv = findInvoice(str(r));
  if (!inv) throw new Error(`No invoice matches "${str(r)}".`);
  return inv;
}
