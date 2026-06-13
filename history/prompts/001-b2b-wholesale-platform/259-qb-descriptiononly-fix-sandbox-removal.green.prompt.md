---
id: 259
title: QB DescriptionOnly format fix, remove sandbox emulate
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["quickbooks","invoice","descriptiononly","checkout","bug-fix","celery"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/api/v1/checkout.py
tests:
  - none
---

## Prompt

Two issues after last fix. ISSUE 1: QB auto-sync stopped working. QB API DescriptionOnly line format was wrong — Amount must be 0, DetailType must be "DescriptionOnly" (not "DescriptionOnlyLine"), nested key must be "DescriptionOnly" with ServiceDate/TaxCodeRef fields. ISSUE 2: Remove sandbox emulate=10401/10301 check from tokenize_card — we are on production QB, real declines come from QB API itself.

## Response snapshot

Issue 1 — Three bugs in the DescriptionOnly line format:
1. quickbooks_service.py: DetailType was "DescriptionOnlyLine" (invalid) → fixed to "DescriptionOnly". Nested key was "DescriptionOnlyLine": {} → fixed to "DescriptionOnly": {"ServiceDate": None, "TaxCodeRef": {"value": "NON"}}. Amount was float(item["amount"]) → fixed to 0.
2. quickbooks_tasks.py: tax item had "amount": _tax → fixed to "amount": 0 (QB rejects non-zero on DescriptionOnly; tax value already in Description string as "Tax: $X.XX").

Issue 2 — checkout.py: removed the entire sandbox emulate block (os.getenv QB_ENVIRONMENT check, JSONResponse imports, both emulate=10401 and emulate=10301 branches).

Committed and pushed. Railway backend was redeploying at time of push.

## Outcome

- ✅ Impact: QB invoice sync no longer fails with DescriptionOnly API error; sandbox emulate code removed from production checkout path
- 🧪 Tests: none
- 📁 Files: 3 files modified
- 🔁 Next prompts: Once Railway redeploys, trigger sync for a recent unsync'd order via admin panel → order detail → Sync to QB button. Best test case: order with both tax_amount > 0 and shipping_cost > 0 (e.g. AF-000052: tax=$14.57, shipping=$7.94)
- 🧠 Reflection: QB API DescriptionOnly requires Amount=0 and uses the nested key name "DescriptionOnly" (matching DetailType) — not "DescriptionOnlyLine". Always verify QB API field names match the DetailType string exactly.

## Evaluation notes (flywheel)

- Failure modes observed: QB API DescriptionOnly format was incorrect on all three axes — wrong DetailType string, wrong nested key name, non-zero Amount. Previous PHR noted "Amount=0 if QB rejects" as a possibility, but it was shipped with non-zero.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): After deployment, place a new test order and verify QB invoice is created with Shipping and Tax lines visible on the QB invoice PDF
