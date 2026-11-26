# Task 13 — Accounting chain over HTTP on a real database

Status: pending

## Outcome
One e2e spec drives the whole P5 path through the real app and database: order → milestones → invoice → partial collection → over-collection refusal → reminder run → settle → supplier invoice on an approved PO → partial payment → over-payment refusal, with the Sales-owner and non-accounting-role negative paths.

## Scope
- In (AC-14, AC-11): `backend/test/accounting-chain.e2e-spec.ts` builds one order through the sales HTTP chain and one approved PO through the inventory HTTP chain (as `delivery-chain.e2e-spec.ts` builds its fixtures), then: accountant schedules two milestones (30% and an amount), issues an invoice on the first, collects part, is refused 409 with the exact `Amount exceeds the remaining balance (remaining: N).`, collects the rest, and the milestone reads `paid`; the order page and the customer-debt list show the D-10 figures (`receivable = invoiced − collected`); sales_a (owner) reads the order page and the list but is refused every write with 403, and so is salesManager (user, Q11); the collection is submitted twice with one `clientRequestId` and stores one row (replay 200); a collection dated before its invoice is 400; the accountant voids the collection and the director reads one `accounting.entry.voided` notice without an amount, the accountant and sales_a do not; sales_b gets 404 on the same order and an empty list; engineer, purchasing, storekeeper and qcInspector get 403 on a sample of accounting routes (schedule, collection, payable list); a second milestone with a due date of yesterday plus a PO invoice with a due date of today are made eligible and `PaymentReminderService.run(vnToday())` is invoked through `app.get(...)`: the accountant reads the receivable and payable reminders, the owner (sales_a) reads the owner reminder of their own order, the PO creator reads the payable owner reminder without an amount, the director reads the role records, sales_b and the engineer read none; a second run adds no record; settling the second milestone closes its notice; payable side: the accountant records a supplier invoice (refused when over the PO total), a payment (refused when over the due), and the PO payable page and list show `payable = invoiced − paid`; the PO's stock receipt flow is unaffected (a receipt on that PO still posts).
- Out: UI; the cron firing itself (unit-proven in task-08).

## Coverage
- CP-13

## Ownership
- Create: `backend/test/accounting-chain.e2e-spec.ts`
- Read: `backend/test/delivery-chain.e2e-spec.ts` (fixtures, sessions, notices helper), `backend/test/production-chain.e2e-spec.ts`, `backend/src/plugins/accounting/payment-reminder/services/payment-reminder.service.ts`

## Steps
1. Reuse the delivery chain's login and fixture style; log in as `accountant_a`, `sales_a`, `sales_b`, `director`, `engineer_a`, `purchasing`, `storekeeper`, `qc_a`, with `S3StorageService` faked as the delivery chain does if the fixture needs it.
2. Receivable path as in Scope, asserting status codes and bodies; the exact over-collection message; `expectNoMoneyKeys` is applied to one response a non-accounting role is allowed to read after the chain (the sales order detail for sales_b of their own order is unchanged by P5: no accounting key leaks into it).
3. Reminder path: set due dates relative to `vnToday()` with a `daysFromToday` helper (never fixed dates); read notices through `GET /notifications` as each actor; assert only on records whose payload ids (`milestoneId`, `supplierInvoiceId`, `orderId`, `purchaseOrderId`) or dedupe-derived ids belong to this spec's own subjects, never on absolute inbox counts (the app's start-up reminder pass and leftover demo data also write records, F-10); the second-run no-op is asserted per own subject.
4. Payable path as in Scope, including the receipt-still-posts check.
5. Cleanup is not required (the chain keeps demo-like data as the other chain specs do); the spec uses unique invoice numbers per run (random suffix) so a rerun on a used database passes.

## Acceptance
- AC-14; AC-11 (HTTP-level role and owner negatives).

## Dependencies
- task-12-supplier-debt-screens.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f test/accounting-chain.e2e-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npm run test:e2e -- accounting-chain delivery-chain inventory-chain sales-chain"`
- Named probe: `accounting-chain.e2e-spec.ts` (full path; 409 message; owner/role negatives; reminder audiences and no-op second run; PO receipt still posts)
- Reachability: known (same form as P4 task-13; compose Postgres; `accountant_a` and the other demo users from `npm run seed`).
- Oracle: exit 0, 4 suites passed, 0 skipped.
- Counterexample: a Sales owner whose write is accepted, a sales_b read that returns the order, a second reminder run that adds a record, or a money key in a response the P5 packet must not change, must each fail the spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
