export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type Tone = 'friendly' | 'firm' | 'final';

export interface Client {
  name: string;
  email: string;
  company?: string;
}

export interface LineItem {
  name: string;
  quantity: number;
  unitAmount: number;
}

export interface ReminderRecord {
  at: string;
  tone: Tone;
  subject: string;
  note: string;
  auto: boolean;
  writtenBy: 'ai' | 'template';
}

export interface FollowupPolicy {
  enabled: boolean;
  cadenceDays: number;
  maxReminders: number;
  remindersSent: number;
  lastReminderAt?: string;
  nextReminderAt?: string;
}

export interface Invoice {
  id: string;
  /** PayPal invoice id. Empty for sample history records. */
  paypalId: string;
  number: string;
  /** 'paypal' = PayPal sandbox, 'mock' = local simulator, 'sample' = seeded history (never sent anywhere). */
  source: 'paypal' | 'mock' | 'sample';
  client: Client;
  items: LineItem[];
  currency: string;
  total: number;
  note?: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  payUrl?: string;
  amountPaid: number;
  paidAt?: string;
  followup: FollowupPolicy;
  reminders: ReminderRecord[];
  createdAt: string;
  createdBy: 'agent' | 'user' | 'seed';
}

export type Reconciliation = 'MATCHED' | 'PARTIAL' | 'OVERPAID' | 'UNMATCHED';

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  paypalTransactionId: string;
  amount: number;
  currency: string;
  method: string;
  receivedAt: string;
  reconciliation: Reconciliation;
  note?: string;
}

export type ActivityKind =
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_cancelled'
  | 'reminder_sent'
  | 'payment_received'
  | 'reconciled'
  | 'followup'
  | 'webhook'
  | 'system'
  | 'error';

export interface Activity {
  id: string;
  at: string;
  kind: ActivityKind;
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
}
