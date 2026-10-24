# Task 07 — Sales request with safe attachments and engineer assignment

Status: done

## Outcome
Sales records a quote request (hồ sơ báo giá ban đầu) with drawings/specs, assigns an engineer who is notified once; codes never collide; files are only reachable by people who can see the request.

## Scope
- In: `sales` plugin shell + `request` feature. Request (code `YC_YYYY_NNNN` per D-09, customer, project, contact, title, technical requirements, requested delivery date, quotation due date, `salesOwnerId`, `assignedEngineerId`). Status `draft → assigned → estimating → estimated → quoted → won | lost | cancelled` (cancel/lost need reason), forward-only. `RequestStatusPort.advance(manager, id, to)` used synchronously by later features (D-07). Attachments: `POST /sales/requests/:id/attachments` (allowlist pdf, dwg, dxf, xlsx, png, jpg; extension + magic bytes; ≤ 20 MB), table with FK to request, download via `GET /sales/requests/:id/attachments/:attId` with scope check and `Content-Disposition: attachment`. Assign/reassign → after-commit notification to engineer + activity log. Scope D-12. Register reference checks for customer/project.
- Out: estimate (task-08); email/SMS.

## Decisions (user, 2026-10-24)
- A request's sales owner is always its customer's sales owner: set from the customer on create, never chosen in the request form or API; when a manager reassigns the customer in CRM, that customer's requests move to the new owner inside the same transaction through a CRM owner-change hook that the sales plugin registers (synchronous, like `ReferenceCheckRegistry`; no after-commit event).
- Drawing attachments accept text DXF only (binary DXF is refused; DWG and PDF remain accepted).

## Coverage
- CP-07

## Ownership
- Create: `backend/src/plugins/sales/` (shell, `request/`, `_shared/`), `frontend/src/plugins/sales/` (shell, `request/`), `frontend/src/app/[locale]/sales/requests/`
- Modify: shared registration files listed in plan.md
- Read: `REF/backend/src/kernel/core/audit/notification.service.ts`, `REF/backend/src/kernel/shared/utils/db-error.util.ts:78-108`, `REF/backend/src/kernel/shared/services/s3-storage.service.ts`

## Steps
1. Shell + entity/migration (unique code without soft-delete filter). Create the shared helper `backend/src/plugins/sales/_shared/utils/sales-document-code.util.ts` (`createWithDocumentCode(prefix, txWork)`: `saveWithGeneratedCode` retrying the whole transaction, year in `Asia/Ho_Chi_Minh`); request creation uses it. Tasks 08, 09, 11 reuse it for `DT_`, `BG_`, `DH_`.
2. Transition table + port; invalid → 409.
3. Attachment endpoints and validation.
4. Notification after commit.
5. Frontend list (status, engineer, due date filters), detail with attachments and activity timeline. The request detail response embeds the customer, project and contact summary (via `CrmGateway`), so the assigned engineer sees them without `customer:read` (engineers hold no direct customer/project read since task-03).
6. Specs: the assigned engineer reads the request detail with its embedded customer/project summary (200) while holding no `customer:read`; assign → exactly one notification; rollback → none; `draft → won` 409; `.html` upload or pdf extension with non-PDF bytes → 400; Sales B reads Sales A's request or downloads its attachment → 404; a `sales` actor calling kernel `GET /files/:id` with the attachment's key → 403; deleting a customer/project referenced by a request → 409 (registered reference check); two concurrent creates → distinct codes (real DB); clock fixed at `2026-12-31T17:30:00Z` → code year `2027` (Asia/Ho_Chi_Minh).

## Acceptance
- AC-08, AC-14.

## Dependencies
- task-06-catalog-items.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/request src/plugins/sales/_shared && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"`
- Named probe: `src/plugins/sales/request/services/request.service.spec.ts`, `src/plugins/sales/request/services/request-attachment.service.spec.ts`, `src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts` (concurrency + year boundary)
- Reachability: concurrency spec needs the compose Postgres (running since task-01).
- Oracle: exit 0; asserted counts/status codes as listed.
- Counterexample: dropping the magic-byte check must fail the fake-PDF case; removing retry must fail the concurrency case; `new Date().getFullYear()` in UTC must fail the year-boundary case.
- Artifacts: test rows use a unique prefix and are cleaned up.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/request src/plugins/sales/_shared && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
Exit: 0
Base: d61e6834b17a8f023f916202783ec2d94811fae6
Head: 4df86a1fc3f3d093ae1396e30d84181e4be59e9c421268172004c8d51e9a37f5
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/request src/plugins/sales/_shared && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/sales/request/services/request-owner-race.spec.ts (6.269 s)
PASS src/plugins/sales/request/services/request.service.spec.ts (6.634 s)
PASS src/plugins/sales/_shared/ports/request-status.port.spec.ts
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/sales/request/request.controller.spec.ts (15.309 s)
Test Suites: 6 passed, 6 total
Tests:       233 passed, 233 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (22 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (3 tests)
 ✓ src/plugins/sales/request/tests/request-attachments.test.tsx (20 tests)
 ✓ src/plugins/sales/request/tests/request-detail.test.tsx (4 tests)
 ✓ src/plugins/sales/request/tests/request-list.test.tsx (5 tests)
 Test Files  4 passed (4)
      Tests  32 passed (32)
Exit: 0
```
No test in the run above was skipped: the real-Postgres concurrency (`sales-document-code.util.spec.ts`) and owner-race (`request-owner-race.spec.ts`) specs executed. Extra evidence (same Head, not the canonical command): full backend jest 77 suites / 957 passed; the touched kernel/CRM specs (`soft-delete-unique-index.spec.ts`, `seed-roles.panel.spec.ts`, `src/plugins/crm`) 11 suites / 114 passed; full frontend 128 files / 1022 passed / 6 skipped (permission-labels needs `../backend`); live smoke after migrate + seed + `docker compose restart backend` (statuses only): sales_a creates customer 201 and request 201 (`YC_2026_NNNN`); body with salesOwnerId 400; sales_b GET 404; assign engineer_a 200 and engineer_a gains exactly 1 `sales.request.assigned` notification; engineer_a detail 200 with embedded customer summary (no customer:read); engineer_b GET 404; real PDF upload 201, fake .pdf (HTML bytes) 400; sales_b download 404; sales_mgr delete referenced customer 409; sales_mgr reassigns customer to sales_b 200 → sales_a GET 404, sales_b GET 200. Cleanup: smoke request/activities/attachment row/notification removed by targeted SQL (no request delete endpoint by design), customer deleted through the API; one smoke PDF object remains in the dev LocalStack bucket. Review (code-auditor): round 1 PASS_WITH_WARNINGS (generic assignment notification, silently skipping DB spec, specs outside the command) + user decisions (request owner = customer owner with in-transaction CRM owner-change hook; text DXF only) → round 2 FAIL (create vs owner-change race) → `FOR SHARE` owner read inside each create attempt with fake + real-DB specs and negative controls → re-review PASS, Low only. Known limitations: `owner_changed` timeline rows carry no actor; the real-DB race spec relies on a 600 ms wait and on seeded accounts sales_a/sales_b; an engineer reassigned away keeps the earlier notification text; form has no owner field by decision; picker limit 100; multer memory storage; RFC 5987 parentheses in `filename*`.
