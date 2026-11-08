import type { Activity } from '../types';
import { shortDate } from '../api';

const ACTOR: Record<Activity['actor'], string> = { agent: 'Agent', paypal: 'PayPal', user: 'You', system: 'System' };

export function ActivityFeed({ activity, onSelect }: { activity: Activity[]; onSelect: (id: string) => void }) {
  return (
    <div className="card activity">
      <div className="card-head">
        <h2>Agent activity</h2>
        <span className="muted small">live</span>
      </div>
      <ol className="feed">
        {activity.slice(0, 40).map((a) => (
          <li key={a.id} className={`k-${a.kind}`}>
            <span className={`who ${a.actor}`}>{ACTOR[a.actor]}</span>
            <span className="what">
              {a.invoiceId ? (
                <button className="linkish" onClick={() => onSelect(a.invoiceId!)}>
                  {a.message}
                </button>
              ) : (
                a.message
              )}
            </span>
            <time className="muted small">{shortDate(a.at)}</time>
          </li>
        ))}
        {!activity.length && <li className="muted">Nothing yet.</li>}
      </ol>
    </div>
  );
}
