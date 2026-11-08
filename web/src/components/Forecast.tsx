import { money } from '../api';
import type { Insights } from '../types';

/** 4-week expected cash-in: solid = expected, hatched = at risk (from client payment behaviour). */
export function Forecast({ insights: i }: { insights: Insights }) {
  const max = Math.max(1, ...i.forecast.map((w) => w.expected + w.atRisk));
  return (
    <div className="card forecast">
      <div className="card-head">
        <h2>Cash-in forecast</h2>
        <span className="muted small">next 4 weeks</span>
      </div>
      <div className="bars" role="img" aria-label={`Expected cash-in: ${i.forecast.map((w) => `${w.label} ${money(w.expected, i.currency)}`).join(', ')}`}>
        {i.forecast.map((w) => {
          const exp = (w.expected / max) * 100;
          const risk = (w.atRisk / max) * 100;
          return (
            <div className="bar-col" key={w.label}>
              <div className="bar-val mono">{w.expected ? money(w.expected, i.currency) : '-'}</div>
              <div className="bar-track">
                <div className="bar-risk" style={{ height: `${risk}%` }} />
                <div className="bar-exp" style={{ height: `${exp}%` }} />
              </div>
              <div className="bar-label">{w.label}</div>
            </div>
          );
        })}
      </div>
      <div className="legend small">
        <span>
          <i className="sw exp" /> expected
        </span>
        <span>
          <i className="sw risk" /> at risk
        </span>
      </div>
      {i.risks.length > 0 && (
        <ul className="risks">
          {i.risks.slice(0, 3).map((r) => (
            <li key={r.invoice}>
              <span className="mono">{r.invoice}</span> {r.client} · {money(r.amount, i.currency)}
              <div className="muted small">{r.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
