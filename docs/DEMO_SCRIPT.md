# Demo video script (target 2:40, hard limit 3:00)

Record with PayPal sandbox and the AI key **on** (header pills green). Reset demo data first. Keep a second tab logged in to the sandbox business account at sandbox.paypal.com to show the invoice really exists. No music unless it's royalty-free and licensed.

| Time | On screen | Say |
|---|---|---|
| 0:00-0:15 | Dashboard | "Small businesses spend hours a month chasing invoices. PayPilot is an AI agent that bills, chases and reconciles payments on PayPal, so you don't have to." |
| 0:15-0:45 | Type: *Bill Northwind Traders $4,000 for the October retainer, net 15, ap@northwind.example.com, and chase them if they're late.* | "One sentence. The agent creates a real PayPal invoice and sends it. It also notices Northwind usually pays twelve days late, so it arms follow-ups." Point at the tool cards. |
| 0:45-1:00 | Switch to the sandbox PayPal tab, refresh invoices | "Here it is in PayPal: same number, same amount, sent to the client." |
| 1:00-1:35 | Press **+7 days** three times. Open the invoice drawer. | "Let's jump ahead three weeks. The due date passes, and PayPilot sends a reminder through PayPal's remind API. The AI wrote that note for this client and how late they are. Next time it gets firmer." Read one line of the note. |
| 1:35-2:05 | Open the Pay link as a sandbox buyer and pay. Back on the dashboard, the activity feed lights up green. | "The client pays through PayPal. A webhook arrives, PayPilot verifies it, pulls the invoice from PayPal, matches the transaction to the invoice, and stops the reminders." |
| 2:05-2:30 | Ask: *Forecast my cash for the next month* | "And because it knows how each client pays, it forecasts what's actually coming in, not just what's due." |
| 2:30-2:45 | Architecture slide or README section | "PayPal Invoicing API and webhooks, an LLM agent with tool calling, open source. PayPilot, by Indiquer." |

Backup if the sandbox pay flow is slow on the day: run with PayPal keys removed and use "Client pays". Say clearly that this is the built-in simulator.
