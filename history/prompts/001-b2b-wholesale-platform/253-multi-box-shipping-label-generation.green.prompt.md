---
id: 253
title: Multi-box shipping label generation
stage: green
date: 2026-06-12
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","shippo","multi-box","label-generation","box-calculator","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/utils/__init__.py
  - backend/app/utils/box_calculator.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/services/shippo_service.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/main.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - none
---

## Prompt

Build automatic multi-box shipping label generation.

GOAL: When admin clicks "Generate Label", system automatically calculates how many boxes the order needs, then generates one Shippo label per box.

Box capacity per product type:
- T-Shirts S to 2XL → 72 per box (weight multiplier 1.0x)
- T-Shirts 3XL → 60 per box (1.2x)
- T-Shirts 4XL/5XL → 48 per box (1.5x)
- Long Sleeve → 48 per box (1.5x)
- Hoodies/Sweatshirts → 24 per box (7.5x)

Backend: box_calculator.py utility, box-summary GET endpoint, updated generate-label-manual to create one label per box, all_labels column on orders.

Frontend: Show box summary banner (N boxes, X.XX lbs/box), rate cost × N boxes total, separate label download for each box.

## Response snapshot

Created box_calculator.py utility with _item_multiplier() and calculate_boxes() functions. Added all_labels TEXT column to Order model and startup migration. Added create_label_for_box() to shippo_service.py that creates a fresh Shippo shipment per box using carrier+service name matching. Added GET /api/v1/admin/orders/{id}/box-summary endpoint. Updated generate-label-manual to: calculate boxes, create one label per box via create_label_for_box, save all label data as JSON in all_labels column. Frontend shows box summary banner, updates rate list to show per-box cost × num_boxes, shows each box's tracking + download link after generation, parses existing all_labels on page load.

## Outcome

- ✅ Impact: Admin generate-label flow now automatically detects multi-box orders and creates one Shippo label per box; box summary shows before generating
- 🧪 Tests: none
- 📁 Files: 8 files modified/created
- 🔁 Next prompts: Test with a real multi-box order; verify each box gets its own tracking number and label PDF
- 🧠 Reflection: Multi-parcel Shippo API is complex; creating N separate single-parcel shipments is more reliable than Shippo batch/multi-parcel API

## Evaluation notes (flywheel)

- Failure modes observed: Shippo multi-parcel/batch API requires different flow — used separate-shipment-per-box approach instead
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
