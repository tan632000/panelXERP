# Task 08 — Sales order from confirmed quotation, chain proven end-to-end

Status: pending

## Outcome
A customer-confirmed quotation version becomes a sales order (đơn hàng/hợp đồng) that inherits all data, and the whole chain request → estimate → quotation → order is navigable and proven by an e2e test against a real database.

## Scope
- In: `sales/order` feature. Order (code `DH_YYYY_NNNN`, customer, project, contract no., contract date, delivery date, links to request, estimate revision, quotation version; snapshot lines with price/VAT/total; payment terms text). Status `open` → `in_production` → `delivered` → `completed` | `cancelled` (later packets drive the middle transitions; P1 exposes only `open` and `cancelled`). One order per quotation (unique). Request status → `won`. Event `sales.order.created` (consumed by P2/P3 later). Order detail shows the chain with links.
- Out: production order, payment schedule (P3, P5).

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/sales/order/`, `frontend/src/plugins/sales/order/`, `frontend/src/app/[locale]/sales/orders/`, `backend/test/sales-chain.e2e-spec.ts`
- Modify: `backend/src/plugins/sales/sales.plugin.ts`, `seed-roles.ts` (append keys only)
- Read: `REF/backend/src/plugins/sales/order/`, `REF/backend/test/jest-e2e.json`

## Steps
1. Entities/migration with unique index on `quotation_id WHERE is_deleted = false`.
2. Convert service: guard version status `customer_confirmed`; copy lines; transaction; event after commit.
3. Frontend list + detail with chain breadcrumb.
4. Unit spec: second conversion → 409; converting an `approved` (not confirmed) version → 409.
5. E2E spec over HTTP on the compose Postgres: login as seeded users → create customer/project → item → request → assign → estimate → submit → quotation → approve → confirm → order; assert order lines equal quotation lines and request status `won`.

## Acceptance
- AC-11: e2e asserts snapshot equality and chain ids.
- AC-12: unit spec asserts 409 on second conversion.

## Dependencies
- task-07-quotation.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/sales/order && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/sales/order/services/order-convert.service.spec.ts`, `test/sales-chain.e2e-spec.ts`
- Reachability: `test:e2e` script exists in REF `backend/package.json`; e2e DB = compose Postgres started in task-01.
- Oracle: e2e passes with request status `won` and equal line totals; unit spec 409 cases pass.
- Counterexample: order lines referencing live quotation lines (not snapshot) must fail the "edit quotation after order" e2e step.
- Artifacts: e2e data created under a unique test customer code; spec cleans up via soft delete.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
