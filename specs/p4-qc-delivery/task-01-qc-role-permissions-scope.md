# Task 01 — `qcInspector` role, P4 permission grants and scope

Status: done

## Outcome
The seed creates role `qcInspector` with the D-02 grants and the demo account `qc_a`; the existing roles hold their P4 grants (stored once each module is declared); `qcInspector` reads no sales-chain and no material record.

## Scope
- In: `seed-roles.ts` `ROLES` gains `['QC Inspector', 'qcInspector', …]` after `technician` (`seed-roles.ts:214-223`) and the D-02 grants on productionManager, storekeeper, salesManager, sales (the reads and `acceptance:*` marked (user, Q7) in D-02) (`:79-114,171-213`); `ROLE_DATA_SCOPES.qcInspector = 'material'` and the doc comment of `material` names QC (`data-scope.service.ts:5-21,29-44`); no `switch` over `DataScope` changes (the value already exists). `seed-users.ts`: `qc_a` (`emailLocal: 'qc.a'`, `department: 'qcLab'`, after `technician_b`, `seed-users.ts:126-132`). `seed-roles.panel.spec.ts`: `qcInspector` in `PANEL_ROLES` (`:14-25`) and the scope check; `PENDING_MODULES` (`:32`) lists `qc_checklist → task-02`, `qc_inspection → task-04`, `delivery_note → task-08`, `installation → task-10`, `acceptance → task-11`; exact-grant assertions per D-02.
- Out: P4 endpoints (task-02+); role-matrix doc (task-14).

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `seed-roles.panel.spec.ts`, `seed-users.ts` (+ `seed-users.spec.ts`), `backend/src/kernel/shared/services/data-scope.service.ts` (+ `data-scope.service.spec.ts`)
- Read: `specs/p3-production/task-01-roles-permissions-scope.md` (same pattern), `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts:88-111` (named columns must be seeded; a new role does not break it)

## Steps
1. `data-scope.service.spec.ts`: `scopeOf({role:'qcInspector'})` is `material`; `canSee` false; `canSeeMaterial` true only by scope (no grant reaches it, step 2).
2. Roles and grants → panel spec asserts the exact D-02 sets; qcInspector holds none of `order:read`, `material:read`, `customer:read`, `request:read`, `purchase_price:read`, `reference_price:read`, `production_order:read`; productionManager does not hold `delivery_note:create`; sales does not hold `delivery_note:create`, `installation:manage`.
3. Demo user `qc_a`; `seed-users.spec.ts` covers it.

## Acceptance
- AC-01; AC-11 (sales-chain and material half for qcInspector).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('salesManager','sales','storekeeper','productionManager','qcInspector')\""`
- Named probe: `seed-roles.panel.spec.ts` (`qcInspector` in `PANEL_ROLES`, D-02 grant sets, P4 modules pending), `data-scope.service.spec.ts` (`qcInspector` → `material`, `canSee` false), `seed-users.spec.ts` (`qc_a`)
- Reachability: known (P3 task-01 receipt ran the same form; compose service `postgres` with `POSTGRES_USER/DB`).
- Oracle: exit 0, 0 skipped, psql prints `0:`; any other output → grant manually per D-02 and record it in the receipt.
- Counterexample: mapping `qcInspector` to `all` (or leaving it unmapped, which falls back to `ownSales`, `data-scope.service.ts:46`) must fail the scope spec; granting qcInspector `material:read` must fail the panel spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Execution notes

- Pre-change run (probes written first): exit 1, 17 failed / 75 passed — every failure named the missing `qcInspector` role or `qc_a` account.
- Repair round 1: `seed-roles.inventory.spec.ts` ("gives the storekeeper explicit scopes only, no module or action wildcard") failed on `delivery_note:*`, `installation:*`. D-02's storekeeper grants are written as their explicit D-02 actions (`delivery_note:read|create|ship|receive|cancel`, `installation:read|manage`) — same grant set, P2 invariant kept; the existing spec was not changed.
- `PENDING_MODULES` values name the declaring feature instead of a task number (stable code artifacts rule).
- Reachability: `roles`/`user_roles`/`users` hold `qcInspector|qc_a|qcLab` after the seed. The seed warns about undeclared P4 scopes until their plugin declares them (expected; listed in `PENDING_MODULES`).
- psql printed `0:` — no listed role was edited by an admin; no manual grant needed.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('salesManager','sales','storekeeper','productionManager','qcInspector')\""
Exit: 0
Base: 879dfd382d83963c6668a8c5c9e6e9c5a03a8de0
Head: 1b4d293db21b6cf824815dbc4133378f901943549cd4779380e2999fe3c44ef2
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*)||':'||coalesce(string_agg(code,','),'') from roles where updated_by is not null and code in ('salesManager','sales','storekeeper','productionManager','qcInspector')\""
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/shared/services/data-scope.service.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/role-matrix-doc.spec.ts (17.106 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (17.162 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (17.838 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (30.29 s)
Test Suites: 8 passed, 8 total
Tests:       92 passed, 92 total
0:
EXIT=0
```
