import { config, llmLive } from '../config.js';
import type { Invoice, Tone } from '../types.js';
import { clientLabel, fmt } from '../services/invoices.js';
import { chat } from './llm.js';

export interface DraftedReminder {
  subject: string;
  note: string;
  writtenBy: 'ai' | 'template';
}

/** The AI writes each reminder for the specific client, amount and lateness; tone escalates. */
export async function draftReminder(inv: Invoice, tone: Tone, daysOverdue: number, customNote?: string): Promise<DraftedReminder> {
  const due = fmt(inv.total - inv.amountPaid, inv.currency);
  if (llmLive) {
    try {
      const msg = await chat(
        [
          {
            role: 'system',
            content:
              'You write short payment reminder emails for a small business. Be human, specific and polite; never threaten. ' +
              'friendly = light nudge; firm = clear, asks for a payment date; final = last reminder before the matter is escalated to a call. ' +
              'Max 90 words in the note. No placeholders, no sign-off name (PayPal adds the business name). ' +
              'Return JSON: {"subject": string, "note": string}.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              business: config.businessName,
              client: clientLabel(inv),
              contactName: inv.client.name,
              invoice: inv.number,
              amountDue: due,
              dueDate: inv.dueDate,
              daysOverdue,
              remindersAlreadySent: inv.followup.remindersSent,
              tone,
              work: inv.items.map((i) => i.name).join(', '),
              extraInstruction: customNote || undefined,
            }),
          },
        ],
        { json: true, maxTokens: 1500 },
      );
      const parsed = JSON.parse(msg.content ?? '{}');
      if (parsed.subject && parsed.note) return { subject: String(parsed.subject), note: String(parsed.note), writtenBy: 'ai' };
    } catch (err) {
      console.error('[writer] falling back to template:', (err as Error).message);
    }
  }
  return template(inv, tone, daysOverdue, due, customNote);
}

function template(inv: Invoice, tone: Tone, daysOverdue: number, due: string, customNote?: string): DraftedReminder {
  const name = inv.client.name.split(' ')[0];
  const when = daysOverdue > 0 ? `was due on ${inv.dueDate} (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago)` : `is due on ${inv.dueDate}`;
  const notes: Record<Tone, DraftedReminder> = {
    friendly: {
      subject: `Friendly reminder: invoice ${inv.number}`,
      note: `Hi ${name}, a quick reminder that invoice ${inv.number} for ${due} ${when}. You can pay securely through the PayPal link in this email. Thank you!`,
      writtenBy: 'template',
    },
    firm: {
      subject: `Payment overdue: invoice ${inv.number}`,
      note: `Hi ${name}, invoice ${inv.number} for ${due} ${when} and is still open. Could you arrange payment via the PayPal link, or let us know the date we can expect it?`,
      writtenBy: 'template',
    },
    final: {
      subject: `Final reminder: invoice ${inv.number}`,
      note: `Hi ${name}, this is our final reminder for invoice ${inv.number} (${due}), which ${when}. Please settle it via PayPal this week; otherwise we will reach out by phone to resolve it.`,
      writtenBy: 'template',
    },
  };
  const r = notes[tone];
  return customNote ? { ...r, note: `${r.note} ${customNote}` } : r;
}
