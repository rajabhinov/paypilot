export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface Invoice {
  id: string;
  paypalId: string;
  number: string;
  source: 'paypal' | 'mock' | 'sample';
  client: { name: string; email: string; company?: string };
  items: { name: string; quantity: number; unitAmount: number }[];
  currency: string;
  total: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  payUrl?: string;
  amountPaid: number;
  paidAt?: string;
  followup: { enabled: boolean; cadenceDays: number; maxReminders: number; remindersSent: number; nextReminderAt?: string };
  reminders: { at: string; tone: string; subject: string; note: string; auto: boolean; writtenBy: 'ai' | 'template' }[];
}

export interface Activity {
  id: string;
  at: string;
  kind: string;
  message: string;
  invoiceId?: string;
  actor: 'agent' | 'user' | 'paypal' | 'system';
}

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  actions?: AgentAction[];
  mode?: 'llm' | 'offline';
  pending?: boolean;
}

export interface Insights {
  asOf: string;
  currency: string;
  outstanding: number;
  openCount: number;
  overdue: { count: number; amount: number };
  collected30: number;
  avgDaysToPay: number | null;
  onTimeRate: number | null;
  expected30: number;
  forecast: { label: string; start: string; expected: number; atRisk: number }[];
  risks: { invoice: string; client: string; amount: number; reason: string }[];
}

export interface AppState {
  status: {
    paypal: 'sandbox' | 'live' | 'mock';
    ai: { mode: 'llm'; model: string } | { mode: 'offline' };
    business: string;
    currency: string;
    webhookVerification: boolean;
  };
  clock: { now: string; offsetDays: number };
  invoices: Invoice[];
  activity: Activity[];
  conversation: ChatMessage[];
  insights: Insights;
}
