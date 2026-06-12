---
id: 256
title: Fix Shippo label complete address error
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","shippo","label-generation","address","phone","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/services/shippo_service.py
tests:
  - none
---

## Prompt

Fix: Shippo label purchase fails with "rate may only be purchased if generated with complete address information". Root cause: checkout /live-rates endpoint creates Shippo shipments without phone — rate_id gets saved to order — when admin tries to purchase that rate_id for a label, Shippo rejects it.

## Response snapshot

Two changes:

1. generate_shipping_label (admin/orders.py): Removed the saved rate_id fast path entirely. The checkout rate_id is generated with incomplete address (no phone) and cannot be used for label purchase. Now always creates fresh Shippo labels via create_label_for_box(). Added phone extraction from snapshot (guest orders store phone in snapshot; wholesale fallback to "+12145550000"). Added "Customer" name fallback. Cleaned up the for-box loop to be a flat loop at function body level (removed nested if carrier_name / else guards).

2. create_label_for_box (shippo_service.py): Added phone field to AddressCreateRequest for address_to. Uses to_address["phone"] or "+12145550000" fallback. Also changed name to use "Customer" default instead of empty string.

## Outcome

- ✅ Impact: Label purchase no longer fails with Shippo "complete address" error; fresh shipment created per box with phone included in address_to
- 🧪 Tests: none
- 📁 Files: 2 files modified
- 🔁 Next: Test label generation on order with UPS live rate; verify label PDF URL is returned

## Evaluation notes (flywheel)

- Failure modes observed: Shippo rate_id from checkout is unusable for label purchase — was not obvious until production error
- Graders: none
- Next experiment: none
