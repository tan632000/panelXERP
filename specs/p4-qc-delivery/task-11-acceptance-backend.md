# Task 11 — Acceptance minutes and the order becoming `completed`

Status: done

## Outcome
The order's sales owner (or salesManager/director) uploads the signed acceptance minutes once the order is `delivered` and any installation is `done`, which moves the order `delivered → completed` in the same transaction and tells the followers; storekeeper reads the minutes.

## Scope
- In (feature `acceptance`, D-11): tables `acceptances` (order_id unique, representative_name ≤ 255, signed_date, created_by/at) and `acceptance_files`; permissions `acceptance:read|create`. Endpoints: `POST /delivery/orders/:orderId/acceptance` multipart `files[]` (1–10, ≤ 20 MB each, (user, Q4)), `representativeName`, `signedDate` (`create`): (R-02) visibility check (404) before storing any object → store → transaction: order lock → scope (404) → order `delivered` else 409 → installation of the order, if any, `done` else 409 → no acceptance yet else 409 → (R-12) `signedDate` ≤ `vnToday()` and ≥ the latest `received_date` of the order's notes, else 400 → rows → `moveStatus(delivered → completed)`; failure deletes every stored object; after commit the D-13 `completed` notice. `GET /delivery/orders/:orderId/acceptance` (`read`; 200 with `null` when none exists on a visible order); (R-03) `GET /delivery/acceptance-files/:fileId/content` with `acceptance:read`, D-03 condition in SQL, stored type, `nosniff`, `Content-Disposition: attachment`. No cancel ((user, Q5)). `seed-roles.panel.spec.ts`: remove `acceptance` from `PENDING_MODULES`, leaving it empty.
- Out: screens (task-12).

## Coverage
- CP-11

## Ownership
- Create: `backend/src/plugins/delivery/acceptance/**` (migration, entities, dto, permissions, `services/acceptance.service.ts` + `acceptance.service.spec.ts`, `services/acceptance-race.spec.ts`, controller + `acceptance.controller.spec.ts`, `acceptance.module.ts`)
- Modify: `delivery.features.ts`, `delivery.module.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/sales/_shared/ports/order-production.port.ts:72-91`, `delivery/_shared/utils/delivery-file.util.ts`, `delivery-scope.util.ts`, `delivery/installation/entities/` (task-10)

## Steps
1. Acceptance → `acceptance.service.spec.ts` (real Postgres): order `in_production` → 409; `delivered` with installation `in_progress` → 409; `delivered` without installation → 201 and order `completed`; second acceptance → 409; `signedDate` after Vietnam today → 400; (R-12) `signedDate` one day before the latest `received_date` → 400, equal → 201; sales_a on own order → 201, salesManager on any order → 201 ((user, Q7)), storekeeper `POST` → 403, storekeeper `GET` → 200; (R-02) sales_b on sales_a's `in_production` order → 404 (not 409) and the storage fake's `upload` not called; followers read one `completed` notice; a storage failure after the first of two files → both objects deleted, no row, order still `delivered`.
2. Controller → `acceptance.controller.spec.ts`: renamed type → 400; 20 MB + 1 → 413; 11 files → 400; (R-03) content of another owner's file → 404 for sales_b, technician → 403, headers `nosniff` and `Content-Disposition: attachment`; key `^delivery/acceptance/<orderId>/[0-9a-f-]{36}\.(pdf|png|jpg)$`; no key in responses.
3. Races → `acceptance-race.spec.ts`: acceptance and installation create queued (`queuedBehind`) behind a holder of the `sales_orders` row → never an order `completed` while an installation not `done` exists (create first → acceptance 409; acceptance first → create 409); two acceptances queued → one 201, one 409, `moveStatus` once.
4. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-10; AC-11 (acceptance reads, writes, content); AC-12 (acceptance files).

## Dependencies
- task-10-installation-backend.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/acceptance/services/acceptance.service.spec.ts && test -f src/plugins/delivery/acceptance/services/acceptance-race.spec.ts && test -f src/plugins/delivery/acceptance/acceptance.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `acceptance.service.spec.ts` (gates, R-12, Q7, scope-first, cleanup, notice), `acceptance-race.spec.ts` (acceptance ∥ installation create, acceptance ∥ acceptance), `acceptance.controller.spec.ts` (413, headers, 403/404), `seed-roles.panel.spec.ts` (`PENDING_MODULES` empty)
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: checking order status before scope must fail the sales_b 404 case; checking "installation done" before the order lock must fail acceptance ∥ installation create; writing the acceptance row without `moveStatus` in the same transaction must fail "order `completed`".
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/delivery/acceptance/services/acceptance.service.spec.ts && test -f src/plugins/delivery/acceptance/services/acceptance-race.spec.ts && test -f src/plugins/delivery/acceptance/acceptance.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: c2458e90291d07b4ff76e0ea79f282132ba513d3
Head: 0eab09f9809b417f9e4c70251584f37417e8695c4e34ee7af0ca7141e312df3c
```text
$ docker compose exec -T backend sh -c "test -f ...acceptance.service.spec.ts && ... && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"
PASS src/plugins/delivery/acceptance/acceptance.controller.spec.ts (33.989 s)
PASS src/plugins/delivery/acceptance/services/acceptance.service.spec.ts (34.114 s)
PASS src/plugins/delivery/acceptance/services/acceptance-race.spec.ts (35.532 s)
Test Suites: 33 passed, 33 total
Tests:       352 passed, 352 total
Migration filename check passed (54 files).
$ docker compose run --rm --no-deps -v .../backend:/backend:ro frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests)
 Test Files  1 passed (1)
FINAL_EXIT=0
```
Skipped: none reported in the log. Counterexamples (each run once against a temporary mutation of `acceptance.service.ts`, reverted afterwards; file SHA-256 `ef6355599a33c835…` identical before and after all of them): (1) status checked before scope: swapping the order only inside the transaction left all 32 acceptance tests green, because the pre-storage `assertOrderVisible` (R-02) already answers 404 first; removing that pre-storage check as well and putting scope after status failed "answers 404 to an order that does not exist and stores nothing" and "answers 404 to another sales rep before any status answer and stores nothing" (2 failed, 30 passed) — so the 404-before-409 guarantee is held by the pre-storage check, the in-transaction check is a re-check under the lock; (2) reading the installation state before the order lock failed `acceptance-race.spec.ts` "never leaves an order completed beside an installation that is not done: installation create first" (1 failed, 31 passed); (3) writing the acceptance rows without `moveStatus` failed 5 tests, among them "completes a delivered order without an installation", "completes a delivered order whose installation is done", "lets one of two acceptances queued for one order win and moves the order once" (5 failed, 27 passed).
Review: first code-auditor run PASS_WITH_WARNINGS (one Medium: GET `/delivery/orders/:orderId/acceptance` answered an empty body instead of the JSON `null` the task specifies, and the spec had asserted the empty body). One repair round: the handler now sets `Content-Type: application/json` and returns `(await get()) ?? 'null'`, the spec asserts `res.text === 'null'` and a null `res.body`; the affected acceptance specs (32 tests) passed, the whole Command was run again, and a narrow code-auditor re-review returned PASS (0 critical/high/medium). Low, left as is: a failed follower notice or post-commit read after commit gives a 500 although the order is `completed` (same pattern as the delivery-note receive); the `@Header` placement differs cosmetically from `content()`. The re-review could not confirm with `git diff` that the fix touched only two files, because the acceptance directory was untracked.
Deviations: implementation delegated to the implementer agent and verified independently by the controller (pre-change run by the controller: the `test -f` check failed, exit 1). Only the resource label `acceptance` was added to both `permission.json` files (one added line each, no existing line touched); `acceptance:read` and `acceptance:create` take the generic action labels, as `delivery_note:read|create` do. `seed-roles.ts` already matched Q7, no seed change. `delivery.module.ts` needed no change. The generated OpenAPI/`api.ts` leave the GET response untyped (`content?: never`), since `AcceptanceView` is an interface: task 12's client must type it as `AcceptanceView | null` by hand. Not verified: no UI walkthrough, and the HTTP chain e2e belongs to task 13.
Docs impact: none yet (API docs are task-14); openapi.json/.yaml and `api.ts` were regenerated.
