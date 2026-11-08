import 'dotenv/config';
import path from 'node:path';

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env('PORT', '8787')),
  businessName: env('BUSINESS_NAME', 'Indiquer Global Service Pvt Ltd'),
  currency: env('DEFAULT_CURRENCY', 'USD').toUpperCase(),
  dataFile: path.resolve(env('DATA_FILE', './data/paypilot.json')),
  seedSampleHistory: env('SEED_SAMPLE_HISTORY', 'true') !== 'false',
  schedulerIntervalMs: Number(env('SCHEDULER_INTERVAL_MS', '15000')),
  pollIntervalMs: Number(env('PAYPAL_POLL_INTERVAL_MS', '60000')),
  paypal: {
    clientId: env('PAYPAL_CLIENT_ID'),
    clientSecret: env('PAYPAL_CLIENT_SECRET'),
    env: (env('PAYPAL_ENV', 'sandbox') === 'live' ? 'live' : 'sandbox') as 'live' | 'sandbox',
    webhookId: env('PAYPAL_WEBHOOK_ID'),
  },
  llm: {
    // Any OpenAI-compatible chat completions endpoint with tool calling. Defaults to Groq.
    apiKey: env('LLM_API_KEY') || env('GROQ_API_KEY'),
    baseUrl: env('LLM_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: env('LLM_MODEL', 'llama-3.3-70b-versatile'),
  },
};

export const paypalLive = Boolean(config.paypal.clientId && config.paypal.clientSecret);
export const llmLive = Boolean(config.llm.apiKey);
