# Task 03 — Production unit port and guard registry

Status: done

## Outcome
Production exposes, through its `_shared` module, a port that locks and lists cabinets with their `finishing` status, and a guard registry that lets another plugin veto a `finishing` undo or a production order cancel inside production's own transaction; P3 behaviour is unchanged while no guard is registered.

## Scope
- In (D-06, D-07): `backend/src/plugins/production/_shared/production-shared.module.ts` providing and exporting `ProductionUnitPort` and `ProductionGuardRegistry` (one instance, imported by `ProductionOrderModule`, `ProgressModule` and later by delivery). `_shared/ports/production-unit.port.ts`: `lockUnit(manager, unitId)`, `lockOrderUnits(manager, orderId)` (header → units ascending, same SQL order as `production-order/utils/production-order-lock.util.ts:92-111`), (R-13) `listUnits(manager, { orderScope: (column) => ScopeCondition, orderId?, finishingDone? })` read-only, all matching rows, unpaginated, ordered by production order id then unit id. `_shared/ports/production-guard.registry.ts`: `register(name, {beforeFinishingUndo?, beforeCancel?})` (second registration under one name throws, as `sales/_shared/ports/order-lifecycle-registry.ts:52-58`), `beforeFinishingUndo(manager, unitId)`, `beforeCancel(manager, productionOrderId)` running every registered guard in registration order. `progress.service.ts`: in the `undo` branch for stage `finishing`, after `lockUnitForWork` and the next-stage check (`progress.service.ts:78-84,139-151`), call `beforeFinishingUndo`. `production-order-release.service.ts`: in `cancel`, after its locks and status check (`:116-133`), call `beforeCancel`. (R-05) `production-order/production-db.helper-spec.ts:198-228` provides a real `ProductionGuardRegistry` (and `ProductionUnitPort`) instead of leaving them out, so guard specs register through `app.get(ProductionGuardRegistry)`.
- Out: the guards themselves (task-04 QC guards; task-08 delivery-note guard).

## Coverage
- CP-03

## Ownership
- Create: `backend/src/plugins/production/_shared/production-shared.module.ts`, `_shared/ports/production-unit.port.ts` + `production-unit.port.spec.ts`, `_shared/ports/production-guard.registry.ts` + `production-guard.registry.spec.ts`
- Modify: `backend/src/plugins/production/progress/services/progress.service.ts` (+ `progress.service.spec.ts`), `backend/src/plugins/production/production-order/services/production-order-release.service.ts` (+ `production-order.service.spec.ts`), `production-order.module.ts`, `progress/progress.module.ts`, `backend/src/plugins/production/production-order/production-db.helper-spec.ts` (also used by `progress/progress-db.helper-spec.ts:5-9`, so one change covers both)
- Read: `backend/src/plugins/sales/_shared/ports/order-lifecycle-registry.ts`, `backend/src/plugins/sales/_shared/sales-shared.module.ts` (module pattern), `production-order/utils/production-scope.util.ts:15-37` (`ScopeCondition`)

## Steps
1. Port → `production-unit.port.spec.ts` (real Postgres): `lockOrderUnits` ignores a cancelled production order and returns units ascending with `finishingDone`; `lockUnit` of a unit of a cancelled production order still returns it with status `cancelled`; `listUnits` with `orderScope` returning `FALSE` returns none, with `orderId` only that order's units, with `finishingDone: true` only finished units, and never pages.
2. Registry → `production-guard.registry.spec.ts`: duplicate name throws; guards run in registration order; no guard → resolves.
3. Wiring → `progress.service.spec.ts`: a guard registered via `app.get(ProductionGuardRegistry)` that throws 409 makes `POST /production/units/:id/stages/finishing/undo` answer 409 and leaves the stage `done`; the guard is not called for an undo of another stage. `production-order.service.spec.ts`: a throwing `beforeCancel` leaves the production order and the sales order statuses unchanged; with no guard both behave as in P3.

## Acceptance
- AC-05 (production half: a registered veto stops undo and cancel).

## Dependencies
- task-02-delivery-plugin-checklist.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/production/_shared/ports/production-unit.port.spec.ts && test -f src/plugins/production/_shared/ports/production-guard.registry.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- production-chain"`
- Named probe: `production-unit.port.spec.ts`, `production-guard.registry.spec.ts`, `progress.service.spec.ts` (finishing-undo veto), `production-order.service.spec.ts` (cancel veto); P3 regression: the whole `src/plugins/production` jest folder and `production-chain.e2e-spec.ts`
- Reachability: known (P3 task-08 receipt: `test:e2e` takes positional patterns; production specs build their app in `production-db.helper-spec.ts`).
- Oracle: exit 0, 0 skipped.
- Counterexample: calling the guard before `lockUnitForWork` (outside the locks) or not calling it at all must fail the undo-veto spec; a registry provided per module (two instances) must fail the `app.get` registration case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/production/_shared/ports/production-unit.port.spec.ts && test -f src/plugins/production/_shared/ports/production-guard.registry.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- production-chain"
Exit: 0
Base: 879dfd382d83963c6668a8c5c9e6e9c5a03a8de0
Head: 9d6f221407142b17336cd2ce1b0e8acd3f93a5b924a414620e7be0d4258475b1
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/production/_shared/ports/production-unit.port.spec.ts && test -f src/plugins/production/_shared/ports/production-guard.registry.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- production-chain"
PASS src/plugins/production/_shared/ports/production-guard.registry.spec.ts (5.939 s)
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (23.658 s)
PASS src/plugins/production/_shared/ports/production-unit.port.spec.ts (26.188 s)
PASS src/plugins/production/progress/services/progress.service.spec.ts (10.194 s)
PASS src/plugins/production/production-order/services/production-order-race.spec.ts (9.9 s)
PASS src/plugins/production/progress/services/progress-race.spec.ts (7.052 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (16.56 s)
Test Suites: 23 passed, 23 total
Tests:       225 passed, 225 total
PASS test/production-chain.e2e-spec.ts (70.932 s)
  Production chain (e2e)
    ✓ builds two cabinets from an order and takes them from assignment to completion (5115 ms)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
EXIT=0
```
