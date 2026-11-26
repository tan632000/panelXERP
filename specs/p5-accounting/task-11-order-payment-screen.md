# Task 11 — The order "Thanh toán" screen: milestones, invoices and collections

Status: pending

## Outcome
An accountant opens an order's "Thanh toán" page and schedules milestones (name, percent or amount, due date), records customer invoices and collections per milestone, and voids a wrong entry; a sales owner reaches the same page read-only from a "Thanh toán" action on the order detail page; over-balance, cancelled-order and over-total refusals are shown in Vietnamese.

## Scope
- In (D-18, D-05, D-07, D-08, D-09, D-13): page `/accounting/orders/[orderId]` (`app/[locale]/accounting/orders/[orderId]/page.tsx`) rendered by `OrderPaymentPage`: header (code, status badge, customer, project, order total) and summary figures (scheduled, unscheduled, invoiced, collected, receivable, to collect); a milestone list with state badge (unpaid/partial/paid) and its invoices and collections (voided rows struck through with the reason); with `receivable:manage`: "Thêm đợt thanh toán" dialog (name, a percent/amount switch, due date; the unscheduled remainder shown), edit and delete on a milestone, "Xuất hóa đơn" dialog (number, date, amount prefilled with the milestone's remaining invoice room), "Thu tiền" dialog (date, amount prefilled with the remaining balance, method select, note), "Hủy bản ghi" with a reason for invoices and collections; without `receivable:manage` no write control renders; server errors (409 over balance with the remaining figure, 409 duplicate invoice number, 409 cancelled order, 400 dates) shown as field or toast messages from `accounting.json`; the order detail page (`OrderDetailPage.tsx:113-148`) gains a "Thanh toán" link rendered outside the existing actions wrapper (whose condition covers only material, production and delivery permissions, so a holder of `receivable:read` alone would otherwise never see it), only when `isFrontendFeatureEnabled("receivable")` and `can(ReceivablePermission.read)` (a page, not a tab: Q7; F-09); the collection dialog generates one `clientRequestId` (uuid) per open and the response with `note`/`voidReason` absent (read-only callers, D-23) renders without them; hooks and service for the order page, milestone, invoice, collection and void calls typed from `api.ts`; `receivable:manage` and `receivable:read` keys in `receivable-permission.keys.ts`.
- Out: the list (task-10); supplier screens (task-12); editing an invoice or collection (D-09).

## Coverage
- CP-11

## Ownership
- Create: `frontend/src/plugins/accounting/receivable/components/{OrderPaymentPage.tsx,MilestoneDialog.tsx,InvoiceDialog.tsx,CollectionDialog.tsx,VoidDialog.tsx,MilestoneCard.tsx}`, `tests/{order-payment-page.test.tsx,order-payment-fixtures.tsx}`, `frontend/src/app/[locale]/accounting/orders/[orderId]/page.tsx`
- Modify: `frontend/src/plugins/accounting/receivable/{services/receivable.service.ts,hooks/api/useReceivable.ts,constants.ts,types.ts}`, `frontend/src/plugins/sales/order/components/OrderDetailPage.tsx` (+ its existing test file under `plugins/sales/order/tests`), `frontend/src/kernel/langs/{vi,en}/accounting.json`, `frontend/src/kernel/langs/{vi,en}/order.json` (the link label)
- Read: `frontend/src/plugins/delivery/delivery-note/components/OrderDeliveryPage.tsx`, `DeliveryNoteReceiveDialog.tsx` (dialog pattern), `frontend/src/plugins/delivery/delivery-note/tests/order-delivery-page.test.tsx`

## Steps
1. `order-payment-page.test.tsx`: renders header, summary and milestones with invoices/collections; voided rows struck through with reason and excluded from the summary shown; with only `receivable:read` there is no "Thêm", "Xuất hóa đơn", "Thu tiền", "Hủy" control.
2. Dialogs: percent/amount switch sends exactly one of the two fields; amount fields accept whole dong only (1.5 refused client-side and server 400 message shown); the collection amount prefill equals the remaining balance and the submit with a larger value shows the server's `Amount exceeds the remaining balance (remaining: N).` mapped to the vi sentence with N; duplicate invoice number message; date fields reject a future date; confirm buttons disabled while pending; focus returns to the trigger after close; dialogs are keyboard operable (Escape closes, labelled fields).
3. States: loading, 404 (sales_b opening another owner's order) shows the not-found state, 403 never reachable from the menu; a cancelled order shows a notice and no create controls but keeps the void action.
4. `OrderDetailPage` test: the "Thanh toán" link is present for `receivable:read` with the feature enabled, also for a user who holds none of the material/production/delivery scopes, and absent without the scope or with the feature disabled (mock `isFrontendFeatureEnabled`), and the existing delivery/production/material links are unchanged. Dialog probe: submitting twice from one open sends the same `clientRequestId`, reopening sends a new one; a read-only page response without `note`/`voidReason` renders without a crash.
5. Live check (recorded in the receipt, after `docker compose restart frontend backend`): as `accountant_a` schedule two milestones on a demo order, issue an invoice, collect part, try to over-collect (see the refusal), void the collection; as `sales_a` open the same order's page read-only; as `sales_b` get not-found; keep the demo data afterwards.

## Acceptance
- AC-13 (order payment part: schedule, invoice, collect, void, sales read-only, error display); AC-11 (UI part: no write control without `receivable:manage`); AC-20 (link gating).

## Dependencies
- task-10-customer-debt-list-screen.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/accounting src/plugins/sales/order src/plugins/delivery/delivery-note"`
- Named probe: `order-payment-page.test.tsx` (read-only vs manage, dialogs, error mapping, voided rows, states), the order-detail test (link gating, other links unchanged)
- Reachability: known for vitest; the live walkthrough needs the backend from tasks 02-08 running, restarted containers and the demo accounts of task-01; the live level stays open until the receipt records it.
- Oracle: exit 0, all files passed, 0 skipped; live: the over-collection refusal text contains the remaining amount, and `sales_b` sees not-found.
- Counterexample: rendering a write control for a `receivable:read`-only user must fail the read-only probe; sending both `percent` and `amount` must fail the dialog probe; omitting the remaining figure from the 409 message must fail the error-mapping probe; nesting the link inside the actions wrapper must fail the scope-only link case; ignoring the feature flag must fail the disabled-feature case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
