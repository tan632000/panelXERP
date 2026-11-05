# Task 03 — Director self-approval: quotation and purchase order

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/quotation src/plugins/inventory/purchase-order"
Exit: 0
Base: a942a6ce71865a539ec305b4b1e28876f376e9b4
Head: b9a1c4d4c9f280c751478cd8932a786eb3932567e215d4658f82d36420fa8457
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/quotation src/plugins/inventory/purchase-order"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales/quotation src/plugins/inventory/purchase-order
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts (22.03 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (22.218 s)
Test Suites: 11 passed, 11 total
Tests:       197 passed, 197 total
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
VERIFY_EXIT=0
```

This run started after the last edit; 0 skipped. Named probes: `quotation-approval.service.spec.ts` (director submit approves at once with request `quoted`, owner record and sales-manager broadcast, no submitted notice; rollback when the request cannot become quoted; director approves a version they last edited; salesManager and admin four-eyes 403 on approve and reject), `purchase-order-approval.service.spec.ts` (director creates and submits → 200 `approved`, events `[submitted, approved]`, only the purchasing/storekeeper broadcast; purchasing submits, director approves → creator record plus broadcast; admin creator, submitter, editor and earlier submitter refused 403).

Pre-change run (specs first): exit 1, 7 failed, all on the unmet acceptance, no cascade (quotation: director submit, director-submit rollback, approve notice count, director approves own edit; PO: uninvolved director approve notices, director submit, director approves after editing). The rewritten admin 403 cases passed before the change, as admin was never exempt. Counterexamples (each restored, `cmp` equal): no `held.status` update before the second move fails the PO director submit with 409; approving in a second transaction fails the rollback probe; exempting admin in `assertUninvolved` fails the four PO admin cases; a director submit that still sends the submitted notice fails the quotation director submit; exempting admin in the quotation `assertApprover` fails `keeps four-eyes for an admin: 403 to approve and reject a version they created or last edited` (added after this mutation first survived).

Assertions changed outside the listed ones: `lets exactly one of two concurrent approvals through` counts 2 emits (owner record and broadcast) for the one approval. `notifyCreator` now skips the creator when they are the actor, on reject too; only the director can reach that path. Review: PASS (code-auditor); Lows 1, 3 and 4 fixed (approve doc comment, a test name, a spec comment). Open Low: the quotation owner record is sent even when the owner is the approver (unchanged behavior, D-04 "as today"), unlike the PO creator record. Open for GATE-DONE: AC-05 says "created, edited or submitted", while quotation four-eyes checks only the creator and the last editor, as before (D-03 keeps the existing checks for other roles); covering the submitter would be a behavior change needing a stored submitter. The quotation spec file's working copy has CRLF line endings that `prettier --check` flags as a whole-file change; `npm run lint` passes and `.gitattributes` normalizes to LF on commit.
