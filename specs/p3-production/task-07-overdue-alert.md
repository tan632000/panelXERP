# Task 07 — Daily overdue alert

Status: done

## Outcome
Every morning (and once at start-up) productionManager and the assignee each get one readable notice per cabinet past its planned end date; the notices clear when the cabinet finishes, the order is cancelled, the date moves or the cabinet is reassigned — also when that races the job.

## Scope
- In: `vnToday(now)` helper (Asia/Ho_Chi_Minh) used by the job and by the planned-date comparisons in task-02's assign path. `OverdueService.run(today)`; `@Cron('0 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` wrapper and one run at `onApplicationBootstrap` (D-12; `ScheduleModule.forRoot()` at `app.module.ts:46`). Per candidate unit one transaction with unit `FOR SHARE` and re-checks, emitting inside it: `production.unit.overdue` (role productionManager) and `production.unit.overdue.assignee` (user assignee), dedupe `unit:<id>` each; a unique violation on a concurrent emit is ignored. Release per D-14 from the finish (task-05), cancel and assign/reassign (task-02) paths. The job logs counts only.
- Out: reminders before the date, escalation.

## Coverage
- CP-07

## Ownership
- Create: `backend/src/plugins/production/progress/services/overdue.service.ts` (+ spec), `overdue.job.ts` (+ spec), `backend/src/plugins/production/_shared/utils/vn-today.util.ts` (+ spec)
- Modify: `backend/src/plugins/production/progress/` finish path, `production-order/` cancel and assign paths (release calls, `vnToday`), notification labels in `frontend/src/kernel/core/hooks/api/useNotifications.ts` (+ `frontend/src/kernel/core/tests/use-notifications.test.ts`)

## Steps
1. Service → real-DB specs (read through each actor's notification list): planned 2026-11-02, `run('2026-11-02')` → none; `run('2026-11-03')` → productionManager and assignee each read one; second run → still one each; finish `finishing` → both released; re-plan to 2026-11-10 → released; reassign A→B → A's released, next run notifies B; cancelled order → none; unassigned unit → only the role notice; a finish committed between the job's candidate query and its per-unit transaction (forced with `queuedBehind` on the unit) → no notice; the same forced race with a re-plan to ≥ today, a production order cancel, and a reassignment → no notice left open for the cleared unit (re-plan, cancel) and the assignee notice addressed to the new assignee only (reassign); assign path at 2026-11-02T23:30Z: re-plan to 2026-11-02 keeps the open notices (Vietnam today is 2026-11-03; a UTC date would release them).
2. Wrapper → specs: at 2026-11-02T23:30Z `vnToday` is `2026-11-03`; bootstrap calls `run` once.

## Acceptance
- AC-10.

## Dependencies
- task-06-photos-issues.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/production/progress/services/overdue.service.spec.ts && test -f src/plugins/production/progress/services/overdue.job.spec.ts && test -f src/plugins/production/_shared/utils/vn-today.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts src/plugins/production"`
- Named probe: `overdue.service.spec.ts` (boundary, audiences, dedupe, release, race), `overdue.job.spec.ts` (bootstrap), `vn-today.util.spec.ts` (time zone), `use-notifications.test.ts` (labels)
- Reachability: known (`use-notifications.test.ts` exists in `frontend/src/kernel/core/tests/`).
- Oracle: exit 0, 0 skipped.
- Counterexample: one record with `roleCodes` + `userIds` must fail the productionManager read; using the container's UTC date must fail the time-zone spec; emitting without the per-unit re-check must fail the race spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/production/progress/services/overdue.service.spec.ts && test -f src/plugins/production/progress/services/overdue.job.spec.ts && test -f src/plugins/production/_shared/utils/vn-today.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts src/plugins/production"
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/production/progress/services/overdue.service.spec.ts && test -f src/plugins/production/progress/services/overdue.job.spec.ts && test -f src/plugins/production/_shared/utils/vn-today.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts src/plugins/production"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
PASS src/plugins/production/progress/unit-photo.controller.spec.ts (19.515 s)
PASS src/plugins/production/progress/services/progress.service.spec.ts (20.107 s)
PASS src/plugins/production/progress/services/unit-photo.service.spec.ts (23.078 s)
PASS src/plugins/production/production-issue/services/production-issue.service.spec.ts (23.136 s)
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (7.365 s)
PASS src/plugins/production/progress/services/progress-race.spec.ts (6.717 s)
PASS src/plugins/production/production-order/services/production-order-race.spec.ts (6.793 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (13.431 s)
PASS src/plugins/production/progress/services/overdue.job.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/production/production-order/services/production-order-shortage.spec.ts (6.594 s)
PASS src/plugins/production/production-order/dto/production-order.dto.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/production/progress/utils/image-type.util.spec.ts
PASS src/plugins/production/_shared/utils/vn-today.util.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (5.13 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (5.25 s)
PASS src/plugins/production/progress/services/overdue.service.spec.ts (35.403 s)
Test Suites: 19 passed, 19 total
Tests:       186 passed, 186 total
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 6123ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/production/production-order/tests/production-order-create.test.tsx (3 tests) 711ms
 ✓ src/plugins/production/progress/tests/unit-photos.test.tsx (12 tests) 478ms
 ✓ src/plugins/production/production-issue/tests/issue-list.test.tsx (7 tests) 1282ms
 ✓ src/kernel/core/tests/use-notifications.test.ts (52 tests) 206ms
 ✓ src/plugins/production/progress/tests/unit-stages.test.tsx (11 tests) 1920ms
 ✓ src/plugins/production/progress/tests/unit-route-access.test.ts (1 test) 50ms
 ✓ src/plugins/production/progress/tests/module-back-link.test.tsx (1 test) 416ms
 ✓ src/plugins/production/production-order/tests/release-error.test.ts (2 tests) 18ms
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (19 tests) 3303ms
 Test Files  9 passed (9)
      Tests  108 passed (108)
```

Notes:

Proof and review:
- One controller run on the final bytes exited 0: backend 183 tests passed, frontend 94 tests passed, 0 skipped.
- Review (code-auditor) returned PASS with 0 Critical, High or Medium findings.
- The review found no wait cycle. The job holds a single unit `FOR SHARE` and never takes the header. Writers take order → header → unit `FOR UPDATE`. Neither the notifications unique index nor `close` inside a writer creates a cycle.

Counterexamples. The implementer mutation-ran each one and then restored the code:
- One record carrying both roleCodes and userIds: 8 tests fail.
- A UTC date in `vnToday`: 6 tests fail.
- Emitting without the per-unit re-check: the finish, re-plan and cancel race tests fail.
- Not counted as a counterexample: the reassign race still passes without the re-check, because the new assignee is correct either way.

Deviations, accepted in review:
- A notice is cleared with `NotificationService.close` (status `resolved`, gone from the recipient's list), not with `releaseDedupeKey` (the record stays open and visible). Only `close` matches the Outcome ("the notices clear") and the "addressed to the new assignee only" specs.
- `clearOverdue` runs inside the writer's transaction, which differs from the D-14 wording "after commit… a failed notice never undoes the commit". The notice cannot outlive the state it reports. A failing `close` would roll back the business change, but it has no lock or unique conflict, so it can only fail when the database itself fails.
- No migration.

Open limitations (Low):
- Pre-existing task-02 defect, outside this Ownership. `production-order.dto.ts` `@IsOptional()` accepts `plannedEndDate: null`. On a released unit this clears the date, breaking the release invariant that every unit has one. It also leaves any open overdue notice uncleared. A follow-up fix is needed: reject null.
- `onApplicationBootstrap` awaits the whole pass, so app start and every e2e boot wait for it. An e2e boot also writes real overdue notices for late units left in the shared test DB.
- Cancel clears notices with 2×N sequential UPDATEs while holding its locks.
- A re-plan to a date still in the past keeps the old `plannedEndDate` in the open notice payload.
- `overdue.job.spec.ts` imports `@nestjs/schedule/dist/schedule.constants`, which is an internal path.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
