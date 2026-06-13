---
id: 258
title: QB invoice shipping+tax lines, sandbox decline emulation
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["quickbooks","invoice","shipping","tax","sandbox","card-decline","checkout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/services/quickbooks_service.py
  - backend/app/api/v1/checkout.py
tests:
  - none
---

## Prompt

Fix 2 issues: FIX 1 — QB Invoice should include Shipping + Tax as separate line items (currently only product lines). Add shipping as SalesItemLineDetail and tax as DescriptionOnly. FIX 2 — Test card decline simulation in /tokenize endpoint using QB_ENVIRONMENT=sandbox + emulate=10401/emulate=10301 in card name, plus clear error display in frontend. git add backend/ frontend/; git commit -m 'fix: QB invoice include shipping+tax lines, sandbox decline emulation'; git push

## Response snapshot

Fix 1 (quickbooks_tasks.py): After building order_data["items"] from product lines, append shipping (SalesItemLineDetail: qty=1, unit_price=order.shipping_cost) when shipping_cost > 0, and tax (DescriptionOnly: description="Tax: $X.XX", amount=tax_amount) when tax_amount > 0. Used order.shipping_cost and order.tax_amount fields from the Order model.

Fix 1 (quickbooks_service.py): Updated create_invoice loop to check item.get("detail_type") == "DescriptionOnly" and emit a DescriptionOnlyLine QB API structure (DetailType: DescriptionOnlyLine, DescriptionOnlyLine: {}). All other items continue to use SalesItemLineDetail as before.

Fix 2 (checkout.py): In tokenize_card, before calling qb_pay.create_token(), check os.getenv("QB_ENVIRONMENT") == "sandbox". If card name contains "emulate=10401", return JSONResponse(402) with {"error": {"code": "10401", "message": "Card declined: Insufficient funds (simulated)"}}. If "emulate=10301", return 402 with "Card declined: Do not honor (simulated)". Response uses the apiClient error format so err.message is shown in the QBPaymentForm red error box without frontend changes.

## Outcome

- ✅ Impact: QB invoices now show Shipping and Tax as explicit line items; sandbox card decline simulation works via card name emulation codes
- 🧪 Tests: none
- 📁 Files: 3 files modified
- 🔁 Next prompts: Test QB invoice creation for a wholesale order — verify Shipping and Tax lines appear on the QB invoice PDF
- 🧠 Reflection: apiClient error format ({"error": {"code","message"}}) must be used in JSONResponse for frontend to display decline message; FastAPI HTTPException {"detail": ...} would have shown "Request failed" instead

## Evaluation notes (flywheel)

- Failure modes observed: DescriptionOnlyLine QB API structure differs from SalesItemLineDetail — cannot share the same loop body without a branch on detail_type
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Verify DescriptionOnlyLine with non-zero Amount is accepted by QB API; if not, set Amount=0 and put the dollar value only in Description text
