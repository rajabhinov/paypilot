import { useEffect } from 'react';
import { api, money, shortDate } from '../api';
import type { Invoice } from '../types';
import { statusOf } from './InvoiceGrid';

export function InvoiceDrawer({
  inv,
  mode,
  now,
  onClose,
  run,
}: {
  inv: Invoice;
  mode: string;
  now: string;
  onClose: () => void;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = statusOf(inv, now);
  const open = inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID';
  const live = inv.source !== 'sample';

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`Invoice ${inv.number}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="mono muted small">{inv.number}</div>
            <h2>{inv.client.company || inv.client.name}</h2>
            <div className="muted small">{inv.client.email}</div>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-amount">
          <span className="mono big">{money(inv.total, inv.currency)}</span>
          <span className={`status ${s.tone}`}>{s.label}</span>
        </div>
        <dl className="facts">
          <dt>Issued</dt>
          <dd>{shortDate(inv.issueDate)}</dd>
          <dt>Due</dt>
          <dd>{shortDate(inv.dueDate)}</dd>
          <dt>Paid</dt>
          <dd>{money(inv.amountPaid, inv.currency)}</dd>
          <dt>Source</dt>
          <dd>{inv.source === 'paypal' ? 'PayPal sandbox' : inv.source === 'mock' ? 'PayPal simulator' : 'Sample history'}</dd>
          {inv.paypalId && (
            <>
              <dt>PayPal ID</dt>
              <dd className="mono small">{inv.paypalId}</dd>
            </>
          )}
        </dl>

        <h3>Items</h3>
        <ul className="items">
          {inv.items.map((it, k) => (
            <li key={k}>
              <span>
                {it.name}
                {it.quantity !== 1 && ` × ${it.quantity}`}
              </span>
              <span className="mono">{money(it.quantity * it.unitAmount, inv.currency)}</span>
            </li>
          ))}
        </ul>

        {live && (
          <>
            <h3>
              Follow-up{' '}
              <label className="switch">
                <input
                  type="checkbox"
                  checked={inv.followup.enabled}
                  disabled={!open}
                  onChange={(e) => run(() => api.followup(inv.id, e.target.checked))}
                />
                <span>{inv.followup.enabled ? `every ${inv.followup.cadenceDays}d, max ${inv.followup.maxReminders}` : 'off'}</span>
              </label>
            </h3>
            {inv.reminders.length === 0 ? (
              <p className="muted small">
                {inv.followup.enabled && inv.followup.nextReminderAt
                  ? `First reminder goes out ${shortDate(inv.followup.nextReminderAt)} if unpaid.`
                  : 'No reminders sent.'}
              </p>
            ) : (
              <ol className="reminders">
                {inv.reminders.map((r, k) => (
                  <li key={k}>
                    <div className="small">
                      <strong>{r.subject}</strong>
                      <span className="muted">
                        {' '}
                        · {shortDate(r.at)} · {r.tone} · {r.auto ? 'auto' : 'manual'} · {r.writtenBy === 'ai' ? 'written by AI' : 'template'}
                      </span>
                    </div>
                    <p>{r.note}</p>
                  </li>
                ))}
              </ol>
            )}
            <div className="drawer-actions">
              {inv.status === 'DRAFT' && (
                <button className="primary" onClick={() => run(() => api.send(inv.id), 'Sent')}>
                  Send via PayPal
                </button>
              )}
              {open && <button onClick={() => run(() => api.remind(inv.id), 'Reminder sent')}>Remind now</button>}
              {open && mode === 'mock' && (
                <>
                  <button className="primary" onClick={() => run(() => api.simulatePay(inv.id), 'Payment simulated')}>
                    Client pays in full
                  </button>
                  <button onClick={() => run(() => api.simulatePay(inv.id, Math.round((inv.total - inv.amountPaid) / 2)), 'Partial payment simulated')}>
                    Client pays half
                  </button>
                </>
              )}
              {open && mode !== 'mock' && inv.payUrl && (
                <a className="btn primary" href={inv.payUrl} target="_blank" rel="noreferrer">
                  Open PayPal pay link
                </a>
              )}
              {(open || inv.status === 'DRAFT') && (
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Cancel ${inv.number} in PayPal?`)) run(() => api.cancel(inv.id), 'Cancelled');
                  }}
                >
                  Cancel invoice
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
