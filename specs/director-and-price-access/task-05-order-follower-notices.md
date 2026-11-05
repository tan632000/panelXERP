# Task 05 — Order follower notices

Status: pending

## Outcome
Every update of a sales order — contract/delivery edit, cancel, production release, cancel after release or completion, stock issue — notifies its followers once each, never the actor (D-05).

## Scope
- In:
  - Create `backend/src/plugins/sales/_shared/services/order-follower-notifier.ts`: `notify(orderId, change, actorId, options?: { extra?, skipOwner?, skipRoles? })`, run after commit. Reads the header through `OrderMaterialReadPort.getOrder` (`order-material-read.port.ts:11-20`, gives `code`, `salesOwnerId`, `customerName`); emits the broadcast and the owner record of D-05 with event `sales.order.updated` (constant in the same file or `order.constant.ts`); logs and swallows a failure.
  - `sales-shared.module.ts`: provide and export it; import `AuditModule`.
  - Callers:
    - `order-edit.service.ts:43-81`: the transaction returns whether anything changed (`:63-67`); notify `edited` only then. `:88-133`: notify `cancelled` with `{ reason }` after `pending.afterCommit()` (`:131`).
    - `production-order-release.service.ts:93`: after `released`, notify `production_released` with `{ productionOrderCode }`, `skipOwner: true`. `:153-160`: only when `wasReleased`, notify `production_cancelled` with `{ productionOrderCode, reason }`, `skipOwner: true`.
    - `progress.service.ts:161`: when completed, notify `production_completed` with `skipOwner: true, skipRoles: ['productionManager']`.
    - `issue.service.ts:121`: after the shortage pass, notify `stock_issued` with `{ issueCode }` for the issue's own order. `Posted` (`:47-51`) carries only `id`, `orderIds` (the issue's order plus orders whose reservations moved, `:231`) and `itemIds` (R-15): `post()` also returns the header's `code` and `orderId`, and the notice uses `dto.orderId` and `posted.code`, never `orderIds[0]`.
  - Constructor and DI callers that break when `OrderEditService` and `StockIssueService` gain the notifier (R-04): `new OrderEditService(...)` at `order-convert.service.spec.ts:124`, `production-order-race.spec.ts:43`, `production-order.service.spec.ts:63`; the issue harness lists providers by hand without a notifier (`issue-db.helper-spec.ts:101-113`). Each passes or provides a real `OrderFollowerNotifier` over a real `NotificationService` on the spec's data source (pattern of `purchase-order-approval.service.spec.ts:116-120`) and deletes `sales.order.updated` notices for its orders in its cleanup.
  - The production harness cleanup deletes only `production.%` notices (`production-db.helper-spec.ts:319-321`): extend it to `sales.order.updated` for its orders, and add a `purchasing` actor to `ACTORS` (`:75-85`).
- Out: order creation notices (`order-convert.service.ts:226-266`, unchanged); bell wording (task-08).

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/sales/_shared/services/order-follower-notifier.ts`, `backend/src/plugins/sales/order/services/order-edit.service.spec.ts`
- Modify: `backend/src/plugins/sales/_shared/sales-shared.module.ts`, `backend/src/plugins/sales/order/services/order-edit.service.ts`, `backend/src/plugins/production/production-order/services/production-order-release.service.ts`, `backend/src/plugins/production/progress/services/progress.service.ts`, `backend/src/plugins/inventory/issue/services/issue.service.ts`
- Modify (specs/helpers): `plugins/production/production-order/production-db.helper-spec.ts`, `production-order/services/production-order.service.spec.ts` (release/cancel, constructor), `production-order/services/production-order-race.spec.ts` (constructor), `sales/order/services/order-convert.service.spec.ts` (constructor), `progress/services/progress.service.spec.ts` (complete), `inventory/issue/issue-db.helper-spec.ts` (providers, cleanup), `inventory/issue/services/issue.service.spec.ts` (issue)

## Steps
1. `order-edit.service.spec.ts` (DB; builds orders through `quotation-db.helper-spec.ts`, whose `notifications` is a `jest.fn()` (`:159`) and whose cleanup keeps notices (`:333-362`), so this spec constructs its own real `NotificationService` and `OrderFollowerNotifier` and deletes its `sales.order.updated` rows itself): salesA edits the delivery date → one broadcast (roles exactly `salesManager, purchasing, storekeeper, productionManager`, `material:read`, excluding salesA) and no owner record; salesManager edits → also one owner record for salesA; a save that changes nothing → no row; cancel → `change: 'cancelled'` with the reason.
1b. Rollback (R-14 b): a lifecycle hook that throws inside `cancel` after `moveOpenOrder` (the `failHook` pattern of `order-convert.service.spec.ts:101-113`) → 500, the order stays `open`, and 0 `sales.order.updated` rows exist for it.
2. Harness probes: release by manager → purchasing, storekeeper and salesMgr each read one `sales.order.updated`; salesA (owner) reads the production owner notice and no follower notice; manager reads none (actor). Cancel of a draft production order → none. Completion → productionManager reads only the production completion notice.
3. Issue spec: storekeeper issues for an order → owner and the four roles notified, the issuing storekeeper not.
4. Implement. The production harness lists its providers by hand (`production-db.helper-spec.ts:201-224`), so add `OrderFollowerNotifier` there; module wiring is proven only by the full-app e2e (`test/production-chain.e2e-spec.ts:225-241` imports `AppModule`).

## Acceptance
- AC-07.

## Dependencies
- task-02-director-bell-and-gates.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/order src/plugins/sales/_shared src/plugins/production src/plugins/inventory/issue && npm run test:e2e -- --ci"`
- Named probe: `order-edit.service.spec.ts` (edit, no-op edit, cancel, rollback), `production-order.service.spec.ts` (release, draft cancel), `progress.service.spec.ts` (completion), `issue.service.spec.ts` (stock issue).
- Reachability: known. Services through the DB specs; Nest wiring of `SalesSharedModule` → `AuditModule` through `npm run test:e2e` (full `AppModule` boot).
- Oracle: exit 0, 0 skipped; per-recipient counts exactly as in Steps 1-3.
- Counterexample: notifying inside the transaction must leave a row in Step 1b; using `orderIds[0]` must fail Step 3 when the issue moves another order's reservation; omitting `skipOwner` must give salesA two notices for one release; notifying on an unchanged save must fail the no-op case.
- Artifacts: none; test notices are deleted by the cleanup.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
