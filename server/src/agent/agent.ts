import { config, llmLive } from '../config.js';
import { isoDate, now, nowIso } from '../clock.js';
import { store } from '../store.js';
import type { AgentAction, ChatMessage } from '../types.js';
import { chat, type LlmMessage } from './llm.js';
import { runOffline } from './offline.js';
import { runTool, toolDefs } from './tools.js';

const MAX_STEPS = 6;

function systemPrompt() {
  return `You are PayPilot, the accounts-receivable agent for ${config.businessName}. You create and send PayPal invoices, chase unpaid ones, reconcile payments and explain cash flow.
Today is ${isoDate(now())}. Default currency: ${config.currency}.

Rules:
- Act with tools; don't describe what you would do. "Bill", "invoice" or "charge" someone means create_invoice with send=true unless they say draft.
- PayPal requires a client email. If it's missing, ask for it. Never invent or guess an email.
- Convert "4k" to 4000, "net 30" to due_in_days=30. If no currency is given use ${config.currency}.
- When a client has a history of paying late, say so and suggest (or set) a tighter follow-up cadence.
- Only cancel invoices when the user explicitly asks.
- For questions about money owed, overdue, cash or forecast, call cash_insights or list_invoices first; never guess numbers.
- Reply in 1-4 short sentences or a compact list. Mention invoice numbers and amounts. No markdown tables.`;
}

export async function runAgent(text: string): Promise<ChatMessage> {
  const convo = store.data.conversation;
  convo.push({ role: 'user', content: text, at: nowIso() });

  let reply: ChatMessage;
  if (!llmLive) {
    reply = { ...(await runOffline(text)), mode: 'offline' };
  } else {
    try {
      reply = await runWithLlm(convo);
    } catch (err) {
      console.error('[agent] LLM failed, using offline parser:', (err as Error).message);
      const off = await runOffline(text);
      reply = { ...off, content: `${off.content}\n\n(AI model unavailable: ${(err as Error).message.slice(0, 120)}. Used the offline parser.)`, mode: 'offline' };
    }
  }
  convo.push(reply);
  store.data.conversation = convo.slice(-60);
  store.save();
  return reply;
}

async function runWithLlm(convo: ChatMessage[]): Promise<ChatMessage> {
  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt() },
    ...convo.slice(-12).map((m) => ({ role: m.role, content: m.content }) as LlmMessage),
  ];
  const actions: AgentAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await chat(messages, { tools: toolDefs });
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { role: 'assistant', content: (msg.content ?? '').trim() || 'Done.', at: nowIso(), actions, mode: 'llm' };
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* leave empty; tool will report missing fields */
      }
      const result = await runTool(call.function.name, args);
      actions.push({ tool: call.function.name, args, ok: result.ok, summary: result.summary });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
    }
  }
  return {
    role: 'assistant',
    content: actions.length ? actions.map((a) => `- ${a.summary}`).join('\n') : 'I could not finish that request.',
    at: nowIso(),
    actions,
    mode: 'llm',
  };
}
