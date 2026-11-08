import { config } from '../config.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Minimal client for any OpenAI-compatible /chat/completions endpoint (Groq by default). */
export async function chat(messages: LlmMessage[], opts: { tools?: ToolDef[]; json?: boolean; maxTokens?: number } = {}) {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.llm.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { choices: { message: LlmMessage }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error('LLM returned no message');
  return msg;
}
