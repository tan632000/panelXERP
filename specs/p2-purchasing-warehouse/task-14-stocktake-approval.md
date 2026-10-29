# Task 14 — Stock count by scanning, posted only on director approval

Status: done

## Outcome
A storekeeper counts the whole warehouse or one location by scanning while stock keeps moving, seeing the book quantity next to the counted one; a director who counted nothing approves, and only then do the differences against the book quantity at counting time post to the ledger; a first count sets opening balances.

## Scope
- In: feature `inventory/stocktake` (permission module `stocktake` declared here), code `KK_YYYY_NNNN`. Header: `scope` `all|location`, `location_id` NULL, status `counting → submitted → approved`, `cancelled`; `created_by`, `submitted_by/at`, `approved_by/at`, `reject_reason`, `cancel_reason`. One open count at a time: partial unique index over status `counting|submitted` (D-14) → second create 409. Lines: `item_id` (unique per count), `counted_qty` NULL, `book_qty` NULL, `counted_at`, `unit_cost` and `value` (set at approval). Count log `stocktake_count_log` (line, user, counted quantity, book quantity, at) — one row per save.
- Create (`stocktake:create`): `all` → lines for active items with a balance row and `on_hand ≠ 0`; `location` → active items whose default location is it. A scanned item without a line gets one.
- Count (`stocktake:update`, status `counting`, header `FOR UPDATE` → that item's balance `FOR SHARE`): `POST /inventory/stocktakes/:id/scan { code }` resolves (D-12) and adds 1; `PATCH /inventory/stocktakes/:id/lines/:itemId { countedQty }` sets it (≥ 0, `decimal.js`). Every save records `book_qty = on_hand` at that moment and appends a log row.
- Submit (`stocktake:submit`) `counting → submitted`. Reject (`stocktake:approve`, reason) `submitted → counting`; lines stay and can be recounted. Cancel (`stocktake:cancel`) from `counting|submitted`.
- Approve (`stocktake:approve`; actor ∈ {creator, submitter} ∪ every user in the count log → 403): header `FOR UPDATE` + `WHERE status = 'submitted'` → balances of counted lines with `diff = counted − book ≠ 0` ascending (D-04) → if any `on_hand + diff < 0` → 409 naming the items, nothing posted; else post `count_adjustment` per line at D-06 cost (avg; when on hand is 0 the last `avg_cost_after`; else item `reference_price`; else 0); positive diffs `allocate`, negative diffs `deallocate` when `on_hand < reserved`. Uncounted lines never post. After commit: alerts.
- Visibility (user, Q3): the count and approval screens show `book_qty` and `diff` to every `stocktake:read` holder; `unit_cost`/`value` only with `purchase_price:read` (D-19).
- Item delete veto (R-14): `registerItemCheck('inventory-stocktake', …)` → an item on a line of an open count → 409.
- Frontend `/inventory/stocktakes`: list, create (scope + location), counting screen with `ScanInput`, book next to counted quantity, editable counted quantity; approval screen for directors (book, counted, diff, value, reject with reason).
- Out: count freezing, line deletion, per-location stock.

## Worked example
1. Item A never moved, `reference_price` 50 000: counted 20 → book 0, diff +20.
2. Item B on hand 10, value 1 000 000: counted 9 (book 10, diff −1); an issue of 2 then posts (on hand 8, value 800 000).
3. Item C on hand 3: counted 1 (book 3, diff −2); an issue of 2 then posts (on hand 1).
4. Submit; a director approves → 409 naming C; nothing posted.
5. The director rejects with reason "đếm lại C" → `counting`; the storekeeper recounts C = 1 (book now 1, diff 0); submit; a director outside the count log approves → A on hand 20, value +1 000 000 (opening balance at reference price); B on hand 7, value −100 000 (avg 100 000); C no movement; uncounted item D no movement.
6. Approval by the storekeeper who scanned, by the submitter, or by a director who saved one count → 403.

## Coverage
- CP-14

## Ownership
- Create: `backend/src/plugins/inventory/stocktake/`, `frontend/src/plugins/inventory/stocktake/`, `frontend/src/app/[locale]/inventory/stocktakes/`
- Modify: `inventory.features.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `REF/backend/src/plugins/warehouse/finished-product-warehouse-receipt/_shared/stocktake/finished-product-stocktake-adjustment.service.ts` (approval pattern only)

## Steps
1. Entities/migration (open-count partial unique index, count log).
2. Services: create, scan/set, submit, reject, cancel, approve; item reference check.
3. Specs: worked example exact; second open count → 409; scan on a `submitted` count → 409; `expectNoMoneyKeys` on the storekeeper's count detail while `bookQty` is present; item delete with an open count line → 409.
4. Real-Postgres races: (a) two creates concurrently → one 409; (b) approve concurrent with an issue of the same item keeps D-03 and the final on hand equals book + diff + movements after counting; (c) approve vs cancel → exactly one succeeds.
5. Frontend counting + approval screens + tests.
6. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (count values), AC-04 (item veto), AC-08 (adjustment cost), AC-20.

## Dependencies
- task-13-supplier-return.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts && test -f src/plugins/inventory/stocktake/services/stocktake-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts`, `src/plugins/inventory/stocktake/services/stocktake-race.spec.ts`, frontend `src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres; permission-labels run proven in task-02.
- Oracle: worked-example figures exact; races as stated; real-DB specs 0 skipped.
- Counterexample: setting on hand to the counted quantity at approval (instead of adding the diff) must give B = 9; checking only the last counter of each line must let the director of step 6 approve.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts && test -f src/plugins/inventory/stocktake/services/stocktake-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 932ff7a47cac35e75870c33ddcfb99340d95cec0
Head: 690d7d51f38e62bf07a585d24e35befaa752329cc5a1a923293f7dda49e0e994
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts && test -f src/plugins/inventory/stocktake/services/stocktake-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (19.285 s)
PASS src/plugins/inventory/issue/services/issue-race.spec.ts (19.471 s)
PASS src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts (22.275 s)
PASS src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts (24.776 s)
PASS src/plugins/inventory/stocktake/services/stocktake-race.spec.ts (26.871 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (7.477 s)
PASS src/plugins/inventory/issue/services/workshop-return.service.spec.ts (5.931 s)
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (6.241 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (12.214 s)
PASS src/plugins/inventory/issue/services/issue.service.spec.ts (6.007 s)
PASS src/plugins/catalog/item/item.controller.spec.ts (6.344 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (6.043 s)
PASS src/plugins/inventory/stock/stock.controller.spec.ts (5.514 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (5.341 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/material/services/reservation-race.spec.ts
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (5.449 s)
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/catalog/item/services/item-label.service.spec.ts
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/catalog/item/utils/code128.util.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
Test Suites: 37 passed, 37 total
Tests:       377 passed, 377 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (37 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 4877ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx (7 tests) 1079ms
 ✓ src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx (3 tests) 1006ms
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests) 1489ms
 ✓ src/plugins/inventory/issue/tests/issue-screen.test.tsx (6 tests) 1988ms
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 1265ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 42ms
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests) 39ms
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests) 574ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (4 tests) 561ms
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests) 641ms
 Test Files  10 passed (10)
      Tests  55 passed (55)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 9506ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```

Negative proof (each counterexample applied alone, approval spec rerun, file restored byte-for-byte):
- on hand set to the counted quantity at approval (difference against today's stock) → steps 1–5 fail.
- only the last counter of each line barred → step 6 fails (the director who counted first could approve).
- the creator left out of the barred set → the creator-only case fails.

Reachability: backend restarted; `StocktakeModule dependencies initialized`, `Mapped {/api/v1/inventory/stocktakes, GET}`, `{…, POST}`, `{/:id, GET}`, `{/:id/scan, POST}`, `{/:id/lines/:itemId, PATCH}`, `{/:id/submit, POST}`, `{/:id/approve, POST}`, `{/:id/reject, POST}`, `{/:id/cancel, POST}`, `Nest application successfully started`; item veto registered as `inventory-stocktake`. Frontend routes `/inventory/stocktakes`, `/inventory/stocktakes/[id]`, sidebar item `stocktakes`.

Review: code-auditor FAIL (1 High: a recount with the same quantity was not saved; 1 Medium: creator and reject four-eyes untested) → fixed → re-review PASS (0 Critical / 0 High / 0 Medium); Lows recorded for GATE-DONE.
