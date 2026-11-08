import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppState } from './types';
import { Header } from './components/Header';
import { Kpis } from './components/Kpis';
import { InvoiceGrid } from './components/InvoiceGrid';
import { Forecast } from './components/Forecast';
import { ActivityFeed } from './components/ActivityFeed';
import { Chat } from './components/Chat';
import { InvoiceDrawer } from './components/InvoiceDrawer';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      try {
        await fn();
        if (ok) setToast(ok);
      } catch (e) {
        setToast((e as Error).message);
      }
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!state) {
    return <div className="boot">{error ? `Can't reach the PayPilot API: ${error}` : 'Loading PayPilot...'}</div>;
  }

  const inv = state.invoices.find((i) => i.id === selected) ?? null;

  return (
    <div className="app">
      <Header state={state} run={run} />
      <main className="layout">
        <section className="workspace" aria-label="Receivables">
          <Kpis insights={state.insights} />
          <InvoiceGrid state={state} onSelect={setSelected} run={run} />
          <div className="lower">
            <Forecast insights={state.insights} />
            <ActivityFeed activity={state.activity} onSelect={setSelected} />
          </div>
        </section>
        <Chat initial={state.conversation} aiMode={state.status.ai.mode} onChange={refresh} />
      </main>
      {inv && <InvoiceDrawer inv={inv} mode={state.status.paypal} now={state.clock.now} onClose={() => setSelected(null)} run={run} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
