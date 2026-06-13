---
id: 263
title: QB invoice shipping tax and payment balance fix
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: diagnose why QB invoices show Due instead of Paid
labels: ["quickbooks", "invoice-sync", "payment", "shipping", "tax", "balance"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/services/quickbooks_service.py
tests:
  - none
---

## Prompt

Pehle to mene ye sab kia tha to sab chal raha tha sahi se — same test card 4111 1111 1111 1111 production per kaam karta tha. QB invoices Due dikha rahi hain Paid ki jagah.

## Response snapshot

Root cause discovered by comparing DB order totals vs QB invoice amounts:
- Order 1041: DB total=$79.88, QB invoice=$42.14 (missing shipping $33 + tax $3.48)
- Order 1042: DB total=$38.78, QB invoice=$27.60 (missing shipping $8.07 + tax $2.28)

QB invoices were product-lines only. create_payment_for_invoice was called with order_data["total"] ($79.88) but QB invoice balance was only $42.14 — QB rejected payment because TotalAmt > balance. Invoice stayed as "Due".

Fix 1 (quickbooks_tasks.py): After product lines, append shipping and tax as SalesItemLineDetail lines so QB invoice total = order total = charged amount. Both use qb_item_id or "1" fallback.

Fix 2 (quickbooks_service.py create_payment_for_invoice): Instead of using the passed `amount`, fetch the invoice's actual QB Balance and pay that. Also skip if balance=0 (already paid). This handles existing invoices that were created without shipping/tax — on retry they'll be marked Paid for their actual balance.

## Outcome

- ✅ Impact: New orders: QB invoice total matches charged amount; payment recorded correctly. Old invoices (1041/1042): on manual re-sync, payment will use invoice balance and mark as Paid.
- 🧪 Tests: Place new test order → verify QB invoice shows shipping+tax lines and status=Paid
- 📁 Files: quickbooks_tasks.py (shipping+tax appended to line_items), quickbooks_service.py (payment uses invoice Balance not passed amount)
- 🔁 Next prompts: Admin → QB panel → manually re-trigger sync for orders 1041 and 1042 so they get marked Paid in QB
- 🧠 Reflection: QB payment TotalAmt must exactly match invoice Balance. Always verify invoice total = order total before recording payment. Using invoice Balance from QB fetch is safer than passing order_total directly.

## Evaluation notes (flywheel)

- Failure modes observed: Payment failure was silent (caught and logged but task marked success) — so qb_sync_log showed success even though invoice stayed Due. Need Railway logs to see the actual payment error.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Add qb_payment_id column to orders table so we can verify payment was recorded, not just invoice
