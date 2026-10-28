# Task 08 — Item link on quotation and order BOM snapshots, with backfill

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/sales/order/database/bom-item-link.migration.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/sales src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- --ci sales-chain"
Exit: 0
Base: 260c618d081344c84296caf003b4cef9e5a00b83
Head: eb01d2059cea5997b9d05bc3838f38dc42f30470fa8f8ef07cb5a9139ec431f6
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/sales/order/database/bom-item-link.migration.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/sales src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- --ci sales-chain"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
PASS src/plugins/sales/order/database/bom-item-link.migration.spec.ts
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts
PASS src/plugins/sales/order/services/order-convert.service.spec.ts
PASS src/plugins/sales/order/order.controller.spec.ts
PASS src/plugins/sales/request/request.controller.spec.ts
PASS src/plugins/sales/quotation/quotation.controller.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts
PASS src/plugins/sales/request/services/request-owner-race.spec.ts
PASS src/plugins/sales/request/services/request.service.spec.ts
PASS src/plugins/sales/estimate/estimate.controller.spec.ts
PASS src/plugins/sales/quotation/services/quotation-code.spec.ts
PASS src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/sales/_shared/ports/request-close-registry.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-document.util.spec.ts
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts
PASS src/plugins/sales/quotation/services/quotation-pricing.spec.ts
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/quotation/config/quotation-letterhead.config.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/sales/_shared/ports/request-status.port.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-pdf.render.spec.ts
Test Suites: 31 passed, 31 total
Tests:       608 passed, 608 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (33 files).
> panelxerp-backend@0.0.1 test:e2e
PASS test/sales-chain.e2e-spec.ts
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```
Counterexamples (controller runs, reverted): a backfill by `items.code` alone left the renamed item NULL and picked the reused code's new item (both backfill specs failed); a case-sensitive tag join left the `msb-01` lines on the renamed and reused items unlinked (both specs failed once the order's sensitive lines were moved to a lowercase tag); the catalog step without the estimate guard linked the ambiguous code to the active item holding it (`"ambiguous": 849` instead of null); dropping `itemId` from `copyVersionTree` failed the revise writer spec. Reachability: the migration ran on the compose database and logged 0 unlinked lines in both tables; the writers are the only three places that write these entities. Review: code-auditor PASS_WITH_WARNINGS (1 Medium: ambiguous rows fell through to the catalog step) → fixed with the NOT EXISTS guard and an active item on the ambiguous code → re-review PASS (0 Critical/High/Medium). The API views do not expose `itemId` (no contract change asked for).
