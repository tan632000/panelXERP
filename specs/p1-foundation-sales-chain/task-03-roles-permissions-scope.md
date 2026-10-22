# Task 03 — Panel-shop roles, `module:action` permissions and data-scope helper

Status: pending

## Outcome
The seed creates the panel-shop roles; later tasks append `module:action` keys to a role→permission map; a reusable kernel helper enforces the D-12 data scope.

## Scope
- In: roles `admin`, `director`, `salesManager`, `sales`, `engineeringLead`, `engineer`, `purchasing` (D-12). Role→permission map as data. Kernel helper `DataScopeService` resolving the current actor's scope (`all` | `ownSales` | `assignedEngineer`) from role, used by tasks 04–11 to filter queries (out-of-scope id → 404). Demo user per role in non-production seed.
- Out: permission admin UI changes; warehouse/production/accounting roles (P2–P5).

## Coverage
- CP-03

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `backend/src/kernel/core/database/seeds/seed-users.ts`
- Create: `backend/src/kernel/core/database/seeds/seed-roles.panel.spec.ts`, `backend/src/kernel/shared/services/data-scope.service.ts`, `backend/src/kernel/shared/services/data-scope.service.spec.ts`
- Read: `REF/docs/permission/permission-convention.md:25`, `REF/backend/src/kernel/core/database/seeds/permission-scope-conversion.ts:13-22` (`holds()` and wildcard)

## Steps
1. Define roles + map; keys follow `module:action` (e.g. `quotation:approve`).
2. Implement `DataScopeService` reading the actor from the request context store.
3. Kernel file routes (`REF/backend/src/kernel/core/files/files.controller.ts`: `POST /files/upload`, `GET /files/:id`) sign any S3 key: grant `file:*` to `admin` only; business attachments go through feature endpoints (task-07).
4. Spec asserts via `holds()` (incl. wildcard): `sales` does not hold `quotation:approve`; `engineer` does not hold `order:create`; no non-admin role holds `file:read` or `file:write` (kernel keys per `REF/backend/src/kernel/core/files/permissions/file.permissions.ts`); `admin` holds all; scope per role matches D-12.

## Acceptance
- AC-04 (matrix half): specs above pass; the 403/404 runtime half is proven in task-04.

## Dependencies
- task-02-frontend-shell.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/kernel/core/database/seeds/seed-roles.panel.spec.ts src/kernel/shared/services/data-scope.service.spec.ts"`
- Named probe: `seed-roles.panel.spec.ts`, `data-scope.service.spec.ts`
- Reachability: known after task-01.
- Oracle: jest ≥ 7 passed, 0 failed.
- Counterexample: a `*:approve` grant to `sales` must fail the spec through wildcard matching.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
