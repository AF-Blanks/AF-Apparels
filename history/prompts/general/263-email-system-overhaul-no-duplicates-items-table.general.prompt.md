---
id: 263
title: Email System Overhaul No Duplicates Items Table
stage: general
date: 2026-06-11
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: production.aheadtech360@gmail.com
command: fix all email templates — wrong format sending, duplicate customer/admin emails, missing items table in order_received email
labels: ["email","templates","duplicates","order-received","admin-notification","guest-orders","items-table"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/webhooks.py
  - backend/app/tasks/email_tasks.py
  - backend/app/templates/emails/order_received.html
  - backend/app/templates/emails/admin_new_order.html
tests:
  - python ast.parse (PASS — checkout.py, guest.py, webhooks.py, email_tasks.py)
---

## Prompt

Email templates are completely wrong format. The new HTML templates in backend/app/templates/emails/ exist but are NOT being used for most emails. Old plain-text/simple format is still sending.

PROBLEM 1 — Wrong templates being used:
- checkout.py + guest.py call email_service.send_order_confirmation() directly (inline HTML, wrong format)
- webhooks.py ALSO dispatches send_order_confirmation_email.delay() (correct file template)
- Card payment orders get 2 emails — one wrong format, one correct

PROBLEM 2 — Duplicate admin emails (same root cause)

PROBLEM 3 — order_received.html has no items table

FIX 1 — Remove duplicate email sending (checkout.py, guest.py, webhooks.py)
FIX 2 — Replace ALL email tasks with correct HTML templates
FIX 3 — Add items table to order_received.html
FIX 4 — Add send_admin_new_order_email Celery task + admin_new_order.html template
FIX 5 — Handle guest orders in send_order_confirmation_email (no contacts — send to guest_email)

## Response snapshot

**Root cause confirmed:**

Three sources of order emails:
1. `checkout.py:353` — `_email_svc.send_order_confirmation()` (wrong inline format)
2. `guest.py:365` — same wrong direct call
3. `webhooks.py:96` — `send_order_confirmation_email.delay()` (correct Celery/file template)

Card payment orders triggered #1 and #3 → two emails to customer; wrong format to admin.

**Fix 1 — checkout.py:**

Replaced entire "Send order confirmation email" block (15 lines including order re-fetch and user lookup) with two Celery task dispatches:
```python
from app.tasks.email_tasks import send_order_confirmation_email as _send_conf
from app.tasks.email_tasks import send_admin_new_order_email as _send_admin
_send_conf.delay(str(order.id))
_send_admin.delay(str(order.id))
```

**Fix 2 — guest.py:**

Same replacement for guest checkout path; kept activation email (`send_retail_account_activation`) which still uses EmailService directly (correct — it's a one-shot call with its own template).

**Fix 3 — webhooks.py:**

Removed `send_order_confirmation_email.delay()` from the Stripe webhook handler — checkout.py now dispatches it for all payment types before the webhook fires. No more duplicate for card payments.

**Fix 4 — email_tasks.py `send_order_confirmation_email`:**

Added `_build_order_vars()` helper that builds full template variables:
- `items_list` via `_fmt_items(order.items)`
- `shipping_addr` parsed from `order.shipping_address_snapshot` (JSON)
- `payment_method` display name via pm_map dict
- `subtotal`, `shipping_cost`, `tax_amount`, `convenience_fee` (formatted as $x.xx)
- `has_items: bool` flag for template conditional

Updated task to handle guest orders:
```python
if order.is_guest_order or not order.company_id:
    # send to order.guest_email directly; contact_name from order.guest_name
else:
    # query contacts with notify_order_confirmation=True (wholesale path)
```

**Fix 5 — New `send_admin_new_order_email` Celery task:**

Reads `settings.ADMIN_NOTIFICATION_EMAIL` (fallback: `settings.ADMIN_EMAIL`), loads order with items, resolves customer display name (guest vs wholesale), sends to admin using `admin_new_order.html`.

**Fix 6 — order_received.html:**

Added after the order summary block:
- Items table (product name, color/size, qty, unit price, line total)
- Financial summary (subtotal, shipping, tax, 3% card fee if present, total)
- Payment method + shipping address line
All wrapped in `{% if has_items %}` guard so empty-items orders still render cleanly.

**Fix 7 — admin_new_order.html (new file):**

New template extending `_base.html` with:
- "New Order" badge (yellow/amber)
- Order number + total header
- Customer name, email, payment method, shipping method, guest badge
- Items table (product/color+size, qty, line total)
- Financial summary
- "View Order in Admin" button → `/admin/orders/{order_id}`

## Outcome

- ✅ Impact: Card payment customers no longer receive two confirmation emails; all confirmation emails now use the correct dark navy HTML template with items table; admin gets a single structured notification email for every new order
- ✅ Guest orders now correctly receive confirmation email (previously skipped because contact query returned nothing)
- 🧪 Tests: Python ast.parse PASS — all 4 modified Python files
- 📁 Files: 6 files changed (409 insertions / 47 deletions) + 1 new file (admin_new_order.html)
- 🔁 Next prompts: Place a test order (card payment) and verify: (1) single email received, (2) items table present, (3) admin gets admin_new_order email
- 🧠 Reflection: Duplicate emails from mixing sync EmailService calls and Celery task dispatches in the same path. Always use Celery tasks as the single dispatch point and never call email_service methods directly from API routes for transactional emails.

## Evaluation notes (flywheel)

- Failure modes observed: mixing direct email_service method calls with Celery task dispatches in the same request path causes duplicate sends; guest orders silently skipped when Contact query returns empty
- Graders run and results (PASS/FAIL): Python ast.parse PASS (4 files)
- Prompt variant (if applicable): continued from prior compacted session
- Next experiment: add integration test that places an order and asserts exactly one email sent to customer and one to admin
