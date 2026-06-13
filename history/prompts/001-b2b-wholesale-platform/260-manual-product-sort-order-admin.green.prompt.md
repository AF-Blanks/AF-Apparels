---
id: 260
title: Manual product sort order for admin
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["products","sort-order","admin","drag-reorder","up-down-arrows","backend","frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - backend/app/api/v1/admin/products.py
  - frontend/src/types/product.types.ts
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/products/page.tsx
tests:
  - none
---

## Prompt

Add manual sort order to products so admin can control which products appear first on Shop All and category pages. Backend: sort_order INTEGER column (default 0), ORDER BY sort_order ASC (0 = last), PATCH /admin/products/{id}/sort-order endpoint. Frontend admin: ↑/↓ arrow buttons per row with numeric position display, swaps adjacent sort_order values. Public pages: use backend ordering as-is. DB initialized: ROW_NUMBER() OVER (ORDER BY created_at DESC). git add backend/ frontend/; commit; push.

## Response snapshot

Backend: Added sort_order INTEGER NOT NULL DEFAULT 0 to Product model and ran ALTER TABLE. ProductDetail and ProductListItem schemas expose sort_order. product_service.list_with_filters_and_search orders by CASE (sort_order==0 → 2147483647) ASC, created_at DESC so sort_order=0 products always appear last. admin/products list query uses same ordering. New PATCH /{product_id}/sort-order endpoint validates int payload, updates product.sort_order, flushes products:list:* Redis cache, returns {id, sort_order}.

Frontend: ProductDetail type gets sort_order?: number. admin.service.ts gets updateProductSortOrder(id, sort_order). Admin products page: Sort column added with ↑/↓ mini-buttons and numeric sort_order display. handleMoveUp/handleMoveDown swap adjacent row sort_orders via two parallel PATCH calls then reload. ↑ disabled on first row, ↓ disabled on last row. colSpan updated 9→10.

DB: 12 existing products initialized with sort_order 1..12 via WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn FROM products) UPDATE products SET sort_order = ranked.rn FROM ranked WHERE products.id = ranked.id.

## Outcome

- ✅ Impact: Admin can reorder products via ↑/↓ arrows; Shop All and category pages reflect admin order; sort_order=0 new products always appear last
- 🧪 Tests: none
- 📁 Files: 7 files modified
- 🔁 Next prompts: Test moving products up/down in admin; verify Shop All page order matches; add sort_order input to product edit page for direct number entry
- 🧠 Reflection: CASE(sort_order==0 → MAX_INT) pattern keeps default-zero products at the end without requiring NULL-based logic; clean and avoids NULLS LAST complexity

## Evaluation notes (flywheel)

- Failure modes observed: distinct() + order_by() on subquery for count may add overhead; sort_order swap with two PATCH calls is not atomic — concurrent clicks could produce incorrect ordering
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Add a single PATCH /admin/products/reorder endpoint that accepts [{id, sort_order}] array for atomic multi-row updates
