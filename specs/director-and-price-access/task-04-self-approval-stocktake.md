# Task 04 — Director self-approval: stocktake

Status: pending

## Outcome
A stocktake submitted by the director is approved and posted in the same transaction; every approved stocktake notifies storekeeper and purchasing; the director is never refused by four-eyes, and admin still is.

## Scope
- In:
  - `stocktake-approval.service.ts`:
    - `submit` (`:62-80`): for `actor.role === 'director'`, after the `counting → submitted` move, set `held.status = SUBMITTED` (`moveStocktake` guards on the status held at lock time and never refreshes it, `stocktake-lock.util.ts:67-69`; GATE-REVIEW R-02), then run the approve body of `:120-137` in the same transaction (`postDifferences`, `submitted → approved` with `approved_by`), then `shortageAlerts.afterCommit` as `approve` does (`:135`).
    - `assertUninvolved` (`:273-…`) returns early for the director.
    - After commit of any approval (normal or self): emit `inventory.stocktake.approved` (new constant in `stocktake.constant.ts`) to roles `storekeeper`,`purchasing`, `requiredScope: 'stocktake:read'`, `excludeUserIds: [actor]`, link `/inventory/stocktakes/:id`, payload `{ stocktakeId, code }`. A failed notice is logged, never raised (pattern of `purchase-order-approval.service.ts:295-300`).
  - `stocktake-db.helper-spec.ts:119-132` lists its providers by hand without `NotificationService`, so every stocktake spec fails DI at `compile()` (R-05): provide a real `NotificationService` on the harness data source (pattern of `production-db.helper-spec.ts:196-200`) and delete `inventory.stocktake.%` notices whose `payload.stocktakeId` is one of the harness's counts in its cleanup. `test/inventory-chain.e2e-spec.ts:245-251` cleans notices by order, request, quotation, estimate and purchase order ids only: add `OR (payload->>'stocktakeId')::int = ANY(...)` for the stocktakes it creates (`:412`).
  - `stocktake.module.ts`: import `AuditModule` (the service has no `NotificationService` today, `stocktake-approval.service.ts:53-60`; `AuditModule` exports it, `audit.module.ts:23`).
  - Existing spec that encodes the old behavior: `stocktake-approval.service.spec.ts:131-172` uses `h.as(<user>, 'director')` as the involved counter/submitter refused with 403 → rewrite those refusals with `admin`-role actors; add the director cases below.
- Out: a stocktake submitted notice (none exists today; not requested).

## Coverage
- CP-03

## Ownership
- Modify: `backend/src/plugins/inventory/stocktake/services/stocktake-approval.service.ts`, `backend/src/plugins/inventory/stocktake/stocktake.module.ts`, `backend/src/plugins/inventory/stocktake/constants/stocktake.constant.ts`
- Modify (spec/helpers): `plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts`, `plugins/inventory/stocktake/stocktake-db.helper-spec.ts`, `backend/test/inventory-chain.e2e-spec.ts` (cleanup only)

## Steps
1. Spec (mandatory, R-02): the director opens, counts and submits → HTTP 200, a count with one shortfall and one gain → status `approved`, one `COUNT_ADJUSTMENT` movement per changed line (no duplicates), `approved_by` = director, one `inventory.stocktake.approved` row for storekeeper and purchasing excluding the director.
2. Spec: a count whose result would go below zero, submitted by the director → 409, the count stays `counting`, no movement, no notice.
2b. Spec (R-14 c): the notice is sent only after commit — spy on `dataSource.transaction` and on `NotificationService.emit` and assert `emit` is first called after the transaction promise resolved; and a director submit whose `moveStocktake` conflicts (status changed by a concurrent cancel committed first) answers 409 with 0 `inventory.stocktake.approved` rows.
3. Spec: storekeeper submits, an admin who counted is refused 403; the director who counted approves → 200 and the notice row exists.
4. Implement.

## Acceptance
- AC-05 (stocktake), AC-06.

## Dependencies
- task-03-self-approval-quotation-po.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/inventory/stocktake && npm run test:e2e -- --ci"`
- Named probe: `stocktake-approval.service.spec.ts` (director self-approval 200, negative-stock refusal, after-commit emit, admin four-eyes); `inventory-chain.e2e-spec.ts` (cleanup leaves no stocktake notice).
- Reachability: known.
- Oracle: exit 0, 0 skipped; movement count equals changed lines; the refused submit leaves status `counting`.
- Counterexample: a second `moveStocktake` on the stale `held` must fail Step 1 with 409; posting in a second transaction must fail Step 2 (a `submitted` count remains); emitting inside the transaction must fail Step 2b (emit before the transaction resolves, or a row after the conflicting submit).
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
