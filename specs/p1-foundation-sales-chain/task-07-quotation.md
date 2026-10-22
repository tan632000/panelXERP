# Task 07 — Quotation from estimate with pricing, versions and internal approval

Status: blocked
Blocked by: Q1 (approval rule) and Q2 (pricing/rounding) in plan.md — GATE-REVIEW.

## Outcome
Sales turns the latest submitted estimate into a priced quotation, gets it approved internally, sends it, records customer feedback, and revises it as new versions with full history.

## Scope
- In: `sales/quotation` feature. Quotation (code `BG_YYYY_NNNN`, request, estimate revision) with versions. Version status reuses REF enum shape (`REF/backend/src/plugins/sales/quotation/enums/quotation-status.enum.ts:11`): `pending_approval`, `approved`, `customer_confirmed`, `cancelled`, `closed`. Lines copied from estimate panels (panel tag, description, qty, cost); margin, discount, VAT and rounding per Q2. Approval per Q1 with approver, timestamp, comment; rejection returns to editable with reason. Customer feedback log (date, channel, content). PDF/Excel export of the approved version. Request status → `quoted` on first approval, → `lost` on cancel with reason "customer rejected".
- Out: configurable approval engine; e-signature; email sending.

## Coverage
- CP-07

## Ownership
- Create: `backend/src/plugins/sales/quotation/`, `frontend/src/plugins/sales/quotation/`, `frontend/src/app/[locale]/sales/quotations/`
- Modify: `backend/src/plugins/sales/sales.plugin.ts`, `seed-roles.ts` (append keys only)
- Read: `REF/backend/src/plugins/sales/quotation/` (versioning, approval steps, export constants), `backend/src/plugins/engineering/` gateway

## Steps
1. Entities/migration (quotation, version, line, approval, feedback).
2. Pricing service as pure functions per Q2, unit-tested with fixtures.
3. Version service: revise → new version N+1 copying lines, N → `closed`.
4. Approval service per Q1; `customer_confirmed` only from `approved`.
5. Events → request status + notifications (approver on submit, sales owner on approve/reject).
6. Frontend list, editor with live totals, approval panel, version history diff view, feedback log, export.

## Acceptance
- AC-08: quotation created from estimate fixture has identical panels/costs and prices per Q2 fixture.
- AC-09: revise produces N+1, N becomes `closed`.
- AC-10: confirming a `pending_approval` version → 409.

## Dependencies
- task-06-engineering-estimate.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/sales/quotation && npm run validate:migrations && npm run typecheck" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/sales/quotation/services/quotation-pricing.spec.ts`, `src/plugins/sales/quotation/services/quotation-version.service.spec.ts`, `src/plugins/sales/quotation/services/quotation-approval.service.spec.ts`
- Reachability: known after task-01.
- Oracle: pricing fixture totals equal the Q2 worked example to the VND; status assertions per AC-09/AC-10.
- Counterexample: rounding at total instead of line (or vice versa, per Q2) must fail the fixture.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
