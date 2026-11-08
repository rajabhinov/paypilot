# Devpost submission draft

**Project name:** PayPilot
**Tagline:** The AI accounts-receivable agent that invoices, chases and reconciles payments on PayPal.
**Longer pitch (162 chars):** Tell it who to bill in one sentence. PayPilot sends the PayPal invoice, chases late payers with AI-written reminders, and reconciles the payment the moment it lands.

**Links**
- Live demo: https://paypilot.indiquer.in (PayPal sandbox; login details in the "Testing instructions" field)
- Code: https://github.com/rajabhinov/paypilot (MIT)
- Video: _add the YouTube link_

## Inspiration
At Indiquer we build software for small and mid-sized businesses, and the same complaint comes up constantly: getting paid takes more effort than doing the work. Owners write invoices by hand, keep mental lists of who's late, put off awkward reminder emails, and then spend time matching payments to invoices. We wanted an agent that owns that whole loop end to end, on payment rails businesses already trust.

## What it does
You tell PayPilot who to bill in one sentence. It creates and sends a real PayPal invoice, then takes over:
- **Chases late payers on its own.** Each invoice gets a follow-up policy. When a due date passes, PayPilot sends reminders through PayPal, written by the AI for that client, that amount and that level of lateness. The tone escalates from friendly to firm to final, and after the last one it flags the invoice for a call.
- **Reconciles payments as they land.** PayPal webhooks trigger PayPilot to fetch the invoice from PayPal, match each transaction to the invoice, and handle partial payments, overpayments and currency mismatches. Reminders stop the moment an invoice is paid.
- **Knows how each client pays.** It learns average lateness per client, warns you when you bill a slow payer, and forecasts the next four weeks of cash-in from expected pay dates rather than due dates.

## How we built it
- **PayPal Invoicing API v2 (sandbox):** OAuth, invoice number generation, create, send, remind, get, cancel. Also **PayPal webhooks** (`INVOICING.INVOICE.*`) with signature verification through `verify-webhook-signature`.
- **AI:** an OpenAI-compatible LLM (`openai/gpt-oss-120b` on Groq) running a tool-calling agent loop over eight tools, plus a JSON-mode writer for reminder copy. A rule-based fallback keeps the product usable when no model is available.
- **App:** TypeScript and Express backend with a follow-up scheduler and reconciliation service. React (Vite) frontend with AG Grid for the invoice ledger, styled as a PayPal-style business dashboard that works on phones and in dark mode.
- **Hosting:** runs under pm2 on our own Ubuntu server, published through a Cloudflare Tunnel with HTTP Basic Auth in front of the app. Only the webhook and health check are open, and webhooks are signature-verified. A `render.yaml` is included for one-click deploys.
- **Demo clock:** the scheduler runs on a movable clock so a three-week collection cycle can be shown in a minute.

## Challenges we ran into
- **Trust boundaries for money.** We made webhooks a trigger only: amounts and statuses always come from PayPal's API, never from the webhook body.
- **Keeping the agent from guessing.** PayPal needs a real recipient email, so the agent is instructed and structured to ask rather than invent one.
- **Making time visible in a demo.** Collections play out over weeks, so we built the demo clock without faking anything sent to PayPal.
- **Moving to a reasoning model.** Switching to `gpt-oss-120b` broke two things quietly: the model spent its whole token budget thinking before writing a reminder (so every reminder fell back to a template), and it sent `null` for optional tool fields, which Groq's strict schema check rejects. We raised the writer's budget, let optional fields be null and strip them before running a tool, and collapse replies the model occasionally repeats. Each reminder is labelled "written by AI" or "template" in the app, which is how we caught the first problem.

## Accomplishments we're proud of
A single sentence produces a real invoice in PayPal, and the full collect-and-reconcile cycle runs without another click.

## What we learned
Most of the value in an "AI finance agent" isn't the chat. It's owning the boring follow-through reliably, with every action visible and reversible.

## What's next
- Multi-tenant accounts and a database.
- PayPal Orders and payment links for one-off charges.
- Payment plans for partial payers.
- WhatsApp and SMS reminders.
- Pulling client terms from contracts.
- Bringing PayPilot into Indiquer's FinDesk product.

## Built with
paypal, paypal-invoicing-api, paypal-webhooks, groq, gpt-oss, typescript, node.js, express, react, vite, ag-grid, pm2, cloudflare-tunnel

## Testing instructions (for judges)
Open https://paypilot.indiquer.in and sign in with the username and password given here. It is connected to the PayPal sandbox and a live AI model.
1. In the Agent panel, type: *Bill Northwind Traders $4,000 for the October retainer, net 15, ap@northwind.example.com, and chase them if they're late.*
2. Press **+7 days** three times in the header and open the invoice to read the reminders the AI wrote.
3. Ask: *Forecast my cash for the next month.*
4. Press **Reset** when you're done so the next judge starts clean.

To run it locally instead, follow "Run it" in the README; it works with no keys using the built-in PayPal simulator.
