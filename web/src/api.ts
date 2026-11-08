import type { AppState, ChatMessage } from './types';

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  state: () => req<AppState>('/state'),
  ask: (message: string) => req<ChatMessage>('/agent', { message }),
  resetChat: () => req('/agent/reset', {}),
  remind: (id: string) => req(`/invoices/${id}/remind`, {}),
  send: (id: string) => req(`/invoices/${id}/send`, {}),
  sync: (id: string) => req(`/invoices/${id}/sync`, {}),
  cancel: (id: string) => req(`/invoices/${id}/cancel`, {}),
  followup: (id: string, enabled: boolean) => req(`/invoices/${id}/followup`, { enabled }),
  simulatePay: (id: string, amount?: number) => req(`/invoices/${id}/simulate-payment`, { amount }),
  advance: (days: number) => req('/clock/advance', { days }),
  resetClock: () => req('/clock/reset', {}),
  resetDemo: () => req('/demo/reset', {}),
};

export const money = (n: number, cur: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / 86_400_000);
