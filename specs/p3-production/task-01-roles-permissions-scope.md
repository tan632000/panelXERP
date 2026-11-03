# Task 01 — Production roles, permission matrix and technician scope

Status: done

## Outcome
The seed creates roles `productionManager` and `technician` with the D-08 grants, demo accounts exist, productionManager and technician see no sales-chain record, and technicians see no material record.

## Scope
- In: roles per D-07/D-08 in `seed-roles.ts` (`ROLES`, after `storekeeper`); `ROLE_DATA_SCOPES` adds `productionManager: 'material'`, `technician: 'assignedTechnician'`; `DataScope` gains `assignedTechnician`. Every switch over `DataScope` gets an explicit branch (R-07): `owner-scope.util.ts:14-20` and `request-scope.util.ts:15-22` match nothing (as `material`); `materialListCondition` (`data-scope.service.ts:57-70`) → `{ salesOwnerId: NO_OWNER_ID }`; `canSee` and `canSeeMaterial` (`:81-111`) → false. Demo users `production_manager`, `technician_a`, `technician_b` in `seed-users.ts` (as `storekeeper`, `seed-users.ts:102-105`). `seed-roles.panel.spec.ts`: add both roles to `PANEL_ROLES` (`:14-23`) and the scope check (`:229`); production modules not declared yet go into `PENDING_MODULES` / `PENDING_SCOPES` (`:30-37`), removed by tasks 02, 05, 06. No frontend role-label map exists (P2 task-01 receipt), so no frontend change.
- Out: production endpoints (task-02+).

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `seed-roles.panel.spec.ts`, `seed-users.ts` (+ spec), `backend/src/kernel/shared/services/data-scope.service.ts` (+ spec), `backend/src/plugins/crm/_shared/utils/owner-scope.util.ts`, `backend/src/plugins/sales/_shared/utils/request-scope.util.ts`
- Create: `backend/src/plugins/crm/_shared/utils/owner-scope.util.spec.ts`, `backend/src/plugins/sales/_shared/utils/request-scope.util.spec.ts`
- Read: `specs/p2-purchasing-warehouse/task-01-roles-permissions-scope.md` (same pattern)

## Steps
1. Scope value and all five branches → specs: `assignedTechnician` conditions return 0 rows on customers, requests, quotations, orders and the material list; `canSee`/`canSeeMaterial` false.
2. Roles and grants (D-08) → panel spec asserts the exact grant sets; technician has no `material:read`, `order:read`; productionManager has no `order:read`, `purchase_price:read`, `reference_price:read`.
3. Demo users; panel spec `PANEL_ROLES` and scope list updated.

## Acceptance
- AC-01; AC-07 (sales-chain and material half).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/crm/_shared/utils/owner-scope.util.spec.ts && test -f src/plugins/sales/_shared/utils/request-scope.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm/_shared/utils src/plugins/sales/_shared/utils src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('director','salesManager','sales','productionManager','technician')\""`
- Named probe: `seed-roles.panel.spec.ts` (production grant sets, `PANEL_ROLES`), `data-scope.service.spec.ts` (`assignedTechnician` in `materialListCondition`, `canSee`, `canSeeMaterial`), `owner-scope.util.spec.ts`, `request-scope.util.spec.ts` (0-row conditions)
- Reachability: known (`roles.code` exists, `kernel/core/database/migrations/1784005029001-init-core.ts:36`; compose service `postgres` with `POSTGRES_USER/DB`).
- Oracle: exit 0, 0 skipped, psql prints `0:`; any other output → grant manually per D-08 and record it in the receipt.
- Counterexample: folding `assignedTechnician` into `case 'material'` in `materialListCondition` (→ `{}`) must fail the 0-row material spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/crm/_shared/utils/owner-scope.util.spec.ts && test -f src/plugins/sales/_shared/utils/request-scope.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm/_shared/utils src/plugins/sales/_shared/utils src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('director','salesManager','sales','productionManager','technician')\""
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/crm/_shared/utils/owner-scope.util.spec.ts && test -f src/plugins/sales/_shared/utils/request-scope.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/plugins/crm/_shared/utils src/plugins/sales/_shared/utils src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('director','salesManager','sales','productionManager','technician')\""
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts
PASS src/kernel/shared/services/data-scope.service.spec.ts
PASS src/plugins/crm/_shared/utils/owner-scope.util.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/sales/_shared/utils/request-scope.util.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (13.89 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (13.986 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (14.837 s)
Test Suites: 10 passed, 10 total
Tests:       96 passed, 96 total
0:
```

Notes: run 1 failed at lint (prettier, `data-scope.service.ts` union layout) → `prettier --write` → run 2 above (exit 0 for both parts, 96 passed, 0 skipped). The seed warns about undeclared `production_*` scopes by design: their modules sit in `PENDING_MODULES` until tasks 02, 05, 06 declare them, so only `material:read` and `stock:availability` are stored for productionManager until then. Review (code-auditor): PASS, 0 Critical/High/Medium; Low: pending entries name tasks (existing convention), scope specs assert the match-nothing condition value rather than running a query (same value `material` already uses). Demo departments: `planning` (production manager), `technical` (technicians) — no `production` department exists. The material-fold counterexample was not run as a mutation; the spec asserts `{ salesOwnerId: NO_OWNER_ID }`, which `{}` cannot equal.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
