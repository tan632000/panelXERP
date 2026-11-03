# Task 06 — Photos per cabinet and stage; production issues

Status: done

## Outcome
Technicians attach PNG/JPEG photos to a cabinet's stage and open issues; productionManager reads the notice and resolves them; nothing blocks a stage.

## Scope
- In: photos (D-10): `POST /production/units/:id/photos` (multipart `file`, `stage`, optional `issueId`; `production_progress:update`; current assignee or productionManager re-checked under D-05 locks), `GET /production/units/:id/photos`, `GET /production/photos/:photoId/content` (stored content type, `nosniff`, unit scope check; no storage key in any response). Issues (D-11): feature `production-issue`, table `production_issues` (unit, stage, description ≤ 2000, severity, status, `reported_by`, `resolved_by/at`, `resolution`); `POST /production/units/:id/issues` (`production_issue:create`), `GET /production/issues?status=&productionOrderId=` (D-07 in SQL), `POST /production/issues/:id/resolve` `{resolution}` (`production_issue:resolve`; already resolved → 409). Notices D-14. Frontend: per-stage gallery and upload on the unit page; issue list, form, resolve dialog.
- Out: deleting photos, video.

## Coverage
- CP-06

## Ownership
- Create: `backend/src/plugins/production/production-issue/`, photo files in `backend/src/plugins/production/progress/` (`unit-photo.entity.ts`, service, controller, `image-type.util.ts`, filename sanitiser + specs), `frontend/src/plugins/production/production-issue/`, photo components in `frontend/src/plugins/production/progress/`
- Modify: `production.features.ts` (backend + frontend), `seed-roles.panel.spec.ts` (PENDING), notification labels `frontend/src/kernel/core/hooks/api/useNotifications.ts` (+ `frontend/src/kernel/core/tests/use-notifications.test.ts`), vi/en labels
- Read: `backend/src/plugins/sales/request/request-attachment.controller.ts:61-101`, `services/request-attachment.service.ts:109-134,268-290` (pattern), `request-attachment.service.spec.ts` (storage fake)

## Steps
1. Image util + photo service → specs: a PDF renamed `.png` → 400; a JPEG renamed `.png` → 400; 10 MB + 1 byte → 413; 31st photo → 400; two uploads at 29 photos, the second queued behind the first (`queuedBehind`) → one 2xx, one 400; storage failure after upload → the object delete is called and no row remains; `issueId` of another unit → 400; content response has the stored type and `nosniff`; technician_b reading technician_a's photo → 404; sales of the order 200; no `key`/`storageKey` field in responses; the key passed to the storage fake matches `^production/<unitId>/[0-9a-f-]{36}\.(png|jpg)$` and never contains the uploaded filename.
2. Issues → specs: open → `production.issue.opened` readable by productionManager through the notification list; technician resolve → 403; resolve twice → 409; stage finish with an open issue → 2xx; money-key helper.
3. Frontend + labels + OpenAPI + `api.ts`.

## Acceptance
- AC-07 (photo/issue reads), AC-08, AC-09, AC-11.

## Dependencies
- task-05-stage-tracking.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/production/progress/utils/image-type.util.spec.ts && test -f src/plugins/production/progress/services/unit-photo.service.spec.ts && test -f src/plugins/production/progress/unit-photo.controller.spec.ts && test -f src/plugins/production/production-issue/services/production-issue.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/production/production-issue/tests/issue-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `image-type.util.spec.ts`, `unit-photo.service.spec.ts`, `unit-photo.controller.spec.ts` (413, headers), `production-issue.service.spec.ts`, frontend `issue-list.test.tsx`
- Reachability: known (storage fake as in `request-attachment.service.spec.ts`).
- Oracle: exit 0, 0 skipped.
- Counterexample: checking only the extension must fail the renamed-PDF spec; counting before taking the locks must fail the concurrent-29 spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/production/progress/utils/image-type.util.spec.ts && test -f src/plugins/production/progress/services/unit-photo.service.spec.ts && test -f src/plugins/production/progress/unit-photo.controller.spec.ts && test -f src/plugins/production/production-issue/services/production-issue.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/production/production-issue/tests/issue-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/production/progress/utils/image-type.util.spec.ts && test -f src/plugins/production/progress/services/unit-photo.service.spec.ts && test -f src/plugins/production/progress/unit-photo.controller.spec.ts && test -f src/plugins/production/production-issue/services/production-issue.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/production/production-issue/tests/issue-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
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
PASS src/plugins/production/progress/services/progress.service.spec.ts (18.008 s)
PASS src/plugins/production/progress/services/overdue.service.spec.ts (20.777 s)
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (8.342 s)
PASS src/plugins/production/production-issue/services/production-issue.service.spec.ts (29.389 s)
PASS src/plugins/production/progress/services/unit-photo.service.spec.ts (29.34 s)
PASS src/plugins/production/progress/unit-photo.controller.spec.ts (30.479 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (15.865 s)
PASS src/plugins/production/production-order/services/production-order-shortage.spec.ts (6.913 s)
PASS src/plugins/production/production-order/services/production-order-race.spec.ts (7.527 s)
PASS src/plugins/production/progress/services/progress-race.spec.ts (7.378 s)
PASS src/plugins/production/progress/services/overdue.job.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/production/production-order/dto/production-order.dto.spec.ts
PASS src/plugins/production/progress/utils/image-type.util.spec.ts
PASS src/plugins/production/_shared/utils/vn-today.util.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (6.594 s)
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (6.559 s)
Test Suites: 19 passed, 19 total
Tests:       186 passed, 186 total
> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 5959ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/production/production-order/tests/production-order-create.test.tsx (3 tests) 899ms
 ✓ src/plugins/production/progress/tests/unit-photos.test.tsx (12 tests) 789ms
 ✓ src/plugins/production/production-issue/tests/issue-list.test.tsx (7 tests) 1405ms
 ✓ src/plugins/production/progress/tests/unit-stages.test.tsx (11 tests) 1963ms
 ✓ src/plugins/production/progress/tests/module-back-link.test.tsx (1 test) 445ms
 ✓ src/kernel/core/tests/use-notifications.test.ts (52 tests) 160ms
 ✓ src/plugins/production/progress/tests/unit-route-access.test.ts (1 test) 28ms
 ✓ src/plugins/production/production-order/tests/release-error.test.ts (2 tests) 19ms
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (19 tests) 3389ms
 Test Files  9 passed (9)
      Tests  108 passed (108)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 14ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Notes:

Proof run:
- One controller run exited 0 with 0 skipped. The seed no longer warns about undeclared scopes.
- That run started on the implementer's code. While backend jest was still running, the controller applied the two review fixes below. They were frontend-only (latest edit 11:08; the log ends 11:17).
- The frontend half therefore ran on the final bytes: `unit-stages.test.tsx` shows 9 tests, including the 2 added by the fix. The backend files are unchanged since the run started.

Review:
- The first review was FAIL, with two Medium findings, both fixed by the controller.
- Blocking Medium: `UnitIssuesSection` queried `/production/issues` for users without `production_issue:read`. Sales got a 403 and a false "no issues" message. Now:
  - The section renders only with `production_issue:read` and the `production-issue` feature enabled.
  - The `UnitPhotos` open-issue picker also checks the feature.
  - Two new tests in `unit-stages.test.tsx` cover this.
- Non-blocking Medium: photo object URLs were cached forever and never revoked. Now:
  - The cache keeps the Blob, with the default gcTime.
  - `UnitPhotoThumb` creates the URL in an effect, passes it to the image through a ref, and revokes it on cleanup.
- Re-review: PASS.

Counterexamples (the implementer mutation-ran both, then restored the code):
- Checking only the extension fails the renamed-PDF and renamed-JPEG specs.
- Counting before taking the locks fails the concurrent-29 spec.

Deviations:
- The multer limit is `MAX_PHOTO_BYTES + 1`. busboy 1.6.0 flags a file that reaches the limit exactly, and the reviewer confirmed this in the container. Specs cover both edges: 10 MB → 201, 10 MB + 1 → 413.
- The photo table has `issue_id` without a FK; the production-issue migration adds the FK. This lets `progress` run without `production-issue`.
- Photo and issue creation require a `released` header (409 otherwise), so a photo taken after the order completes gets 409. Resolve works in any header state.
- `GET /production/issues` also accepts `unitId`, in the same SQL scope.
- `lockUnitForWork` and `mayWorkUnit` were extracted; `progress.service.ts` was refactored onto them, with its specs unchanged and passing.
- The notifier gained `issueOpened` and `issueResolved`.

Open limitations:
- Issues write no `production_order_events` activity rows. D-14 mentions activity rows; task-06 Scope lists notices only.
- An upload with `issueId` while `production-issue` is disabled answers 500, not 400. The UI never sends it then.
- The `UnitPhotos` stage select keeps its initial stage after a stage change on the page.
- The photo content route has no CSP sandbox; it relies on PNG/JPEG magic bytes and `nosniff`.
- A photo opened in a new tab loses its image once the thumbnail unmounts.
- Real S3/localstack upload and thumbnails in a browser are not exercised; this is left to the GATE-DONE UI walkthrough.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
