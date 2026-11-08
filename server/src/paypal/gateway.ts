import type { Client, InvoiceStatus, LineItem } from '../types.js';

export interface CreateInvoiceInput {
  client: Client;
  items: LineItem[];
  currency: string;
  note?: string;
  dueInDays: number;
  businessName: string;
}

export interface RemoteTransaction {
  id: string;
  amount: number;
  currency: string;
  method: string;
  date?: string;
}

export interface RemoteInvoice {
  status: InvoiceStatus;
  total: number;
  amountPaid: number;
  payUrl?: string;
  transactions: RemoteTransaction[];
}

export interface PayPalGateway {
  mode: 'sandbox' | 'live' | 'mock';
  createInvoice(input: CreateInvoiceInput): Promise<{ paypalId: string; number: string }>;
  sendInvoice(paypalId: string): Promise<{ payUrl?: string }>;
  remind(paypalId: string, subject: string, note: string): Promise<void>;
  cancel(paypalId: string, note: string): Promise<void>;
  getInvoice(paypalId: string): Promise<RemoteInvoice>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean>;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    public status?: number,
    public debugId?: string,
  ) {
    super(message);
  }
}
