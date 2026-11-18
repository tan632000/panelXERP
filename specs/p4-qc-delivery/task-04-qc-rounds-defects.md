# Task 04 — QC rounds per cabinet, defects, QC guards and QC notices

Status: done

## Outcome
A qcInspector or productionManager records a QC round on a finished cabinet from a snapshot of the active checklist; a failed round opens defects and tells productionManager; productionManager marks defects fixed and another user verifies them; a passed round tells storekeeper; production can no longer undo `finishing` of, or cancel the production order of, an inspected cabinet.

## Scope
- In (feature `qc-inspection`, D-05): tables `qc_rounds`, `qc_round_items`, `qc_defects` (description, status, `fixed_by/at`, fix note, `verified_by/at`); permissions `qc_inspection:read|create|fix|verify`. Scope util `backend/src/plugins/delivery/_shared/utils/delivery-scope.util.ts` (D-03: `all|material` → `TRUE`, `ownSales` → `OrderProductionPort.ownerScopeCondition`, others → `FALSE`). Endpoints: `GET /delivery/qc/units?qcStatus=&orderId=&page=&limit=` (unit code, tag, production order code, order code, customer name, derived QC status; built from `ProductionUnitPort.listUnits` with the scope condition, QC status from delivery's tables, paginated by delivery, R-13); `GET /delivery/qc/units/:unitId` (rounds with items, defects); `POST /delivery/qc/units/:unitId/rounds` `{results: [{checklistItemId, result: 'pass'|'fail'|'na', note?}]}` (`create`): `ProductionUnitPort.lockUnit` → scope (404) → D-05 checks → active template items read in the same transaction, (R-11) no template lock → rows; `GET /delivery/qc/defects?status=&unitId=&page=&limit=` (`read`); `POST /delivery/qc/defects/:id/fix` `{note}` (`fix`; `open → fixed`, else 409); `POST /delivery/qc/defects/:id/verify` (`verify`; `fixed → verified`, else 409; (user, Q8) actor = `fixed_by` → 409) — defect writes take `lockUnit` first, then scope. Guards registered on `ProductionGuardRegistry` at module init (D-06): (user, Q1) `beforeFinishingUndo` → 409 when the unit has a QC round; (user, Q2) `beforeCancel` → 409 when any unit of the production order has a QC round. Notices D-13 `qc.unit.failed` (role productionManager, link `/delivery/qc/units/<unitId>`) and `qc.unit.passed` (role storekeeper), after commit. `seed-roles.panel.spec.ts`: remove `qc_inspection` from `PENDING_MODULES`.
- Out: photos and the shared file util (task-05); QC screens (task-06); editing or deleting rounds.

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/delivery/_shared/utils/delivery-scope.util.ts` + `delivery-scope.util.spec.ts`, `backend/src/plugins/delivery/qc-inspection/**` (migration, entities, dto, permissions, `services/qc-inspection.service.ts` + `qc-inspection.service.spec.ts`, `services/qc-defect.service.ts` + `qc-defect.service.spec.ts`, `services/qc-race.spec.ts`, `services/qc-notifier.service.ts`, `services/qc-guards.ts`, controller, `qc-inspection.module.ts`, `qc-db.helper-spec.ts`)
- Modify: `backend/src/plugins/delivery/delivery.features.ts`, `delivery.module.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/production/_shared/ports/*` (task-03), `backend/src/plugins/production/production-order/production-db.helper-spec.ts` (app builder to extend), `kernel/shared/testing/queued-behind.helper-spec.ts`

## Steps
1. Scope util → `delivery-scope.util.spec.ts`: the five scopes map to `TRUE`, owner condition, `FALSE`.
2. Rounds → `qc-inspection.service.spec.ts` (real Postgres): unit whose `finishing` is `in_progress` → 409; unit of a cancelled production order → 409; every item hidden → 409 (R-04); results missing one active item or naming a hidden item → 409; all `pass|na` → round `passed`, unit `passed`, storekeeper reads `qc.unit.passed` through the notification list; one `fail` → round `failed`, unit `failed`, productionManager reads `qc.unit.failed`, storekeeper does not; template rename after the round leaves the round's item names unchanged; (user, Q3) `fail` without note → 400, one defect per `fail`, new round with an unverified defect → 409, round after `passed` → 409; (R-02) sales_b reading sales_a's unit or its defects → 404, sales_a → 200 (no `ownSales` role holds a QC write grant, D-02); technician → 403; `expectNoMoneyKeys` over every read; list paging returns the requested page and a total.
3. Defects → `qc-defect.service.spec.ts`: storekeeper fix → 403; verify `open` → 409; (user, Q8) productionManager fixes then verifies → 409, qc_a verifies → 200; productionManager fixes, admin verifies → 200.
4. Guards (through production endpoints, `app.get(ProductionGuardRegistry)`): (user, Q1) finishing undo of an inspected unit → 409, stage stays `done`; undo of a finished, un-inspected unit → 2xx; (user, Q2) cancel of a production order with one inspected unit → 409, both statuses unchanged.
5. Races → `qc-race.spec.ts` (`queuedBehind`, holder holds the production header row): two rounds on one waiting unit → the second sees the first's committed round and obeys D-05; (R-10) contender 1 finishing undo, contender 2 round → undo 2xx, round 409 `not_ready`, zero `qc_rounds` rows for the unit; contender 1 round, contender 2 finishing undo → round 201, undo 409.
6. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-03, AC-04; AC-05 (QC guards); AC-11 (QC reads and writes).

## Dependencies
- task-03-production-unit-port-guards.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/_shared/utils/delivery-scope.util.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-inspection.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-defect.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `delivery-scope.util.spec.ts`, `qc-inspection.service.spec.ts` (snapshot, no active item, Q3, notices, scope, money keys), `qc-defect.service.spec.ts` (Q8), `qc-race.spec.ts` (round ∥ round, undo → round, round → undo); P3 regression `src/plugins/production`
- Reachability: known (real Postgres specs as P3; production app builder from task-03).
- Oracle: exit 0, 0 skipped.
- Counterexample: checking `finishingDone` before `lockUnit` must fail the undo → round race (a round row would exist); a verify that ignores `fixed_by` must fail the Q8 case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/delivery/_shared/utils/delivery-scope.util.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-inspection.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-defect.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 879dfd382d83963c6668a8c5c9e6e9c5a03a8de0
Head: 6850371a83c86f6ff6a24bb6274d7c1e9bd81bba3858d860852004e68b079539
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/delivery/_shared/utils/delivery-scope.util.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-inspection.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-defect.service.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
PASS src/plugins/delivery/qc-inspection/services/qc-race.spec.ts (22.292 s)
PASS src/plugins/delivery/qc-inspection/services/qc-inspection.service.spec.ts (25.343 s)
PASS src/plugins/delivery/qc-inspection/services/qc-defect.service.spec.ts (40.256 s)
PASS src/plugins/delivery/_shared/utils/delivery-scope.util.spec.ts
PASS src/plugins/delivery/qc-checklist/services/qc-checklist.service.spec.ts (30.375 s)
PASS src/plugins/production/_shared/ports/production-unit.port.spec.ts (29.964 s)
PASS src/plugins/production/_shared/ports/production-guard.registry.spec.ts
PASS src/plugins/production/progress/services/progress.service.spec.ts (10.997 s)
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (11.313 s)
Test Suites: 29 passed, 29 total
Tests:       267 passed, 267 total
Migration filename check passed (50 files).
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 37ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```
Counterexamples (run once against a temporary mutation, then the mutation was reverted before the final Command above): with the `fixed_by` check disabled, `qc-defect.service.spec.ts` failed 1 test ("refuses to verify an open defect, and a verification by the one who fixed it"); with `finishingDone` read before `lockUnit`, `qc-race.spec.ts` failed 1 test ("undo first, round second").
Deviations from Ownership: `production/_shared/finished-unit-kit.helper-spec.ts` (new, cross-plugin test entry; lint exempts `*.spec.ts` but not `*.helper-spec.ts`), `ProductionUnitPort.listUnits` gained a `unitId` filter, `qc-checklist.service.spec.ts` (task 02) `afterEach` now deletes under the template lock (user-approved), `production-db.helper-spec.ts` gained the `qcInspector` actor.
