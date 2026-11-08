import { money } from '../api';
import type { Insights } from '../types';

export function Kpis({ insights: i }: { insights: Insights }) {
  const c = i.currency;
  const tiles = [
    { label: 'Outstanding balance', tone: 'hero', value: money(i.outstanding, c), sub: `${i.openCount} open invoice${i.openCount === 1 ? '' : 's'}` },
    { label: 'Overdue', value: money(i.overdue.amount, c), sub: `${i.overdue.count} invoice${i.overdue.count === 1 ? '' : 's'}`, tone: i.overdue.count ? 'bad' : undefined },
    { label: 'Collected, 30 days', value: money(i.collected30, c), sub: 'reconciled payments' },
    { label: 'Avg. days to pay', value: i.avgDaysToPay === null ? '-' : `${i.avgDaysToPay}`, sub: i.onTimeRate === null ? 'no history yet' : `${Math.round(i.onTimeRate * 100)}% paid on time` },
    { label: 'Expected, 4 weeks', value: money(i.expected30, c), sub: 'AI forecast', tone: 'good' },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div className={`kpi ${t.tone ?? ''}`} key={t.label}>
          <div className="kpi-label">{t.label}</div>
          <div className="kpi-value">{t.value}</div>
          <div className="kpi-sub">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}
