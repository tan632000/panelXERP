# Task 07 — Sales request with safe attachments and engineer assignment

Status: pending

## Outcome
Sales records a quote request (hồ sơ báo giá ban đầu) with drawings/specs, assigns an engineer who is notified once; codes never collide; files are only reachable by people who can see the request.

## Scope
- In: `sales` plugin shell + `request` feature. Request (code `YC_YYYY_NNNN` per D-09, customer, project, contact, title, technical requirements, requested delivery date, quotation due date, `salesOwnerId`, `assignedEngineerId`). Status `draft → assigned → estimating → estimated → quoted → won | lost | cancelled` (cancel/lost need reason), forward-only. `RequestStatusPort.advance(manager, id, to)` used synchronously by later features (D-07). Attachments: `POST /sales/requests/:id/attachments` (allowlist pdf, dwg, dxf, xlsx, png, jpg; extension + magic bytes; ≤ 20 MB), table with FK to request, download via `GET /sales/requests/:id/attachments/:attId` with scope check and `Content-Disposition: attachment`. Assign/reassign → after-commit notification to engineer + activity log. Scope D-12. Register reference checks for customer/project.
- Out: estimate (task-08); email/SMS.

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
5. Frontend list (status, engineer, due date filters), detail with attachments and activity timeline.
6. Specs: assign → exactly one notification; rollback → none; `draft → won` 409; `.html` upload or pdf extension with non-PDF bytes → 400; Sales B reads Sales A's request or downloads its attachment → 404; a `sales` actor calling kernel `GET /files/:id` with the attachment's key → 403; deleting a customer/project referenced by a request → 409 (registered reference check); two concurrent creates → distinct codes (real DB); clock fixed at `2026-12-31T17:30:00Z` → code year `2027` (Asia/Ho_Chi_Minh).

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
