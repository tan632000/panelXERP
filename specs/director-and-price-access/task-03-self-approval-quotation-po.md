# Task 03 — Director self-approval: quotation and purchase order

Status: pending

## Outcome
A quotation version or purchase order submitted by the director is approved in the same request, its approved notices reach the D-04 audience, and the director is never refused by four-eyes; everyone else keeps today's flow.

## Scope
- In:
  - Quotation (`quotation-approval.service.ts`), D-03/D-04:
    - `submit` (`:90-131`): when `actor.role === 'director'`, after the same checks, move `draft → approved` with `decidedBy`, `decidedAt`, advance the request to `quoted` (as `approve`, `:160-163`), record `quotation_submitted` and `quotation_approved` activities, and send only the approved notices.
    - `assertApprover` (`:392-405`) returns early for the director.
    - The approved notice (normal and self): owner record as today (`:170-173`) plus a `salesManager` broadcast, `QUOTATION_READ`, `excludeUserIds: [actor, owner]`. `notify` (`:407-…`) gains `excludeUserIds`.
  - Purchase order (`purchase-order-approval.service.ts`):
    - `submit` (`:59-97`): for the director, one transaction moves `draft → pending_approval → approved`. `movePurchaseOrder` guards on `held.status` as read under the lock and never refreshes it (`purchase-order-lock.util.ts:43-45`), so set `held.status = PENDING_APPROVAL` after the first move (or re-lock the header) before the second; without it the second update matches 0 rows and every director submit answers 409 (GATE-REVIEW R-02); records `SUBMITTED` then `APPROVED` events, sets `approvedBy/approvedAt`; no submitted notice.
    - `assertUninvolved` (`:228-250`) returns early for the director.
    - The approved notice (normal and self): creator record (`:252-264`, skipped when the creator is the actor) plus a `purchasing`,`storekeeper` broadcast with `PURCHASE_ORDER_READ`, `excludeUserIds: [actor, creator]`.
  - Existing specs that encode the old behavior:
    - `quotation-approval.service.spec.ts:285-303` expects one `emit` → two (owner, salesManager broadcast).
    - `purchase-order-approval.service.spec.ts:276-297` expects notices `[submitted, approved]` → plus the broadcast; `:317-322` ("refuses the creator", director creates and submits → `pending_approval`), `:324-328`, `:330-352` use `DIRECTOR` as the involved approver → rewrite these four-eyes cases with an `admin`-role actor (`actor(id, 'admin')`), and add the director cases below. `DIRECTOR_2`, `DIRECTOR_3` (`:105-107`) are other users acting as director; keep them as uninvolved approvers.
- Out: stocktake (task-04); bell wording (task-08).

## Coverage
- CP-03

## Ownership
- Modify: `backend/src/plugins/sales/quotation/services/quotation-approval.service.ts`, `backend/src/plugins/inventory/purchase-order/services/purchase-order-approval.service.ts`
- Modify (specs): `plugins/sales/quotation/services/quotation-approval.service.spec.ts`, `plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts`
- Read: `quotation.constant.ts:25-38`, `purchase-order.constant.ts:12-19`, `purchase-order-lock.util.ts`

## Steps
1. Quotation spec: director submits a sales-created draft → status `approved`, request `quoted`, `decided_by` = director, one owner notice and one salesManager broadcast, no `sales.quotation.submitted`; salesManager submits → `pending_approval` and the approvers' notice as today (`:103-123`).
2. Quotation spec: the director approves a version they last edited → 200; salesManager in the same position → 403 (`:335-350` stays).
3. PO spec (mandatory, R-02): director creates and submits → HTTP 200 and status `approved`, events `[submitted, approved]`, notices: purchasing/storekeeper broadcast only (creator = actor); purchasing submits, director approves → creator record plus broadcast; an admin-role creator, submitter or editor is refused 403.
4. Rollback: the request advance fails inside a director submit → the version stays `draft` and no notice is written (pattern of `:304-317`).
5. Implement.

## Acceptance
- AC-04, AC-05 (quotation and purchase order).

## Dependencies
- task-02-director-bell-and-gates.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/quotation src/plugins/inventory/purchase-order"`
- Named probe: `quotation-approval.service.spec.ts` (director submit, four-eyes cases, rollback), `purchase-order-approval.service.spec.ts` (`separation of duties` with admin actors, director submit).
- Reachability: known.
- Oracle: exit 0, 0 skipped; statuses, events and notice rows as in Steps 1-4.
- Counterexample: a second `movePurchaseOrder` on the stale `held` must fail Step 3 with 409; approving in a second transaction must fail the rollback probe (a `pending_approval` version remains); exempting `admin` must fail the admin 403 cases; a director submit that still sends the submitted notice must fail Step 1.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
