import { api, shortDate } from '../api';
import type { AppState } from '../types';

export function Header({ state, run }: { state: AppState; run: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const { status, clock } = state;
  const paypalLabel = status.paypal === 'mock' ? 'PayPal simulator' : `PayPal ${status.paypal}`;
  const aiLabel = status.ai.mode === 'llm' ? status.ai.model : 'AI offline';
  return (
    <header className="header">
      <div className="brand">
        <span className="mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="22" height="22">
            <path d="M8 23 L16 7 L24 23 L16 18.5 Z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <div className="name">
            Pay<b>Pilot</b>
          </div>
          <div className="by">{status.business}</div>
        </div>
      </div>

      <div className="pills">
        <span className={`pill ${status.paypal === 'mock' ? 'warn' : 'ok'}`} title={status.paypal === 'mock' ? 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to use the PayPal sandbox' : 'Connected to the PayPal REST API'}>
          <i /> {paypalLabel}
        </span>
        <span className={`pill ${status.ai.mode === 'llm' ? 'ok' : 'warn'}`} title={status.ai.mode === 'llm' ? 'AI agent with tool calling' : 'Set LLM_API_KEY to enable the AI agent'}>
          <i /> {aiLabel}
        </span>
      </div>

      <div className="clock" aria-label="Demo clock">
        <span className="clock-label">
          {shortDate(clock.now)}
          {clock.offsetDays > 0 && <em> +{clock.offsetDays}d</em>}
        </span>
        <button className="ghost" onClick={() => run(() => api.advance(1))} title="Move the demo clock forward one day">
          +1 day
        </button>
        <button className="ghost" onClick={() => run(() => api.advance(7))} title="Move the demo clock forward a week">
          +7 days
        </button>
        {clock.offsetDays > 0 && (
          <button className="ghost" onClick={() => run(() => api.resetClock(), 'Clock back to today')}>
            Today
          </button>
        )}
        <button
          className="ghost subtle"
          onClick={() => {
            if (confirm('Reset demo data? This clears local invoices and activity (nothing is deleted in PayPal).')) run(() => api.resetDemo(), 'Demo reset');
          }}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
