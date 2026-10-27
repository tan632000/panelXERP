# Task 01 — Storekeeper role, P2 permission matrix and `material` data scope

Status: done

## Outcome
The seed creates the `storekeeper` role and a demo `storekeeper` account, grants every P2 permission per D-08, and the data-scope helpers know the `material` scope (D-09): it reaches every order's material view and no sales-chain record.

## Scope
- In: role `storekeeper` ("Thủ kho", department `warehouse`, `backend/src/kernel/core/users/constants/user-department.constant.ts:11`). Matrix (explicit scopes; `module:*` only where already used in P1):
  - `storekeeper`: `item:read`, `item:stock_settings`, `location:read|create|update|delete`, `stock:availability|read|ledger`, `material:read`, `supplier:read`, `purchase_order:read`, `purchase_request:read|create`, `stock_receipt:read|create`, `stock_issue:read|create`, `stock_return:read|create`, `stocktake:read|create|update|submit|cancel`. Never `reference_price:read`, `purchase_price:read`, `purchase_order:create`, `stocktake:approve` or any sales-chain scope.
  - `purchasing` (keeps `item:*`, which covers `item:stock_settings`): `reference_price:read`, `purchase_price:read`, `location:read`, `supplier:*`, `purchase_request:*`, `purchase_order:read|create|update|submit|cancel|close`, `stock:availability|read|ledger`, `material:read`, `stock_receipt:read`, `stock_issue:read`, `stock_return:read`, `stocktake:read`.
  - `director` (keeps `item:*`): `reference_price:read`, `purchase_price:read`, `supplier:*`, `location:read`, `purchase_request:read`, `purchase_order:*` (incl. `approve`), `stock:availability|read|ledger`, `material:read`, `stock_receipt:read`, `stock_issue:read`, `stock_return:read`, `stocktake:read|approve`.
  - `salesManager`: `reference_price:read`, `purchase_price:read`, `stock:availability|read|ledger`, `material:read`.
  - `sales`: `reference_price:read`, `stock:availability`, `material:read`.
  - `engineeringLead` (keeps `item:*`): `reference_price:read`, `stock:availability`, `material:read`, `purchase_request:read|create`.
  - `engineer`: `reference_price:read`, `stock:availability`, `purchase_request:read|create`.
- Data scope: `ROLE_DATA_SCOPES` (`backend/src/kernel/shared/services/data-scope.service.ts:21-31`) maps `purchasing` and `storekeeper` → new `material`; `canSee` → false for `material`; new `canSeeMaterial(actor, { salesOwnerId })`: `all|material` → true, `ownSales` → owner match, else false; new `materialListCondition(scope, userId)` for SQL lists (`all|material` → none, `ownSales` → own, else match-nothing). `ownerCondition` (`backend/src/plugins/crm/_shared/utils/owner-scope.util.ts:10-22`) and `requestScopeCondition` (`backend/src/plugins/sales/_shared/utils/request-scope.util.ts:8-20`) map `material` to a match-nothing condition (e.g. `In([])`), never to "all".
- PENDING mapping (`seed-roles.panel.spec.ts:29-36`): modules `supplier`→task-02; `location`, `reference_price`, `purchase_price`→task-03; scope `item:stock_settings`→task-03 (PENDING_SCOPES); `stock`→task-05; `purchase_order`→task-07; `material`→task-09; `stock_receipt`→task-11; `stock_issue`, `stock_return`→task-12; `stocktake`→task-14; `purchase_request`→task-15.
- Out: any endpoint; frontend changes beyond role labels.

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `backend/src/kernel/core/database/seeds/seed-users.ts`, `backend/src/kernel/core/database/seeds/seed-roles.panel.spec.ts` (PANEL_ROLES, pending lists), `backend/src/kernel/shared/services/data-scope.service.ts` (+ `.spec.ts`), `backend/src/plugins/crm/_shared/utils/owner-scope.util.ts`, `backend/src/plugins/sales/_shared/utils/request-scope.util.ts`, the customer and request list specs that cover the scope (`backend/src/plugins/crm/customer/`, `backend/src/plugins/sales/request/services/request.service.spec.ts`)
- Create: `backend/src/kernel/core/database/seeds/seed-roles.inventory.spec.ts`
- Read: `backend/src/kernel/core/database/seeds/permission-scope-conversion.ts` (`holds()`)

## Steps
1. Add the grant lists and the `storekeeper` row to `ROLES` (`seed-roles.ts:68-130`) → `seededRoleCodes()` lists 8 roles.
2. Add the demo user `storekeeper` to `DEMO_USER_SPECS` (`seed-users.ts:36-101`).
3. Add `material` to `DataScope`, the role mappings, `canSeeMaterial`, `materialListCondition`; extend both list-condition switches; update the comment at `data-scope.service.ts:26-27`.
4. Fill PENDING_MODULES / PENDING_SCOPES so the stray-scope specs stay green.
5. Specs: `seed-roles.inventory.spec.ts` asserts through `holds()` every grant and refusal above (incl. storekeeper lacks both price permissions, director lacks `purchase_request:create`, no storekeeper `module:*` grant); data-scope spec: `material` `canSee` an owned sales record → false, `canSeeMaterial` any order → true, `sales` other owner → false, `materialListCondition` per scope; customer list and request list as a `material` actor return 0 rows with existing fixtures present.

## Acceptance
- AC-01; AC-03 (scope half; HTTP lists in task-09).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/kernel/core/database/seeds/seed-roles.inventory.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm src/plugins/sales/request" && docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT count(*) || ':' || coalesce(string_agg(code, ','), '') FROM roles WHERE updated_by IS NOT NULL\""`
- Named probe: `src/kernel/core/database/seeds/seed-roles.inventory.spec.ts`, `src/kernel/shared/services/data-scope.service.spec.ts`, the `material` cases in the customer and request list specs.
- Reachability: backend container (P1 task-01); `psql` inside the `postgres` service with its compose env (`compose.yml:7-15`) — the exact psql part of the current Command (count:codes form) was extracted verbatim and run by the controller on 2026-10-27: output `0:`, exit 0.
- Oracle: exit 0; jest 0 failed; the last line prints `0:` (count, colon, comma-separated codes of admin-edited roles — none; controller observed 0 on 2026-10-27). Any other output such as `1:sales` is not a failure of the Command but must be reported in the Receipt with those role codes, since re-seeding keeps those roles' permissions (`seed-roles.ts:226`).
- Counterexample: granting `stocktake:*` or `purchase_order:*` to `storekeeper` must fail the spec via wildcard matching; `ownerCondition` returning `{}` for `material` must fail the customer-list case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/kernel/core/database/seeds/seed-roles.inventory.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm src/plugins/sales/request" && docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT count(*) || ':' || coalesce(string_agg(code, ','), '') FROM roles WHERE updated_by IS NOT NULL\""
Exit: 0
Base: 2951b4a25dc6637c229392539e20f5c6aa827e6e
Head: 6f2ede122fb52286e9262fdc19447974aa0f1f7e18060ee23055afbdf955cc03
```text
$ docker compose exec -T backend sh -c "test -f src/kernel/core/database/seeds/seed-roles.inventory.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm src/plugins/sales/request" && docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT count(*) || ':' || coalesce(string_agg(code, ','), '') FROM roles WHERE updated_by IS NOT NULL\""
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
No migrations are pending
> panelxerp-backend@0.0.1 seed
  - storekeeper: item:stock_settings, location:read, location:create, location:update, location:delete, stock:availability, stock:read, stock:ledger, material:read, supplier:read, purchase_order:read, purchase_request:read, purchase_request:create, stock_receipt:read, stock_receipt:create, stock_issue:read, stock_issue:create, stock_return:read, stock_return:create, stocktake:read, stocktake:create, stocktake:update, stocktake:submit, stocktake:cancel
[seed:users] 0 users created, 10 already existed and were left untouched (domain: example.com)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (9.69 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (9.796 s)
PASS src/plugins/crm/project/project.controller.spec.ts
PASS src/plugins/crm/contact/contact.controller.spec.ts
PASS src/plugins/sales/request/services/request-owner-race.spec.ts
PASS src/plugins/crm/customer/customer.controller.spec.ts
PASS src/plugins/sales/request/services/request.service.spec.ts
PASS src/plugins/crm/customer/services/customer.service.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/crm/contact/services/contact.service.spec.ts
PASS src/plugins/sales/request/request.controller.spec.ts (17.733 s)
PASS src/plugins/crm/project/services/project.service.spec.ts
PASS src/plugins/crm/_shared/gateways/crm-gateway.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/shared/services/data-scope.service.spec.ts
PASS src/plugins/crm/_shared/gateways/reference-check-registry.spec.ts
PASS src/plugins/crm/_shared/gateways/customer-owner-change-registry.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
Test Suites: 19 passed, 19 total
Tests:       331 passed, 331 total
0:
Exit: 0
```
No test in the run above was skipped (the real-Postgres request-owner race ran). The seed's storekeeper line is its warning that these scopes are still pending (no plugin declares them yet, PENDING mapping per Scope); they are stored once tasks 02–15 declare them. The last line `0:` matches the Oracle: no administrator-edited role. Pre-change run: the Command exited 1 at the missing probe `seed-roles.inventory.spec.ts`. Extra evidence (same Head, not the canonical command): full backend jest 96 suites / 1289 passed; implementer's read-only SQL after the first seed: role `storekeeper` exists and one user `storekeeper` is linked to it (demo user created with the shared seed password env, nothing printed). Negative controls by the controller on a disposable copy under the backend container's `/tmp` (outside the bind-mounted repo, deleted afterwards): `ownerCondition` returning `{}` for `material` only → `customer.service.spec.ts` 1 failed ("lists only the caller's customers for Sales and every customer for a manager"); `requestScopeCondition` returning `{}` for `material` → `request.service.spec.ts` 1 failed ("lists only what the actor's scope reaches"). Review (code-auditor): PASS, Low only — traced every consumer of `canSee`/`assertVisible`/`ownerCondition`/`requestScopeCondition`/`scopeOf` (customer, contact, project, request, estimate, quotation, order incl. query-builder `:ownerId` params) and found no path where `material` widens access. Known limitations: `requestScopeCondition` uses the impossible owner id `-1` (`NO_OWNER_ID`) because order and quotation lists bind a scalar parameter, relying on user ids being positive serials (no CHECK constraint); `canSeeMaterial` and `materialListCondition` have no runtime caller until task-09; the "off every sales-chain scope" spec enumerates today's actions, so a future explicitly granted new action is caught only by the no-wildcard spec; no frontend change (no role-label map exists).
