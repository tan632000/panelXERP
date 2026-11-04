# Task 01 — Backend correctness fixes

Status: done

## Outcome
A unit assignment re-checks the technician role under row locks, the app listens before the overdue bootstrap run ends and waits for it on shutdown, a photo `issueId` with issues disabled answers 400, and an invalid `assigneeId` answers one message.

## Scope
- In:
  - `production-order-unit.service.ts`: keep the pre-check for the early 400; after the unit lock, re-check with `manager.query` on users/user_roles/roles using `FOR SHARE OF` the user and user-role rows, so a concurrent role change or deactivation waits for the assignment (not through `SalesUserLookup`).
  - `overdue.job.ts` (D-03): `onApplicationBootstrap` starts `runToday()` without returning it, keeps the promise, and `beforeApplicationShutdown` awaits it.
  - `unit-photo.service.ts`: before the upload, when `dto.issueId` is sent and the `production-issue` feature is not enabled, answer 400 `Issue reports are not enabled.`. Decide enabled-ness with the catalog/env helper `isFeatureKeyEnabled` (`backend/src/kernel/platform/features/feature-module.utils.ts:80-90`, the same catalog rule that `enabled-features.ts:32-46,56` uses to register the feature migrations), never `FeatureFlagService` (its env fallback is false when `ENABLED_FEATURES` is unset, `feature-flag.service.ts:130-137`). Avoid the import cycle `production.features.ts:6` → `ProgressModule`: pass the catalog or the key through a constant, not by importing `production.features.ts` into the service.
  - `UpdateProductionUnitDto.assigneeId`: replace `IsInt`/`Min`/`Max` with one custom id validator carrying the single message `Assignee must be a user id.` (`stopAtFirstError` is a global option and is not used).
- Out: photo/issue rules after completion (stays 409); any change to `SalesUserLookup` or `CreateProductionOrderDto.orderId`.

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/plugins/production/production-order/services/production-order-unit.service.ts`, `backend/src/plugins/production/progress/services/overdue.job.ts`, `backend/src/plugins/production/progress/services/unit-photo.service.ts`, `backend/src/plugins/production/production-order/dto/production-order.dto.ts`
- Modify (specs): `production-order-race.spec.ts`, `overdue.job.spec.ts`, `unit-photo.service.spec.ts`, `production-order.dto.spec.ts`
- Read: `backend/src/kernel/platform/features/feature-module.utils.ts`, `resolve-enabled-features.ts:12-20`, `backend/test/production-chain.e2e-spec.ts:225-240,628-641`

## Steps
1. Race spec A: the role is removed between the pre-check and the re-check → 400, `assignee_id` unchanged.
2. Race spec B: a transaction holding the user's role row (`SELECT ... FOR UPDATE`) and then removing the role → the assignment waits (`queuedBehind`) and then answers 400.
3. Job spec: `onApplicationBootstrap` returns before a `runToday` that has not resolved; `beforeApplicationShutdown` resolves only after it; a rejecting run is caught and logged.
4. Photo spec: with the feature catalog lacking `production-issue`, `issueId` → 400 with the message above, no object stored; with it enabled the existing other-unit case still answers `The issue does not belong to this cabinet.`.
5. DTO spec: `assigneeId: "abc"`, `0`, `2147483648` → exactly one message each.

## Acceptance
- AC-01, AC-02, AC-03, AC-04.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production/production-order src/plugins/production/progress && npm run test:e2e -- production-chain"`
- Named probe: `production-order-race.spec.ts` (role removed mid-assign; role change waits), `overdue.job.spec.ts` (bootstrap does not wait; shutdown waits), `unit-photo.service.spec.ts` (issues disabled), `production-order.dto.spec.ts` (one message), `production-chain.e2e-spec.ts` (no log after close).
- Reachability: known — specs run in the backend container against its Postgres.
- Oracle: exit 0, 0 skipped, no "Cannot log after tests are done" in the output.
- Counterexample: a plain SELECT re-check must fail race spec B; returning the run's promise must fail the job spec; omitting the feature check must fail the photo spec with the other-unit message instead of `Issue reports are not enabled.`.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production/production-order src/plugins/production/progress && npm run test:e2e -- production-chain"
Exit: 0
Base: 0559f7873dcc595a76f11f43ca301522728150d6
Head: ebe24559b0b32e245df5e14844c5e678115f4331ce3be355ec9289dab5b6b663
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production/production-order src/plugins/production/progress && npm run test:e2e -- production-chain"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts
Test Suites: 11 passed, 11 total
Tests:       104 passed, 104 total
> panelxerp-backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json production-chain
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
VERIFY_EXIT=0
```

Pre-change run (tests first, as agreed): the same Command exited 1 on the new and adapted cases only (8 failing tests: overdue start-up and shutdown, two role race cases, issues-disabled photo, one-message assignee). Mutations: a plain SELECT re-check fails the role-change wait case; returning the start-up promise fails the listen-first case; dropping the feature check fails the issues-disabled case. Review: PASS (code-auditor); its Low on `deleted_at` was applied and this run is after that change.

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
