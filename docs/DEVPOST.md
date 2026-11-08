# Devpost submission draft

**Project name:** PayPilot
**Tagline:** The AI accounts-receivable agent that invoices, chases and reconciles payments on PayPal.

## Inspiration
At Indiquer we build software for small and mid-sized businesses, and the same complaint comes up constantly: getting paid takes more effort than doing the work. Owners write invoices by hand, keep mental lists of who's late, put off awkward reminder emails, and then spend time matching payments to invoices. We wanted an agent that owns that whole loop end to end, on payment rails businesses already trust.

## What it does
You tell PayPilot who to bill in one sentence. It creates and sends a real PayPal invoice, then takes over:
- **Chases late payers on its own.** Each invoice gets a follow-up policy. When a due date passes, PayPilot sends reminders through PayPal, written by the AI for that client, that amount and that level of lateness. The tone escalates from friendly to firm to final, and after the last one it flags the invoice for a call.
- **Reconciles payments as they land.** PayPal webhooks trigger PayPilot to fetch the invoice from PayPal, match each transaction to the invoice, and handle partial payments, overpayments and currency mismatches. Reminders stop the moment an invoice is paid.
- **Knows how each client pays.** It learns average lateness per client, warns you when you bill a slow payer, and forecasts the next four weeks of cash-in from expected pay dates rather than due dates.

## How we built it
- **PayPal Invoicing API v2 (sandbox):** OAuth, invoice number generation, create, send, remind, get, cancel. Also **PayPal webhooks** (`INVOICING.INVOICE.*`) with signature verification through `verify-webhook-signature`.
- **AI:** an OpenAI-compatible LLM (Groq, Llama 3.3 70B) running a tool-calling agent loop over eight tools, plus a JSON-mode writer for reminder copy. A rule-based fallback keeps the product usable when no model is available.
- **App:** TypeScript and Express backend with a follow-up scheduler and reconciliation service. React (Vite) frontend with AG Grid for the invoice ledger. Deployed on Render.
- **Demo clock:** the scheduler runs on a movable clock so a three-week collection cycle can be shown in a minute.

## Challenges we ran into
- **Trust boundaries for money.** We made webhooks a trigger only: amounts and statuses always come from PayPal's API, never from the webhook body.
- **Keeping the agent from guessing.** PayPal needs a real recipient email, so the agent is instructed and structured to ask rather than invent one.
- **Making time visible in a demo.** Collections play out over weeks, so we built the demo clock without faking anything sent to PayPal.

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
paypal, paypal-invoicing-api, paypal-webhooks, groq, llama, typescript, node.js, express, react, vite, ag-grid, render
