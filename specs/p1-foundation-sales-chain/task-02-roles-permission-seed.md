# Task 02 — Panel-shop roles with department permissions

Status: blocked
Blocked by: Q3 (role list and data visibility of Sales) in plan.md — GATE-REVIEW.

## Outcome
The seed creates the panel-shop roles; each later P1 feature registers its permission constants into these roles, and an actor without a permission gets 403.

## Scope
- In: role definitions per Q3; permission-to-role mapping table for P1 features (crm, catalog, request, estimate, quotation, order, quotation approval); `seed-users.ts` creates one demo user per role (dev only).
- Out: warehouse/production/accounting roles (added in P2–P5); permission admin UI changes.

## Coverage
- CP-02

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `backend/src/kernel/core/database/seeds/seed-users.ts`
- Create: `backend/src/kernel/core/database/seeds/seed-roles.panel.spec.ts`
- Read: `REF/backend/src/kernel/core/database/seeds/seed-roles.ts`, `REF/docs/permission/permission-convention.md`

## Steps
1. Define roles per Q3 answer; keep `admin` from task-01.
2. Write the mapping as data (role → permission keys) so tasks 03–08 only append keys.
3. Spec asserts: every role exists, `admin` has every permission, `Sales` lacks `quotation.approve`, `Engineer` lacks `order.create`.

## Acceptance
- AC-03: spec proves the role matrix; one controller guard spec in task-03 proves 403 at runtime.

## Dependencies
- task-01-bootstrap-from-kernel.md

## Verification Plan
- Command: `docker compose exec -T backend npx jest --ci src/kernel/core/database/seeds/seed-roles.panel.spec.ts`
- Named probe: `seed-roles.panel.spec.ts`
- Reachability: known after task-01.
- Oracle: jest reports ≥ 4 passed, 0 failed.
- Counterexample: granting `quotation.approve` to `Sales` must fail the spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
