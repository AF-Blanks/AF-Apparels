---
id: 255
title: Fix multi-box and address label bugs
stage: green
date: 2026-06-12
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","shippo","multi-box","address","label-generation","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
tests:
  - none
---

## Prompt

Two bugs to fix:

Bug 1 — Only 1 label generated: Order 1031 (Long Sleeve ×70, Blended Tee ×104, Hoodie ×29) generated only 1 label. Multi-box loop at line 941 was gated by `if carrier_name and service_name:` — when order.courier_service is null (no service saved on order), service_name="" → condition False → single-label fallback.

Bug 2 — "Incomplete shipping address": Order 1032 (1906 S Haskell Ave, Dallas TX 75223) failed address check. Wholesale checkout stores snapshot with "line1" key; generate_shipping_label was checking addr.get("street1") (not "line1") → street1="" → all() check failed.

## Response snapshot

Bug 1: Changed `if carrier_name and service_name:` to `if carrier_name:`. Empty service_name is fine — create_label_for_box() with empty service_name matches any rate from that carrier. Added logger.info for box calculation diagnostics.

Bug 2: Fixed address parser in generate_shipping_label to check "address_line1" OR "line1" OR "street1" (all three key variants). Added UserAddress FK fallback — if snapshot is null/incomplete, loads address from order.shipping_address_id → company.UserAddress record. Added logger.warning when address still incomplete after fallback.

## Outcome

- ✅ Impact: Multi-box labels now generate correctly regardless of whether courier_service is set on order; address parsing works for all three snapshot formats (seed, wholesale checkout, guest checkout)
- 🧪 Tests: none
- 📁 Files: 1 file modified (backend/app/api/v1/admin/orders.py)
- 🔁 Next: Test both orders; confirm N labels for Order 1031, label generated for Order 1032

## Evaluation notes (flywheel)

- Failure modes: (1) `service_name` condition too strict — should only require carrier; (2) snapshot key "line1" not in fallback chain
- Graders: none
- Next experiment: none
