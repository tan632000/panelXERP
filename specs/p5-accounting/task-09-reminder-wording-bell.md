# Task 09 — The bell phrases the payment reminders and shows for the accountant

Status: pending

## Outcome
The four reminder events and the void notice render a Vietnamese and an English sentence (stage-aware: due soon or overdue, with the milestone/invoice details; the void notice by kind, with no amount), and an accountant — who holds only `receivable:*` and `payable:*` — gets a notification bell at all.

## Scope
- In (D-16, AC-12): `useNotifications.ts`: an accounting event map (as `QC_EVENT_MESSAGE_KEYS`, `:157-160`) for `accounting.receivable.reminder`, `accounting.receivable.reminder.owner`, `accounting.payable.reminder`, `accounting.payable.reminder.owner` and `accounting.entry.voided` added to `NOTIFICATION_EVENT_KEYS` (`:170-205`); `NOTIFICATION_REQUIRED_SCOPES` (`:52-…`, the bell is rendered only for an actor holding one of them, `:911-914`) gains `receivable:read` and `payable:read` (`purchase_order:read` is already listed). `vi|en/common.json` `notification.events.*`: receivable wording uses ICU `select` on `stage` (`due_soon|overdue`) with `orderCode`, `customerName`, `milestoneName`, `dueDate` (e.g. vi "Đợt thanh toán {milestoneName} của đơn {orderCode} ({customerName}) sắp đến hạn ({dueDate}).") and the owner variant; payable wording with `purchaseOrderCode`, `supplierName`, `invoiceNo`, `dueDate`, `stage` (no amount in either language for the owner variant). The void wording is an ICU `select` on `kind` (`customer_invoice|collection|supplier_invoice|payment`) built from `subjectCode`, `partyName`, `reference`, `reason`, and never an amount (e.g. vi "Bản ghi thu tiền của đơn {subjectCode} ({partyName}) đã bị hủy: {reason}."). The payload keys are the contract of plan D-16 and D-22 (written by task-08, asserted there with exact key sets); this task renders exactly those names and shows `-` for any key the payload lacks, so the every-known-event test (`notification-spec-wording.test.ts:349-356`, which renders each event with a payload lacking these keys) never meets the fallback sentence (R-07).
- Out: any change to the bell's layout; other events; screens.

## Coverage
- CP-09

## Ownership
- Modify: `frontend/src/kernel/core/hooks/api/useNotifications.ts`, `frontend/src/kernel/core/tests/use-notifications.test.ts`, `frontend/src/kernel/langs/vi/common.json`, `frontend/src/kernel/langs/en/common.json`
- Read: `frontend/src/kernel/core/tests/notification-spec-wording.test.ts:336-365`, `frontend/src/kernel/core/tests/sales-order-notification.test.ts`, plan D-16 (payload keys)

## Steps
1. `use-notifications.test.ts`: for each of the four event types and each stage, `resolveNotificationMessage` returns a key (not the fallback) and the vi/en strings render with the payload names above; the owner payable variant renders without any amount; a payload missing any D-16/D-22 key renders `-` for it (never the fallback sentence, never a crash); `accounting.entry.voided` renders for each of the four kinds in both languages and the rendered text contains no digit group that could be an amount when the payload carries none.
2. `canReadAnyNotification(["receivable:read"])` and `(["payable:read"])` are true; an engineer's permission set stays false.
3. `notification-spec-wording.test.ts` ("has a phrasing in both languages for every known event") passes with the four new keys; both language files carry identical key sets (lint:i18n).

## Acceptance
- AC-12

## Dependencies
- task-08-payment-reminder-job.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts src/kernel/core/tests/notification-spec-wording.test.ts src/kernel/core/tests/sales-order-notification.test.ts"`
- Named probe: `use-notifications.test.ts` (four events × stages × languages, owner variant without amount, accountant bell), `notification-spec-wording.test.ts` (every known event phrased in vi and en)
- Reachability: known (same form as P4 task-06; compose service `frontend`).
- Oracle: exit 0, all files passed, 0 skipped.
- Counterexample: leaving `receivable:read`/`payable:read` out of `NOTIFICATION_REQUIRED_SCOPES` must fail the accountant-bell probe; rendering with a key other than the D-16/D-22 names must show `-` for that value and fail the render probe; adding an amount to the void wording must fail the no-amount probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
