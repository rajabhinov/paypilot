import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import { api, daysBetween, money, shortDate } from '../api';
import type { AppState, Invoice } from '../types';

const theme = themeQuartz.withParams({
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--ink)',
  headerBackgroundColor: 'var(--hover)',
  headerTextColor: 'var(--muted)',
  borderColor: 'var(--line)',
  rowHoverColor: 'var(--hover)',
  selectedRowBackgroundColor: 'var(--hover)',
  accentColor: 'var(--accent)',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 600,
  rowHeight: 48,
  headerHeight: 42,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
});

type Filter = 'open' | 'all' | 'paid';

export function InvoiceGrid({
  state,
  onSelect,
  run,
}: {
  state: AppState;
  onSelect: (id: string) => void;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const now = state.clock.now;
  const mock = state.status.paypal === 'mock';

  const rows = useMemo(() => {
    const list = state.invoices.filter((i) =>
      filter === 'all' ? true : filter === 'paid' ? i.status === 'PAID' : i.status === 'SENT' || i.status === 'PARTIALLY_PAID' || i.status === 'DRAFT',
    );
    return list;
  }, [state.invoices, filter]);

  const cols = useMemo<ColDef<Invoice>[]>(
    () => [
      {
        headerName: 'Invoice',
        field: 'number',
        width: 165,
        cellRenderer: (p: ICellRendererParams<Invoice>) => (
          <span className="mono">
            {p.value}
            {p.data?.source === 'sample' && <span className="tag">sample</span>}
          </span>
        ),
      },
      { headerName: 'Client', valueGetter: (p) => p.data?.client.company || p.data?.client.name, flex: 1, minWidth: 120 },
      {
        headerName: 'Amount',
        field: 'total',
        width: 100,
        type: 'rightAligned',
        cellClass: 'mono',
        valueFormatter: (p) => (p.data ? money(p.data.total, p.data.currency) : ''),
      },
      {
        headerName: 'Status',
        width: 128,
        valueGetter: (p) => (p.data ? statusOf(p.data, now).label : ''),
        cellRenderer: (p: ICellRendererParams<Invoice>) => {
          if (!p.data) return null;
          const s = statusOf(p.data, now);
          return <span className={`status ${s.tone}`}>{s.label}</span>;
        },
      },
      { headerName: 'Due', field: 'dueDate', width: 92, valueFormatter: (p) => (p.value ? shortDate(p.value) : '') },
      {
        headerName: 'Follow-up',
        width: 132,
        valueGetter: (p) => p.data?.followup.remindersSent ?? 0,
        cellRenderer: (p: ICellRendererParams<Invoice>) => {
          const f = p.data?.followup;
          if (!p.data || p.data.source === 'sample') return <span className="muted">-</span>;
          if (!f) return null;
          return (
            <span className="followup">
              <span className="dots" aria-label={`${f.remindersSent} of ${f.maxReminders} reminders sent`}>
                {Array.from({ length: f.maxReminders }, (_, k) => (
                  <i key={k} className={k < f.remindersSent ? 'on' : ''} />
                ))}
              </span>
              <span className="muted">{f.enabled ? (f.nextReminderAt ? `next ${shortDate(f.nextReminderAt)}` : 'armed') : p.data.status === 'PAID' ? 'done' : 'off'}</span>
            </span>
          );
        },
      },
      {
        headerName: '',
        width: 240,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<Invoice>) => {
          const i = p.data;
          if (!i || i.source === 'sample') return null;
          const open = i.status === 'SENT' || i.status === 'PARTIALLY_PAID';
          return (
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              {i.status === 'DRAFT' && <button onClick={() => run(() => api.send(i.id), `Sent ${i.number}`)}>Send</button>}
              {open && <button onClick={() => run(() => api.remind(i.id), `Reminder sent for ${i.number}`)}>Remind</button>}
              {open && mock && (
                <button className="primary" onClick={() => run(() => api.simulatePay(i.id), `Payment simulated for ${i.number}`)} title="Simulator only: act as the client paying">
                  Client pays
                </button>
              )}
              {open && !mock && i.payUrl && (
                <a className="btn" href={i.payUrl} target="_blank" rel="noreferrer" title="Open the PayPal sandbox payer page">
                  Pay link
                </a>
              )}
              {open && !mock && <button onClick={() => run(() => api.sync(i.id), `Synced ${i.number}`)}>Sync</button>}
            </span>
          );
        },
      },
    ],
    [now, mock, run],
  );

  return (
    <div className="card grid-card">
      <div className="card-head">
        <h2>Invoices</h2>
        <div className="seg" role="tablist" aria-label="Filter invoices">
          {(['open', 'paid', 'all'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'open' ? 'Open' : f === 'paid' ? 'Paid' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid-wrap">
        <AgGridReact<Invoice>
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          getRowId={(p) => p.data.id}
          onRowClicked={(e) => e.data && onSelect(e.data.id)}
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
          overlayNoRowsTemplate={
            filter === 'open' ? '<span class="empty">No open invoices. Ask the agent to bill a client.</span>' : '<span class="empty">Nothing here yet.</span>'
          }
          animateRows
        />
      </div>
    </div>
  );
}

export function statusOf(i: Invoice, now: string): { label: string; tone: string } {
  if (i.status === 'PAID') return { label: 'Paid', tone: 'good' };
  if (i.status === 'CANCELLED') return { label: 'Cancelled', tone: 'muted' };
  if (i.status === 'DRAFT') return { label: 'Draft', tone: 'muted' };
  const late = daysBetween(i.dueDate, now);
  if (i.status === 'PARTIALLY_PAID') return { label: late > 0 ? `Part paid · ${late}d late` : 'Part paid', tone: 'warn' };
  if (late > 0) return { label: `${late}d overdue`, tone: 'bad' };
  if (late === 0) return { label: 'Due today', tone: 'warn' };
  return { label: `Due in ${-late}d`, tone: 'info' };
}
