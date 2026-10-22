# Task 08 — Estimate: BOM per panel and cost estimate

Status: pending

## Outcome
The assigned engineer (or EngineeringLead) builds an estimate for a request — panels with BOM lines and cost lines — and submits it; the request becomes `estimated` atomically and the sales owner is notified.

## Scope
- In: `sales/estimate` feature (D-02). Estimate (code `DT_YYYY_NNNN`, request, revision). Panel (tag e.g. `MSB-01`, quantity, description). BOM line (catalog item, quantity `numeric(18,3)`, unit cost defaulted from item reference price, note). Cost lines per panel by `design|labor|installation|transport|other`. Server-side totals with `decimal.js` (D-06): panel unit cost = Σ(qty × unit cost) + Σ cost lines; estimate total = Σ(panel unit cost × panel qty). Creating the first draft moves request `assigned → estimating`; submit moves `estimating → estimated` in the same transaction via `RequestStatusPort` (D-07); submitted is read-only; revise creates a new draft revision (allowed only while request is `estimated` or `estimating`, never after `quoted`). Permissions `estimate:*`; write/submit only by assigned engineer or EngineeringLead. Register item reference check.
- Out: stock/shortage, purchase request (P2); pricing (task-09); BOM Excel import.

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/sales/estimate/`, `frontend/src/plugins/sales/estimate/`, `frontend/src/app/[locale]/sales/estimates/`
- Modify: `backend/src/plugins/sales/sales.module.ts`, shared registration files listed in plan.md
- Read: `backend/src/plugins/catalog/_shared/gateways/`, `backend/src/plugins/sales/request/`

## Steps
1. Entities/migration (unique code); create via `createWithDocumentCode('DT', …)` from task-07 (D-09); add `decimal.js` dependency.
2. Totals service as pure functions + spec.
3. Authorization: actor must be the request's `assignedEngineerId` or hold EngineeringLead scope.
4. Submit/revise in transactions with status port; notification after commit.
5. Frontend editor: panel tabs, BOM grid with item picker, cost lines, totals; submit/revise.
6. Specs: totals fixture (2 panels, qty 2 and 1, decimal quantities); first draft moves request `assigned → estimating`; engineer B edits A's estimate → 404 (outside D-12 scope); actor without `estimate:update` → 403; edit after submit → 409; submit sets request `estimated` and notifies once; revise after `quoted` → 409; deleting an item used in a BOM line → 409 (registered reference check).

## Acceptance
- AC-09.

## Dependencies
- task-07-sales-request.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/estimate && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"`
- Named probe: `src/plugins/sales/estimate/services/estimate-totals.spec.ts`, `src/plugins/sales/estimate/services/estimate.service.spec.ts`
- Reachability: known after task-02.
- Oracle: totals fixture equals the asserted VND value; status/permission assertions as listed.
- Counterexample: computing cost lines without multiplying by panel quantity must fail the totals fixture.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
