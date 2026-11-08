# Demo script (target 2:40, hard limit 3:00)

Live app: **https://paypilot.indiquer.in** (PayPal sandbox + Groq `openai/gpt-oss-120b`, webhooks signature-verified).

## Before you record (5 minutes)

1. **Reset the demo.** In PayPilot press **Reset** in the header (or `POST /api/demo/reset`), then **Clear** in the Agent panel. You should see 10 paid invoices tagged `sample` under **All**, nothing under **Open**, and the clock showing today.
2. **Check the header pills are green:** `PayPal sandbox` and `openai/gpt-oss-120b`. If the AI pill says "AI offline", the Groq key or model is wrong.
3. **Open three browser tabs**, each in its own Chrome profile or incognito window so the PayPal logins don't clash:
   - Tab A: PayPilot dashboard.
   - Tab B: sandbox.paypal.com logged in as the **business** account (shows the invoice really exists in PayPal).
   - Tab C: empty, for paying as the **personal (buyer)** sandbox account. Find it under developer.paypal.com → Sandbox → Accounts.
4. **Do one dry run** of the payment step. The business account is in India, and PayPal can hold a USD payment as *pending* until the business accepts it in Tab B. If that happens, accept it before recording.
5. Close notifications, set the browser zoom to 100%, and hide bookmarks.

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00-0:15 | Dashboard (Tab A). Point at the blue "Outstanding balance" card and the activity feed. | "Small businesses spend hours a month chasing invoices. PayPilot is an AI agent that bills, chases and reconciles payments on PayPal, so you don't have to." |
| 0:15-0:45 | Type in the Agent panel: *Bill Northwind Traders $4,000 for the October retainer, net 15, ap@northwind.example.com, and chase them if they're late.* | "One sentence. The agent creates a real PayPal invoice and sends it. It also knows Northwind usually pays about twelve days late, so it arms follow-ups." Point at the blue tool cards above the reply. |
| 0:45-1:00 | Tab B: refresh the PayPal invoices list. | "Here it is in PayPal: same number, same amount, sent to the client." Back in Tab A the feed already shows *PayPal webhook INVOICING.INVOICE.SENT (signature verified)*. |
| 1:00-1:35 | Press **+7 days** three times. Click the invoice row to open the drawer and scroll to Reminders. | "Let's jump ahead three weeks. The due date passes, and PayPilot sends a reminder through PayPal's remind API. The AI wrote that note for this client and how late they are. Next time it gets firmer." Read one line of the note. |
| 1:35-2:05 | Click **Pay link** on the invoice, pay in Tab C as the buyer. Return to Tab A. | "The client pays through PayPal. Within seconds a webhook arrives, PayPilot verifies its signature, pulls the invoice from PayPal, matches the payment, and stops the reminders." The row turns **Paid** and the feed shows the green reconciliation entries. |
| 2:05-2:30 | Ask: *Forecast my cash for the next month* | "And because it knows how each client pays, it forecasts what's actually coming in, not just what's due." |
| 2:30-2:45 | README architecture section. | "PayPal Invoicing API and webhooks, an LLM agent with tool calling, open source. PayPilot, by Indiquer." |

## If something goes wrong

- **Payment doesn't show as Paid:** check Tab B for a *pending* payment and accept it. Without a webhook the app still picks it up within 60 seconds by polling; you can also press **Sync** on the invoice's row.
- **Agent answers in offline mode:** the model is unavailable. Say so, and keep going: the offline parser still creates invoices.
- **Sandbox is slow on the day:** run locally with the PayPal keys removed and use **Client pays**. Say clearly that this is the built-in simulator.
- **After recording:** press **Reset** again so the next viewer starts clean. Reset only clears PayPilot's records; invoices stay in the PayPal sandbox.
