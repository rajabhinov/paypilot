import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import type { Activity, ActivityKind, ChatMessage, Invoice, Payment } from './types.js';

export interface Data {
  invoices: Invoice[];
  payments: Payment[];
  activity: Activity[];
  conversation: ChatMessage[];
  clockOffsetMs: number;
  seq: number;
}

const empty = (): Data => ({
  invoices: [],
  payments: [],
  activity: [],
  conversation: [],
  clockOffsetMs: 0,
  seq: 0,
});

class Store {
  data: Data;

  constructor(private file: string) {
    this.data = empty();
    try {
      if (fs.existsSync(file)) this.data = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      console.error('[store] could not read data file, starting fresh:', err);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  reset() {
    this.data = empty();
    this.save();
  }

  nextId(prefix: string) {
    this.data.seq += 1;
    return `${prefix}_${Date.now().toString(36)}${this.data.seq.toString(36)}`;
  }

  /** Activity timestamps use the demo clock so the feed lines up with time travel. */
  log(kind: ActivityKind, message: string, opts: { invoiceId?: string; actor?: Activity['actor']; at: string }) {
    this.data.activity.unshift({
      id: this.nextId('act'),
      at: opts.at,
      kind,
      message,
      invoiceId: opts.invoiceId,
      actor: opts.actor ?? 'system',
    });
    this.data.activity = this.data.activity.slice(0, 300);
    this.save();
  }
}

export const store = new Store(config.dataFile);
