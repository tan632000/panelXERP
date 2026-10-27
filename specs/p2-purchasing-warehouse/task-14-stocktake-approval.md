# Task 14 — Stock count by scanning, posted only on director approval

Status: pending

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
