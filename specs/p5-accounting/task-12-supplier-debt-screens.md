# Task 12 — Supplier-debt list and the PO payable screen

Status: pending

## Outcome
An accountant, director or admin opens "Công nợ nhà cung cấp", a filtered, paged list of purchase orders with their invoiced, paid and payable figures, and from a PO page records supplier invoices and payments or voids a wrong one; nobody else sees the menu item.

## Scope
- In (D-18, D-11, D-12, D-19): frontend feature `payable` (item "Công nợ nhà cung cấp", `/accounting/payables`, permissions `payable:read`, `payable:*`) added to `accounting.features.ts`; `app/[locale]/accounting/payables/page.tsx` and `payables/[purchaseOrderId]/page.tsx`; `PayableListPage` with filters search (PO code, supplier), due state (any/upcoming/overdue), balance (open/settled/any), "Chưa nhập hóa đơn" toggle (`billed=no`), columns PO code, supplier, PO status badge, PO total, invoiced, paid, payable, next due date (overdue labelled in text), pagination and states as the receivable list; `PoPayablePage`: header and summary, invoices with their payments (voided rows struck through with reason), with `payable:manage` the "Nhập hóa đơn NCC" dialog (number, date, optional due date, amount prefilled with the PO's remaining invoice room), "Thanh toán" dialog (date, amount prefilled with the invoice's remaining due, method, note, and one `clientRequestId` uuid generated per open) and "Hủy bản ghi" with a reason; errors shown as in task-11 (over balance with the remaining figure, duplicate number, PO total exceeded, cancelled PO); no request needs `purchase_order:read`.
- Out: supplier statements, aging buckets, Excel export; editing an invoice or payment.

## Coverage
- CP-12

## Ownership
- Create: `frontend/src/plugins/accounting/payable/{payable.feature.ts,constants.ts,types.ts,permissions/payable-permission.keys.ts,services/payable.service.ts,hooks/api/usePayable.ts,components/{PayableListPage.tsx,PoPayablePage.tsx,SupplierInvoiceDialog.tsx,SupplierPaymentDialog.tsx,PayableVoidDialog.tsx},tests/{payable-list.test.tsx,po-payable-page.test.tsx,payable-fixtures.tsx}}`, `frontend/src/app/[locale]/accounting/payables/page.tsx`, `frontend/src/app/[locale]/accounting/payables/[purchaseOrderId]/page.tsx`
- Modify: `frontend/src/plugins/accounting/accounting.features.ts`, `frontend/src/kernel/langs/{vi,en}/accounting.json`
- Read: `frontend/src/plugins/accounting/receivable/components/ReceivableListPage.tsx`, `OrderPaymentPage.tsx`, `frontend/src/plugins/accounting/receivable/tests/order-payment-fixtures.tsx`

## Steps
1. `payable-list.test.tsx`: rows with figures and overdue label; every filter changes the request params; `billed=no` lists unbilled POs; empty, loading, error states; a row opens `/accounting/payables/<poId>`; the page never calls an inventory endpoint.
2. `po-payable-page.test.tsx`: summary, invoices with payments, voided rows struck through; `payable:read`-only user sees no write control (and cannot reach the page by menu: the item is hidden); dialogs send the D-11/D-12 fields only (no supplier id; the payment sends one `clientRequestId` per open, a double submit sends the same one), show the over-balance and PO-total refusals with N, reject a future date client-side, keep amounts whole dong, close on Escape and return focus; a cancelled PO shows a notice and no create controls but keeps void.
3. Navigation: a `purchasing` or `sales` permission set shows no "Công nợ nhà cung cấp"; `accountant` shows both items in the order "Công nợ khách hàng" then "Công nợ nhà cung cấp".
4. Live check (receipt, after `docker compose restart frontend backend`): as `accountant_a` open an approved demo PO, record an invoice with a due date, pay part, try to overpay (refusal shown), void the payment; as `purchasing` the menu item is absent and `/accounting/payables` shows the forbidden state; keep the demo data.

## Acceptance
- AC-13 (supplier part: list, PO page, error display, menu gating); AC-08 (UI part).

## Dependencies
- task-11-order-payment-screen.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/accounting src/kernel/platform"`
- Named probe: `payable-list.test.tsx` (filters, billed toggle, no inventory endpoint), `po-payable-page.test.tsx` (read-only vs manage, dialog fields, error mapping, cancelled PO), `app-navigation.test.ts` (menu gating)
- Reachability: known for vitest; the live walkthrough needs the backend of tasks 05-07 and restarted containers; the live level stays open until the receipt records it.
- Oracle: exit 0, all files passed, 0 skipped; live: the over-payment refusal shows the remaining amount and `purchasing` has no menu item.
- Counterexample: sending `supplierId` in the invoice body must fail the dialog probe; showing the menu item to `purchasing` must fail the navigation probe; the page fetching `/inventory/purchase-orders` must fail the no-inventory-endpoint probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
