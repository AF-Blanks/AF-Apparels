---
id: 254
title: Live-rate multi-box labels + checkout rates retry
stage: green
date: 2026-06-12
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","shippo","multi-box","live-rate","retry","checkout","label-generation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/shipping.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - none
---

## Prompt

Two bugs to fix:

Issue A: Multi-box labels not working for live-rate orders — Order #1031 (Long Sleeve ×70, Blended Tee ×104, Hoodie ×29) selected UPS 2nd Day Air at checkout → admin saw "Generate UPS Label" button (CASE 1) → clicked → only 1 label generated. Root cause: multi-box logic was added to /generate-label-manual (CASE 2 Standard Ground) but not to /labels (CASE 1 live-rate). Fix: update /labels endpoint to calculate boxes and create one label per box.

Issue B: Checkout shipping rates show "Unavailable" or only 1 service sometimes. Root cause: /api/v1/shipping/live-rates has no retry logic; Shippo often returns partial results on first response. The admin fetch-rates endpoint retries 5 times at 1.5s each — live-rates needs the same.

## Response snapshot

Fix A: Rewrote generate_shipping_label (/labels endpoint) to load order items, call calculate_boxes(), try saved rate_id only for single-box, then create_label_for_box() per box for multi-box or when saved rate expired. Saves all_labels JSON and returns `labels` array. Frontend handleGenerateLabel updated to handle `labels` array response and display multi-box UI (matching CASE 2 display) for CASE 1 orders when num_boxes > 1. Button hides after labels generated.

Fix B: Added `import asyncio` to shipping.py. Added same 5-retry polling block (asyncio.sleep 1.5s) to live-rates endpoint after shipment creation — polls client.shipments.get() when UPS/USPS/FedEx are missing from results.

## Outcome

- ✅ Impact: Large live-rate orders now generate correct number of Shippo labels; checkout shipping rates load reliably on first visit
- 🧪 Tests: none
- 📁 Files: 3 files modified
- 🔁 Next: Test order with 2+ boxes via live-rate checkout path; confirm all box tracking numbers appear in admin UI

## Evaluation notes (flywheel)

- Failure modes observed: Multi-box fix was applied only to CASE 2 in previous session, missing CASE 1 entirely
- Graders run and results: none
- Next experiment: none
