import { addDays, daysBetween, now, nowIso } from '../clock.js';
import { gateway } from '../paypal/index.js';
import { store } from '../store.js';
import type { Invoice, Tone } from '../types.js';
import { draftReminder } from '../agent/writer.js';
import { clientLabel, isOpen } from './invoices.js';

export function autoTone(inv: Invoice): Tone {
  const overdue = daysBetween(inv.dueDate, now());
  if (overdue <= 0) return 'friendly';
  if (inv.followup.remindersSent === 0) return 'friendly';
  if (inv.followup.remindersSent + 1 >= inv.followup.maxReminders) return 'final';
  return 'firm';
}

export async function sendReminder(inv: Invoice, opts: { tone?: Tone; customNote?: string; auto: boolean; actor: 'agent' | 'user' }) {
  if (!isOpen(inv)) throw new Error(`Invoice ${inv.number} is ${inv.status}; reminders only go to open invoices.`);
  const daysOverdue = Math.max(0, daysBetween(inv.dueDate, now()));
  const tone = opts.tone ?? autoTone(inv);
  const draft = await draftReminder(inv, tone, daysOverdue, opts.customNote);
  await gateway.remind(inv.paypalId, draft.subject, draft.note);

  const f = inv.followup;
  f.remindersSent += 1;
  f.lastReminderAt = nowIso();
  if (f.enabled) f.nextReminderAt = addDays(now(), f.cadenceDays).toISOString();
  inv.reminders.push({ at: nowIso(), tone, subject: draft.subject, note: draft.note, auto: opts.auto, writtenBy: draft.writtenBy });
  store.log(
    'reminder_sent',
    `${opts.auto ? 'Auto-sent' : 'Sent'} ${tone} reminder #${f.remindersSent} for ${inv.number} to ${clientLabel(inv)}${daysOverdue ? ` (${daysOverdue}d overdue)` : ''}`,
    { invoiceId: inv.id, actor: opts.auto ? 'agent' : opts.actor, at: nowIso() },
  );
  return { tone, ...draft, daysOverdue };
}

let running = false;
/** Runs on an interval: sends at most one due reminder per invoice per tick. */
export async function followupTick() {
  if (running) return;
  running = true;
  try {
    const t = now();
    for (const inv of store.data.invoices) {
      if (inv.source === 'sample' || !isOpen(inv)) continue;
      const f = inv.followup;
      if (!f.enabled || !f.nextReminderAt) continue;
      if (f.remindersSent >= f.maxReminders) {
        f.enabled = false;
        f.nextReminderAt = undefined;
        store.log('followup', `Follow-up sequence for ${inv.number} finished after ${f.remindersSent} reminders, still unpaid - suggest a phone call`, {
          invoiceId: inv.id,
          actor: 'agent',
          at: nowIso(),
        });
        continue;
      }
      if (new Date(f.nextReminderAt) > t) continue;
      try {
        await sendReminder(inv, { auto: true, actor: 'agent' });
      } catch (err) {
        store.log('error', `Auto-reminder for ${inv.number} failed: ${(err as Error).message}`, { invoiceId: inv.id, at: nowIso() });
        f.nextReminderAt = addDays(t, 1).toISOString();
      }
    }
    store.save();
  } finally {
    running = false;
  }
}
