# Task 07 — Estimate pricing step and quotation gate

Status: done

## Outcome
Engineers submit quantities only; an `estimate:price` holder fills unit costs and cost lines on the submitted revision and marks it priced; a quotation can only be built on a priced estimate; existing estimates stay quotable (D-07, D-08).

## Scope
- In:
  - Migration in `sales/estimate/database/migrations/<Date.now()>-add-estimate-pricing.ts`: nullable `priced_at timestamptz`, `priced_by int` on `sales_estimate_revisions`; backfill `priced_at = submitted_at, priced_by = submitted_by WHERE status IN ('submitted','superseded')`; `down()` drops both.
  - `estimate-revision.entity.ts` (beside `:43-47`) gains both columns; `estimate-revision.util.ts:47-57` view and `EstimateDetail.revisions` (`estimate.service.ts:83-88,190-198`) expose `pricedAt`, `pricedBy`; the list item of `findAll` (`estimate.service.ts:79-81,142-159`) also carries `latestPricedAt` (the latest revision's `priced_at`, null when unpriced or a draft) for the request section's chip (R-15).
  - Draft side: `bom-line.dto.ts:41-53` loses `unitCost` from `CreateBomLineDto` (and so `UpdateBomLineDto`); `estimate-edit.service.ts:154` uses the reference price only; `:172-174` goes; cost-line methods `:192-240` leave the draft editor.
  - Create `estimate-pricing.service.ts`: `setUnitCost`, `addCostLine`, `updateCostLine`, `deleteCostLine`, `complete`. Each locks estimate then request `FOR UPDATE` (order of `estimate.service.ts:397-412`), checks visibility with `dataScope.assertVisible` (sales see their own requests only), requires the latest revision `submitted` with `priced_at IS NULL` and the request `estimated` (409 otherwise), recalculates (`recalculateRevision`) and returns the presented revision (task-06 util). `complete` answers 400 listing item codes while any BOM line has unit cost 0, else sets `priced_at = now()`, `priced_by = actor`.
  - `estimate.controller.ts`: `PATCH :id/bom-lines/:lineId/unit-cost` and `POST :id/price` under `ESTIMATE_PRICE`; the cost-line routes (`:292-344`) switch to `ESTIMATE_PRICE` and the pricing service. New `PriceBomLineDto { unitCost }` (bounds of `MAX_UNIT_COST`).
  - `estimate-read.port.ts:59-65`: the submitted revision counts only when `pricedAt` is set; doc comment updated. Quotation 409 text `The request has no submitted estimate to quote.` (`quotation.service.ts:264`, `quotation-version.service.ts:199`) → `The request has no priced estimate to quote.`
  - Fixtures and specs that encode the old flow:
    - The three e2e suites post `unitCost` on a draft BOM line and quote straight after the engineer's submit (R-01): `test/sales-chain.e2e-spec.ts:289`, `test/inventory-chain.e2e-spec.ts:480`, `test/production-chain.e2e-spec.ts:464` (their apps enable `forbidNonWhitelisted`, `sales-chain.e2e-spec.ts:131`, `inventory-chain.e2e-spec.ts:216`, `production-chain.e2e-spec.ts:236`). In each: drop `unitCost` from the draft call, then as `sales_a` (or the suite's sales actor) `PATCH …/bom-lines/:lineId/unit-cost` with the old figure and `POST :id/price` before the quotation is created.
    - `quotation-db.helper-spec.ts:310-332` `estimatedRequest` passes `unitCost` to `addBomLine` → price through the pricing service as `manager`, then `complete`. Every quotation, order and production spec built on it inherits this.
    - `quotation-version.service.spec.ts:211` asserts the old 409 text → new text.
    - `estimate.service.spec.ts`, `estimate-race.spec.ts`, `estimate-read.port.spec.ts`, `estimate.controller.spec.ts`: any case that sets a draft unit cost or edits cost lines on a draft moves to the pricing routes.
    - SQL fixtures inserting submitted revisions (`estimate-fixture.helper-spec.ts`, `order-material-fixture.helper-spec.ts`, `bom-item-link.migration.spec.ts`): set `priced_at` where the revision is later read through `EstimateReadPort`; list each in the Receipt.
- Out: the UI (task-10); re-opening a priced revision (D-07 break signal).

## Coverage
- CP-06

## Ownership
- Create: migration above, `backend/src/plugins/sales/estimate/services/estimate-pricing.service.ts`, `backend/src/plugins/sales/estimate/dto/price-bom-line.dto.ts`, `backend/src/plugins/sales/estimate/services/estimate-pricing.service.spec.ts`
- Modify: `estimate-revision.entity.ts`, `utils/estimate-revision.util.ts`, `dto/bom-line.dto.ts`, `services/estimate-edit.service.ts`, `services/estimate.service.ts` (view fields only), `estimate.controller.ts`, `estimate.module.ts`, `backend/src/plugins/sales/_shared/ports/estimate-read.port.ts`, `quotation.service.ts:264`, `quotation-version.service.ts:199`
- Modify (fixtures/specs): as listed in Scope, including `backend/test/sales-chain.e2e-spec.ts`, `backend/test/inventory-chain.e2e-spec.ts`, `backend/test/production-chain.e2e-spec.ts`

## Steps
1. Pricing spec (service level): engineer submits → `pricedAt` null; salesB (not owner) → 404; salesA sets a unit cost, adds a cost line, `complete` → 400 naming the zero-cost item, then 200 after pricing it; a second `complete` → 409; a unit-cost edit after `complete` → 409.
2. Gate: quotation create on the unpriced estimate → 409 with the new text; after `complete` → 201. A draft quotation built on a priced revision, then the engineer revises and submits → refresh → 409 until the new revision is priced; submit of that draft → 409 (`quotation-approval.service.ts:104-112`).
3. Revise (D-08): the new draft carries the copied unit costs and cost lines; its `pricedAt` is null after submit.
3b. Controller spec (through `RolesGuard` with `seededRolePermissions`, R-13): LEAD and engineer A each get 403 on `PATCH :id/bom-lines/:lineId/unit-cost`, `POST :id/price`, and `POST`/`PATCH`/`DELETE` of the cost-line routes; SALES_A on the same estimate gets 200.
4. Draft DTO: `POST .../bom-lines` with `unitCost` → 400 (whitelist); without it → line cost = item reference price.
5. Migration spec on a scratch schema: submitted and superseded rows get `priced_at = submitted_at`; drafts stay null; `down()` removes the columns.
6. Implement; `npm run validate:migrations`; `npm run migration:run` on the dev DB.
7. Live re-seed (R-08; moved here from task-11 so the task-10 live walk runs on the new grants): `SEED_SCOPE=core npm run seed` (`seed-runner.ts:2-12`). A role an administrator edited keeps its permissions (`seed-roles.ts:349-356`): if the log names `director`, `engineer`, `engineeringLead`, `sales` or `salesManager` as kept, stop and report it.

## Acceptance
- AC-09, AC-10, AC-11.

## Dependencies
- task-06-engineering-no-money.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales src/plugins/inventory/material src/plugins/production && npm run test:e2e -- --ci && SEED_SCOPE=core npm run seed"`
- Named probe: `estimate-pricing.service.spec.ts` (Steps 1, 3), quotation specs (Step 2), `estimate.controller.spec.ts` (Steps 3b, 4), the migration case (Step 5), the three e2e chains (pricing before quotation), the seed log (Step 7).
- Reachability: known.
- Oracle: exit 0, 0 skipped; the quotation suites and the three e2e chains pass on priced estimates; the dev DB keeps every existing estimated request quotable; the seed log names none of the five roles as kept.
- Counterexample: gating only `QuotationService.create` must fail the refresh and submit cases; a migration without backfill must fail Step 5; leaving engineeringLead on `estimate:*` must fail the LEAD 403 in Step 3b; allowing price edits after `complete` must fail Step 1.
- Artifacts: the dev DB keeps the migrated columns.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales src/plugins/inventory/material src/plugins/production && npm run test:e2e -- --ci && SEED_SCOPE=core npm run seed"
Exit: 0
Base: 13731aa853301ceb3b3a41b9f26dc1db3ab36dae
Head: 7f8a2d95b0f89ee551292f1086c5ce027a6cf4fb9bb6d9e56ccf6151a2a07d25
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales src/plugins/inventory/material src/plugins/production && npm run test:e2e -- --ci && SEED_SCOPE=core npm run seed"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales src/plugins/inventory/material src/plugins/production
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts (19.605 s)
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts (21.4 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (21.459 s)
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts (27.568 s)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts (12.973 s)
PASS src/plugins/sales/estimate/services/estimate-pricing.service.spec.ts (6.405 s)
PASS src/plugins/sales/estimate/database/estimate-pricing.migration.spec.ts
Test Suites: 50 passed, 50 total
Tests:       762 passed, 762 total
Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
> panelxerp-backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json --ci
PASS test/sales-chain.e2e-spec.ts (32.352 s)
PASS test/production-chain.e2e-spec.ts (35.565 s)
PASS test/app.e2e-spec.ts (37.848 s)
PASS test/inventory-chain.e2e-spec.ts (42.213 s)
Test Suites: 4 passed, 4 total
Tests:       4 passed, 4 total
> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts
VERIFY_EXIT=0
```

This run started after the last code edit and finished on the bytes committed in 13731aa; 0 skipped; on the host the Command was wrapped in `timeout 1500`. Seed order: the Command runs the e2e suites before the seed, so the first implementation run failed three chains with 403 (the dev DB still held the old grants); `SEED_SCOPE=core npm run seed` (Step 7) was run once on its own, then the Command was rerun unchanged. The seed log in this run names no role as kept (no `[seed-roles] Kept` line). Named probes: `estimate-pricing.service.spec.ts` (unpriced after submit, 404 to a non-owner, 400 naming the zero-cost item, 409 on a second complete and on every edit after it, revise copies costs and stays unpriced), `quotation-version.service.spec.ts` and `quotation-approval.service.spec.ts` (create, refresh and submit refused with `The request has no priced estimate to quote.` until priced), `estimate.controller.spec.ts` (403 to engineer A and the engineering lead on the unit-cost, price and three cost-line routes, 200 to SALES_A; draft `unitCost` gives 400; a draft line costs the reference price), `estimate-pricing.migration.spec.ts` (backfill of submitted and superseded, drafts null, `down()` drops both columns), `estimate-race.spec.ts` (two concurrent completes: one wins; complete racing revise), and the three e2e chains (sales prices before the quotation). SQL fixtures: `order-material-fixture.helper-spec.ts` and `bom-item-link.migration.spec.ts` insert submitted revisions but never read them through `EstimateReadPort`, so neither sets `priced_at`; `estimate-fixture.helper-spec.ts` prices through the pricing service.

Pre-change run: lint failed on the unresolved pricing and migration modules; 13 suites failed to load (`Could not locate module` for the pricing service and the migration), 38 suites (508 tests) passed; no new assertion ran, so mutations stand in. Counterexamples (each restored, bytes equal): gating only `QuotationService.create` fails the refresh/submit case; a migration without backfill fails the migration spec; engineeringLead back on `estimate:*` fails the LEAD 403 case; price edits after `complete` fail the frozen case. Own mutations, all caught: pricing while the request is not estimated, a non-owner pricing, `complete` accepting a zero cost, `latestPricedAt` from any priced revision, revise copying the priced state, the draft DTO accepting `unitCost`, cost-line routes on `estimate:update`, a line of another estimate, the read port ignoring `pricedAt`.

Dev DB after the run: migration `AddEstimatePricing1793890216777` applied (artifact); roles re-seeded as in task-01 (director `*:*`; engineer and engineeringLead without `reference_price:read` or `estimate:price`; sales and salesManager with `estimate:price`); every submitted or superseded revision is priced except three leftover spec revisions of 2026-11-01 (`submitted_at` NULL, their requests `won`), which the backfill cannot fill; no request is currently `estimated`; no spec rows left by these runs. Review: PASS (code-auditor). Open Lows: `toListItems` loads every revision of the page; the pricing `lock()` repeats `lockForWrite`; the draft 409 case covers `setUnitCost` and `complete` but not the three cost-line methods; the UI still sends draft `unitCost` until task-10.
