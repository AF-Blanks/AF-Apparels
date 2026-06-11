---
id: 250
title: Delete customer + shipping auto-fetch fix
stage: green
date: 2026-06-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["delete-company","shipping","admin","auto-fetch","customer-management"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/customers.py
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - none
---

## Prompt

Two issues:
1. User deleted a user from Railway database but the customer "Aheadtech Development ID" still appears in the admin Customers list. Also cannot login with that email (correct, user was deleted). Confused why it still shows.
2. When retail customer selects shipping at checkout, admin order page re-fetches Shippo rates automatically. User wants: fetching system should only appear when customer was NOT given a live Shippo option. Otherwise, just show what the customer selected (same as before).

## Response snapshot

Issue 1: Customers list shows Company records, not User records. Deleting the User from DB does NOT delete the Company. Added a permanent Delete feature: backend DELETE endpoint + frontend Delete button with confirmation dialog on customer detail page.

Issue 2: Removed the auto-fetch useEffect (lines 329-360) from admin order detail page that was auto-triggering Shippo rate fetch on every Standard Ground order load. Admin now must manually click "Fetch Rates" button.

## Outcome

- ✅ Impact: Admin can permanently delete company/customer records; Standard Ground orders no longer auto-fetch rates on page load
- 🧪 Tests: none
- 📁 Files: 4 files modified
- 🔁 Next prompts: Test delete flow; verify shipping section shows correctly for all 3 order types
- 🧠 Reflection: Customers list is Company-based, not User-based — deleting users from DB orphans Company records. The auto-fetch was added as a convenience but caused confusion when customer had already selected flat rate shipping.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
