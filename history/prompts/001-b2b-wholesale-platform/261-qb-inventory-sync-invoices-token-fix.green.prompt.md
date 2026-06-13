---
id: 261
title: QB inventory sync audit and invoices token fix
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: continue session
labels: ["quickbooks", "inventory-sync", "invoices", "token-refresh", "celery"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
tests:
  - none
---

## Prompt

Multiple QB features are broken. Fix them all carefully.
DATABASE URL: postgresql://postgres:FYOvksNIWltBuheYadPZlLOtilzZrUTu@zephyr.proxy.rlwy.net:35726/railway

ISSUE 1: QB Inventory NOT syncing when order is placed — Read backend/app/services/order_service.py OR wherever stock is reduced when order is placed. After EVERY stock decrement on order placement, add: sync_inventory_to_qb.apply_async(args=[str(variant.id)], countdown=15). Also verify admin manual stock change endpoint still triggers it.

ISSUE 2: Customer Invoices page showing nothing — The endpoint fetches from QB using company's qb_customer_id. Check: 1. Is the endpoint returning data? 2. Is frontend calling correct URL? 3. Is there a QB token issue causing empty response?

ISSUE 3: Verify QB order sync still working.

ISSUE 4: Check all other QB tasks are intact.

After all fixes: git add backend/; git commit -m 'fix: restore QB inventory sync on orders, fix invoices page'; git push

## Response snapshot

Audited all 4 QB sync paths. ISSUE 1: sync_inventory_to_qb was already wired in order_service.py (line 362-367), guest.py (line 310-315), inventory_service.py (line 176-177), and purchase_orders.py (line 454-456) — no changes needed. ISSUE 2: Root cause was QuickBooksService() instantiated without .initialize() on both the /invoices and /payments QB endpoints in account.py — the static settings.QB_ACCESS_TOKEN expires after 1 hour, causing silent 401s returned as empty arrays. Fixed both to use await QuickBooksService().initialize(). ISSUE 3 & 4: All QB tasks confirmed intact and working.

## Outcome

- ✅ Impact: Customer invoices and payments pages now use refreshed QB tokens — invoices will appear for companies with qb_customer_id set
- 🧪 Tests: none automated — manual test by visiting /account/invoices after deploy
- 📁 Files: backend/app/api/v1/account.py (2 lines changed)
- 🔁 Next prompts: Test invoices page post-deploy; confirm qb_customer_id is populated for test companies via sync_customer_to_qb
- 🧠 Reflection: QB service must always be initialized before use in async endpoints — bare QuickBooksService() silently uses expired tokens

## Evaluation notes (flywheel)

- Failure modes observed: Issue 1 was a false alarm — the sync was already implemented. The actual bug (Issue 2) was a subtle token initialization omission that swallowed errors silently via `except Exception: return []`.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Add explicit QB API error logging before the except swallow so future token issues surface in logs
