# Task 05 — Sales request with engineer handoff

Status: pending

## Outcome
Sales records a customer request (yêu cầu báo giá) with drawings and specs, assigns it to an engineer, and the engineer is notified.

## Scope
- In: `sales/request` feature. Request (code `YC_YYYY_NNNN` via `DocumentCodeService`, customer, project, contact, title, technical requirements text, requested delivery date, quotation due date, attachments (drawings/specs via kernel files/S3), assigned engineer, sales owner). Status: `draft` → `assigned` → `estimating` → `estimated` → `quoted` → `won` | `lost` | `cancelled` (cancel needs reason). Assign/reassign emits domain event `sales.request.assigned`; listener creates kernel notification for the engineer and an activity-log entry.
- Out: estimate content (task-06); email/SMS notification.

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/sales/` (plugin shell + `request/`), `frontend/src/plugins/sales/` (shell + `request/`), `frontend/src/app/[locale]/sales/requests/`
- Modify: both `enabled-plugins.ts`, both `enabled-features`, `seed-roles.ts` (append keys only)
- Read: `REF/backend/src/kernel/core/audit/notification.service.ts`, `REF/backend/src/kernel/platform/events/domain-event.ts`, `REF/backend/src/plugins/sales/rfq/`

## Steps
1. Plugin shell + entity/migration; customer/project read through `CrmGateway` (task-03).
2. Status transitions in one service method with an allowed-transition table; invalid transition → 409.
3. Attachments through kernel files service (allowlist: pdf, dwg, dxf, xlsx, png, jpg).
4. Event + listener → notification row for the assigned engineer.
5. Frontend list (filters: status, engineer, due date), detail with attachments and activity timeline.
6. Specs: assign creates exactly one notification for the engineer; reassign notifies the new engineer; `won` from `draft` → 409.

## Acceptance
- AC-06: after assign, `notifications` has one row for the engineer referencing the request id.

## Dependencies
- task-03-crm-plugin.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/sales/request && npm run validate:migrations && npm run typecheck" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/sales/request/services/request.service.spec.ts`, `src/plugins/sales/request/listeners/request-assigned.listener.spec.ts`
- Reachability: known after task-01.
- Oracle: specs assert notification recipient and count; transition table rejects `draft → won`.
- Counterexample: emitting the event before the transaction commits must fail the "no notification on rollback" case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
