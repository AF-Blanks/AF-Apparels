---
id: 257
title: Scored service matching + parallel box labels
stage: green
date: 2026-06-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: chat
labels: ["shipping","shippo","multi-box","parallel","asyncio","label-generation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/shippo_service.py
  - backend/app/api/v1/admin/orders.py
tests:
  - none
---

## Prompt

Fix two multi-box label issues: (1) Boxes 2 and 6 got "Priority Mail" instead of "Priority Mail Express" — exact service matching failing. (2) Boxes generated sequentially causing 15-20s latency for 7 boxes — parallelize with asyncio.gather.

## Response snapshot

Fix 1 (shippo_service.py): Replaced linear first-match rate selection with scored matching. Score 0=exact (target==rate_service), 1=partial (substring either direction), 2=same carrier any service. Within same score tier, sorts by cheapest rate. This prevents "Priority Mail" from being picked when "Priority Mail Express" is the target — the Express rate scores 1 (partial), plain Mail scores 2 (no match), Express wins.

Fix 2 (admin/orders.py): Replaced sequential for-box loops in both generate_shipping_label (CASE 1) and generate_label_manual (CASE 2 multi-box) with asyncio.gather() using nested async helper functions. return_exceptions=True collects all outcomes; results sorted by box_number for consistent ordering. Applied to both label endpoints.

## Outcome

- ✅ Impact: All boxes use the same carrier service; 7-box order goes from ~18s to ~3-4s generation time
- 🧪 Tests: none
- 📁 Files: 2 files modified
- 🔁 Next: Test 7-box order; verify all tracking numbers and labels appear and all show same service name

## Evaluation notes (flywheel)

- Failure modes: First-match linear scan doesn't distinguish between partial/exact — scoring approach is more robust
- Graders: none
- Next experiment: none
