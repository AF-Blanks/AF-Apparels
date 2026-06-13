---
id: 262
title: QB sync 400 fix — missing ItemRef fallback
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: diagnose and fix QB sync broken after recent commits
labels: ["quickbooks", "invoice-sync", "400-error", "itemref", "quickbooks_service"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
tests:
  - none
---

## Prompt

QB sync is broken after recent commits. Diagnose and fix.

DATABASE URL: postgresql://postgres:FYOvksNIWltBuheYadPZlLOtilzZrUTu@zephyr.proxy.rlwy.net:35726/railway

[Full multi-step diagnostic: check Railway logs, git log, read both QB files, fix based on findings, verify tokens, find unsync'd orders, push fix]

## Response snapshot

Diagnosed via qb_sync_log table (Railway logs not directly accessible). Found two distinct failure modes:

1. Orders 1037/1038 — `429 Too Many Requests` when querying QB for customer "Ikrash Maniya" (rate limiting from rapid concurrent requests; hit max 6 retries; not a code bug)

2. Orders 1035/1040 — `400 Bad Request` on `/invoice` endpoint. Root cause: both orders had variants with `qb_item_id = NULL`. `create_invoice` in quickbooks_service.py only added `ItemRef` when `qb_item_id` was present — when None, the field was omitted entirely. QB requires `ItemRef` on every `SalesItemLineDetail` line and returns 400 without it.

Fix: changed `create_invoice` to always include `"ItemRef": {"value": item.get("qb_item_id") or "1"}` — falls back to QB item "1" (default Services item) when variant not yet synced to QB.

Code is otherwise clean: no DescriptionOnly lines, no shipping/tax lines, all 4 QB tasks intact.

## Outcome

- ✅ Impact: Future invoice syncs for orders with un-synced variants will succeed using QB item "1" fallback instead of 400ing
- 🧪 Tests: none automated — manual test: place order with un-synced variant SKU, confirm qb_invoice_id appears in DB
- 📁 Files: backend/app/services/quickbooks_service.py (1 line changed — removed conditional ItemRef, replaced with always-included fallback)
- 🔁 Next prompts: Manually re-trigger sync for orders 1035, 1037, 1038 via admin QB panel; sync variants 8df0b956 and 4831c9bc to QB so they get proper qb_item_id
- 🧠 Reflection: QB API always requires ItemRef on SalesItemLineDetail — never omit it. Use a fallback like "1" rather than making it conditional.

## Evaluation notes (flywheel)

- Failure modes observed: Railway logs not accessible directly — qb_sync_log table was the correct diagnostic tool. The 400 error message in qb_sync_log didn't include the QB response body (only httpx summary), requiring inference from the code + DB data.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Log QB response body (resp.text) into qb_sync_log.error_message so future 400 diagnosis doesn't require inference
