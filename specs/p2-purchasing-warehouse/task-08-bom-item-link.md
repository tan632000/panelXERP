# Task 08 — Item link on quotation and order BOM snapshots, with backfill

Status: pending

## Outcome
Every quotation and order BOM line points at its catalog item — new lines when written, existing lines through a backfill that follows the estimate rather than today's catalog codes — so material demand can be computed without joining by code.

## Scope
- In (sales, D-02): migration adds `item_id INT NULL REFERENCES items(id)` + index to `sales_quotation_bom_lines` and `sales_order_bom_lines`, then backfills:
  - quotation BOM: quotation line `lower(tag)` + version `estimate_revision_id` → `sales_estimate_panels` (`revision_id`, `lower(tag)`; unique per revision, `backend/src/plugins/sales/estimate/database/migrations/1792856909735-init-estimate.ts:89-92`) → `sales_estimate_bom_lines` by `item_code`;
  - order BOM: order line `lower(tag)` + order `estimate_revision_id` the same way;
  - remaining NULLs: the single active item whose `lower(code)` matches; a match yielding two different item ids stays NULL; the migration logs the remaining NULL count.
- Writers: `snapshotEstimatePanels` (`backend/src/plugins/sales/quotation/utils/quotation-version.util.ts:196`) from `EstimateBomLineView.itemId` (`sales/estimate/utils/estimate-revision.util.ts:16`); `copyVersionTree` (`quotation-version.util.ts:246`) from the source quotation BOM line's `itemId`; order `copyLines` (`sales/order/services/order-convert.service.ts:180-210`) from the quotation BOM line. Entities gain `itemId` (nullable only for unlinked legacy rows).
- Out: reading demand (task-09), reservations (task-10).

## Coverage
- CP-08

## Ownership
- Create: migration under `backend/src/plugins/sales/order/database/migrations/`, `backend/src/plugins/sales/order/database/bom-item-link.migration.spec.ts`
- Modify: `backend/src/plugins/sales/quotation/entities/quotation-bom-line.entity.ts`, `backend/src/plugins/sales/order/entities/order-bom-line.entity.ts`, `backend/src/plugins/sales/quotation/utils/quotation-version.util.ts`, `backend/src/plugins/sales/order/services/order-convert.service.ts`, specs that assert the copied BOM shape (`backend/src/plugins/sales/quotation/services/quotation-version.service.spec.ts`, `backend/src/plugins/sales/order/services/order-convert.service.spec.ts`)
- Read: `backend/src/plugins/sales/estimate/utils/estimate-revision.util.ts`

## Steps
1. Migration with backfill; real-Postgres spec: fixture with two panels sharing an item, a panel tag stored as `msb-01` against `MSB-01`, a renamed catalog item, and a deleted-and-reused code → linked ids equal the estimate lines' ids, the reused code is not chosen; an ambiguous code stays NULL; `down` drops the columns.
2. Writers; specs: a new quotation, a revise (`copyVersionTree`) and the order copy carry `itemId` equal to the source line's, also when the catalog item was renamed or deleted after the estimate.
3. Full sales suite stays green.

## Acceptance
- AC-12.

## Dependencies
- task-07-purchase-orders.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/sales/order/database/bom-item-link.migration.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/sales src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- --ci sales-chain"`
- Named probe: `src/plugins/sales/order/database/bom-item-link.migration.spec.ts` (real Postgres backfill), the `itemId` cases in `quotation-version.service.spec.ts` and `order-convert.service.spec.ts`, `test/sales-chain.e2e-spec.ts` (regression)
- Reachability: compose Postgres; the full sales suite and the P1 e2e re-run because the snapshot writers change.
- Oracle: backfilled ids equal fixture ids; writer specs pass; real-DB and e2e specs 0 skipped.
- Counterexample: a backfill by `items.code` alone must pick the reused code and fail step 1; a case-sensitive tag join must leave `msb-01` NULL and fail.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
