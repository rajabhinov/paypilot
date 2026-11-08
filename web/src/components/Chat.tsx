import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ChatMessage } from '../types';

const SUGGESTIONS = [
  'Bill Northwind Traders $4,000 for the October retainer, net 15, ap@northwind.example.com',
  "What's overdue?",
  'Forecast my cash for the next month',
  'Send a firm reminder to Northwind',
];

const TOOL_LABEL: Record<string, string> = {
  create_invoice: 'PayPal · create invoice',
  send_invoice: 'PayPal · send invoice',
  send_reminder: 'PayPal · send reminder',
  get_invoice: 'PayPal · fetch invoice',
  list_invoices: 'Look up invoices',
  set_followup: 'Follow-up policy',
  cancel_invoice: 'PayPal · cancel invoice',
  cash_insights: 'Cash insights',
};

export function Chat({ initial, aiMode, onChange }: { initial: ChatMessage[]; aiMode: 'llm' | 'offline'; onChange: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: t, at: new Date().toISOString() }, { role: 'assistant', content: '', at: '', pending: true }]);
    try {
      const reply = await api.ask(t);
      setMessages((m) => [...m.filter((x) => !x.pending), reply]);
    } catch (e) {
      setMessages((m) => [...m.filter((x) => !x.pending), { role: 'assistant', content: `Something went wrong: ${(e as Error).message}`, at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
      onChange();
    }
  }

  return (
    <aside className="chat" aria-label="PayPilot agent">
      <div className="chat-head">
        <div>
          <h2>Agent</h2>
          <div className="muted small">{aiMode === 'llm' ? 'Talk to it like your accounts person' : 'Offline mode: basic commands only'}</div>
        </div>
        {messages.length > 0 && (
          <button
            className="ghost subtle"
            onClick={async () => {
              await api.resetChat();
              setMessages([]);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="msgs" ref={listRef}>
        {messages.length === 0 && (
          <div className="intro">
            <p>
              Tell me who to bill and I'll create the PayPal invoice, send it, chase it if it's late, and reconcile the payment when it lands.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, k) => (
          <div key={k} className={`msg ${m.role}`}>
            {m.pending ? (
              <div className="bubble typing" aria-label="Agent is working">
                <i />
                <i />
                <i />
              </div>
            ) : (
              <>
                {m.actions && m.actions.length > 0 && (
                  <div className="actions">
                    {m.actions.map((a, j) => (
                      <div key={j} className={`action ${a.ok ? 'ok' : 'fail'}`}>
                        <span className="action-tool">{TOOL_LABEL[a.tool] ?? a.tool}</span>
                        <span className="action-sum">{a.summary}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bubble">{m.content}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder='e.g. "Invoice Bluepeak $2,400 for the app sprint, net 30, finance@bluepeak.example.com"'
          rows={2}
          aria-label="Message the agent"
        />
        <button className="primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
