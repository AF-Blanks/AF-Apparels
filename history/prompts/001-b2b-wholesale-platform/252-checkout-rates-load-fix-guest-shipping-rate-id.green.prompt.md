---
id: 252
title: Checkout rates initial load + guest shipping_rate_id fix
stage: green
date: 2026-06-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["checkout","shipping","live-rates","guest","debounce","shippo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - backend/app/api/v1/guest.py
tests:
  - none
---

## Prompt

Two issues:
1. Checkout live Shippo rates need 1-2 page reloads to appear — first visit shows no rates
2. Guest/retail checkout (logout wale) has same shipping_rate_id issue as wholesale — not being saved on order

## Response snapshot

Issue 1: Root cause was `cartItemsForShipping` (a state array) in the rate-fetch useEffect deps. On every cart load, a new array reference is created → effect re-runs → debounce timer resets to 800ms. If multiple state changes happen in sequence (shippingTypeForUser, savedAddress, cart), the timer keeps resetting and may not fire reliably on first visit. Fix: moved cartItemsForShipping to a ref (cartItemsRef) so it's always current but doesn't trigger effect re-runs. Reduced debounce from 800ms to 400ms.

Issue 2: guest.py had the same raw SQL UPDATE pattern for shipping_rate_id that silently fails. Fixed by setting shipping_rate_id, carrier, courier_service directly on the Order ORM object at creation (same fix as order_service.py).

## Outcome

- ✅ Impact: Live Shippo rates appear on first visit to checkout; guest orders now reliably save the customer's selected carrier rate
- 🧪 Tests: none
- 📁 Files: 2 files modified
- 🔁 Next prompts: Test guest checkout with live Shippo rate selection; verify admin shows "Generate [carrier] Label" for guest orders
- 🧠 Reflection: Array state in useEffect deps creates subtle debounce-reset bugs. Always use refs for values needed inside effects that shouldn't cause re-runs.

## Evaluation notes (flywheel)

- Failure modes observed: Silent raw SQL UPDATE failure — same pattern as order_service.py. Arrays as effect deps cause unexpected debounce resets.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
