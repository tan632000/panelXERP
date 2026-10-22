# Task 11 — Sales order from confirmed quotation, chain proven end-to-end

Status: pending

## Outcome
A customer-confirmed quotation version becomes exactly one sales order that snapshots all data, and the full request → estimate → quotation → order chain is proven over HTTP against a real database.

## Scope
- In: `sales/order` feature. Order (code `DH_YYYY_NNNN`, customer snapshot name/tax code/address, project, contract no./date, delivery date, links to request, estimate revision, quotation version; snapshot lines with price/VAT/total; payment terms text). Unique `quotation_id` without soft-delete filter; no delete endpoint, only `cancel` with reason (D-04). Status `open → in_production → delivered → completed | cancelled` (P1 exposes `open`, `cancelled`). Convert locks the quotation header (D-08); request → `won` synchronously. Event `sales.order.created` after commit (consumed in P2/P3). Scope D-12; permissions `order:*`.
- Out: production order, payment schedule (P3, P5).

## Coverage
- CP-11

## Ownership
- Create: `backend/src/plugins/sales/order/`, `frontend/src/plugins/sales/order/`, `frontend/src/app/[locale]/sales/orders/`, `backend/test/sales-chain.e2e-spec.ts`
- Modify: `backend/src/plugins/sales/sales.module.ts`, shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/sales/order/`

## Steps
1. Entities/migration (unique code).
2. Convert service with guards and snapshot; code via `createWithDocumentCode('DH', …)` (D-09).
3. Frontend list + detail with chain breadcrumb.
4. Unit specs: second conversion → 409; convert `approved` (not confirmed) → 409; concurrent conversions → one order; Sales B reads Sales A's order → 404.
5. E2E: log in as demo users per role → customer, project, item → request → assign → estimate → submit → quotation → approve (by another user) → confirm → order; then revise quotation is refused and order lines still equal the confirmed version; request `won`.

## Acceptance
- AC-13.

## Dependencies
- task-10-quotation-approval-feedback.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/order && npm run validate:migrations && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/order"`
- Named probe: `src/plugins/sales/order/services/order-convert.service.spec.ts`, `test/sales-chain.e2e-spec.ts`
- Reachability: `test:e2e` mapper fixed and proven in task-01; e2e DB = compose Postgres.
- Oracle: e2e passes with request `won` and line totals equal to the confirmed version; unit 409 cases pass.
- Counterexample: order lines referencing live quotation lines must fail the post-order equality check.
- Artifacts: e2e data uses a unique customer code prefix and is cleaned up.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
