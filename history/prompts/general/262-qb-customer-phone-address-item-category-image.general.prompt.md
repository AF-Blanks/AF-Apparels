---
id: 262
title: QB Customer Phone Address Item Category Image
stage: general
date: 2026-06-11
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: production.aheadtech360@gmail.com
command: QB customer sync add phone+address; QB item sync add category+image URL
labels: ["quickbooks","customer-sync","item-sync","phone","address","category","image"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - python ast.parse (PASS — both files)
---

## Prompt

Two small fixes for QB sync — customer fields and product fields.

FIX 1: Customer sync — add Phone + Shipping Address when syncing company to QB
FIX 2: Product sync — add Image URL + Category description when syncing variant to QB

## Response snapshot

**Field names confirmed:**

Company model (`company.py`):
- `phone: str | None` (direct field)
- `address_line1`, `address_line2`, `city`, `state_province`, `postal_code`, `country`

ProductImage model:
- `url_thumbnail` (150px), `url_medium` (400px), `url_large` (800px)
- `is_primary: bool`, `sort_order: int`
- `product.primary_image` property already handles is_primary → first image fallback

Product model:
- `category_links` → `ProductCategory.category` → `Category.name`
- `product.categories` property = `[link.category for link in self.category_links]`

**Fix 1 — `create_customer` + `sync_customer_to_qb`:**

Added `bill_addr: dict | None = None` parameter to `create_customer`:
```python
if bill_addr:
    payload["BillAddr"] = bill_addr
    payload["ShipAddr"] = bill_addr  # same as billing
```

In task, after snapshotting email/name:
```python
phone = company.phone or None
bill_addr = None
if company.address_line1:
    _addr = {"Line1": company.address_line1, ...}
    # city, state_province→CountrySubDivisionCode, postal_code, country
    bill_addr = _addr

qb_id = await asyncio.to_thread(
    svc.create_customer, name, email, phone, ref_id=ref, bill_addr=bill_addr,
)
```

**Fix 2 — `find_or_create_item` + `sync_variant_to_qb`:**

Added `description: str = ""` and `purchase_desc: str = ""` params to `find_or_create_item`:
```python
if description:
    payload["Description"] = description[:4000]
    payload["SalesDesc"]   = description[:4000]
if purchase_desc:
    payload["PurchaseDesc"] = purchase_desc[:4000]
```

In task, added chained selectinload for images + category_links:
```python
selectinload(ProductVariant.product).selectinload(Product.images),
selectinload(ProductVariant.product)
    .selectinload(Product.category_links)
    .selectinload(ProductCategory.category),
```

Built description:
```python
category_name = product.categories[0].name if product.categories else ""
image_url = product.primary_image.url_medium if product.primary_image else ""
desc_parts = []
if category_name: desc_parts.append(f"Category: {category_name}")
if image_url: desc_parts.append(f"Image: {image_url}")
description = " | ".join(desc_parts)

qb_item_id = await asyncio.to_thread(
    svc.find_or_create_item, sku, item_name, unit_price, cost, total_stock,
    description, description,
)
```

## Outcome

- ✅ Impact: QB customers now include phone number and full billing/shipping address from company registration; QB inventory items include category and image URL in Description/SalesDesc/PurchaseDesc fields
- 🧪 Tests: Python ast.parse PASS — both files
- 📁 Files: 2 files changed (53 insertions / 4 deletions)
- 🔁 Next prompts: Re-sync an existing customer and product to QB to verify the new fields appear in QB's customer and item records
- 🧠 Reflection: QB Item description fields (Description/SalesDesc/PurchaseDesc) have a 4000-char limit — truncated defensively. QB Customer address uses CountrySubDivisionCode for state (not "State"), PostalCode (not "ZipCode") — must use QB's exact field names.

## Evaluation notes (flywheel)

- Failure modes observed: QB field names differ from common names — CountrySubDivisionCode not State, PostalCode not ZipCode
- Graders run and results (PASS/FAIL): Python ast.parse PASS
- Prompt variant (if applicable): none
- Next experiment: update existing QB customers with phone/address via sparse PUT after this feature ships
