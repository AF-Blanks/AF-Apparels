---
id: 251
title: Fix shipping_rate_id not saved on order
stage: green
date: 2026-06-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","live-rates","order-service","checkout","shippo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - frontend/src/services/orders.service.ts
tests:
  - none
---

## Prompt

User placed an order selecting USPS Priority Mail (live Shippo rate) at checkout, but on admin order detail page it shows "standard — Flat Rate" and the Standard Ground fetch-rates UI instead of the direct "Generate USPS Label" button. Admin had to re-fetch rates instead of seeing the customer's selection.

## Response snapshot

Root cause: in `order_service.create_order()`, `shipping_rate_id`, `carrier`, and `courier_service` were NOT set on the ORM Order object at creation time. They were attempted via a raw SQL UPDATE after `flush()`, which fails silently (exception caught and swallowed). The raw SQL UPDATE route is fragile because if Shippo rate IDs use special characters or there's any DB issue, it silently fails and the order saves with null.

Fix: set `shipping_rate_id`, `carrier`, `courier_service` directly on the Order constructor (ORM object) so they're saved reliably via the normal ORM flush. Removed the redundant raw SQL UPDATE. Also added the three fields to the `ConfirmOrderPayload` TypeScript interface.

## Outcome

- ✅ Impact: Live Shippo rate selected at checkout now reliably saved on the order. Admin shows CASE 1 (direct Generate Label) for live-rate orders.
- 🧪 Tests: none
- 📁 Files: 2 files modified
- 🔁 Next prompts: Test with fresh checkout + live Shippo rate selection; verify admin shows "Generate [carrier] Label" button directly
- 🧠 Reflection: Raw SQL UPDATEs with silent exception swallowing are dangerous — always prefer ORM-level field assignment. The pattern of adding fields "post-flush via raw SQL" should be cleaned up to use ORM.

## Evaluation notes (flywheel)

- Failure modes observed: Silent exception swallowing masked the bug — the raw SQL UPDATE was failing but the order creation succeeded, so there was no visible error
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): audit other raw SQL UPDATEs in order_service for similar silent failures
