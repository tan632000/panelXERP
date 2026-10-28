# Task 03 — Locations, item barcode / default location / minimum stock, scan resolve, price permissions

Status: done

## Outcome
The warehouse has named locations; each item can carry an optional barcode, default location and minimum stock; any scanned value resolves to one active item; the item's reference price is visible only to `reference_price:read` holders, so storekeepers never see it.

## Scope
- In: catalog feature `location` (D-01): `code` (e.g. `A-01-02`, varchar(32), unique among active, case-insensitive), `name`, `note`, `is_active`; CRUD `/catalog/locations`, `location:read|create|update|delete`; deleting a location set as an active item's default → 409.
- Item columns (migration on `items`, `backend/src/plugins/catalog/item/entities/item.entity.ts:9-43`): `barcode` varchar(64) NULL, unique among active case-insensitive; `default_location_id` INT NULL → `locations(id)`; `min_stock numeric(18,3)` NULL, ≥ 0 (blank = no alert, D-15).
- `PATCH /items/:id/stock-settings` (`item:stock_settings`) edits only those three fields; the existing item create/update DTOs do not accept them.
- D-12 cross-uniqueness: barcode equal (case-insensitive) to another active item's barcode or code → 409; creating/renaming an item whose code equals another active item's barcode → 409 (`item.service.ts`, import path `item-import.service.ts`).
- `GET /items/resolve?code=<value>` (`item:read`): trimmed value; active item by barcode, else by code; 404 `{ message: 'No item for <value>' }`; returns id, code, name, unit, brand, barcode, default location code.
- Permissions (R-03, D-08): the catalog item feature declares `item:stock_settings`, `reference_price:read` and `purchase_price:read` (the latter has no consumer here; it is declared now so the seed stores it before task-05 uses it); task-01's PENDING entries for them are removed. `referencePrice` is omitted from every item response (list, detail, resolve, picker) when the actor lacks `reference_price:read`.
- D-19 helper: create `backend/src/kernel/shared/testing/money-keys.helper-spec.ts` (the shared money-key list + `expectNoMoneyKeys(json, allowed?)` walking the whole JSON tree).
- Frontend: locations page `/catalog/locations`; item form "Kho" section (barcode, default location select, min stock) shown to `item:stock_settings`; item list columns barcode, location, min stock; reference price column hidden without `reference_price:read`. On login and logout the query cache is cleared (`frontend/src/kernel/core/auth/AuthContext.tsx:275` has no cache handling today), so a storekeeper never sees data cached for a previous user.
- Out: stock per location, location capacity, Excel import of the new fields.

## Coverage
- CP-03

## Ownership
- Create: `backend/src/plugins/catalog/location/`, `frontend/src/plugins/catalog/location/`, `frontend/src/app/[locale]/catalog/locations/`, item migration under `backend/src/plugins/catalog/item/database/migrations/`, `backend/src/plugins/catalog/item/services/item-stock-settings.service.ts` (+ spec), `backend/src/kernel/shared/testing/money-keys.helper-spec.ts`
- Modify: `backend/src/plugins/catalog/item/` (entity, permissions, service, import service, controller, DTOs, specs), `frontend/src/plugins/catalog/item/components/` (`ItemFormFields.tsx`, `ItemTable.tsx`), `frontend/src/kernel/core/auth/AuthContext.tsx` (+ its test), `backend/src/plugins/catalog/catalog.features.ts`, shared registration files
- Read: `backend/src/kernel/core/database/soft-delete-unique-index.spec.ts`

## Steps
1. Location entity/migration/CRUD + reference check from items.
2. Item migration (three columns, partial unique index on `lower(barcode)` excluding deleted rows).
3. Stock-settings service + endpoint; cross-uniqueness in create/update/import.
4. Resolve endpoint; permission declarations; `referencePrice` stripping applied to every item response.
5. Money-key helper; frontend pages/sections; cache clearing on login/logout.
6. Specs: barcode duplicate 409; barcode = other item's code 409; new item code = other's barcode 409; resolve by barcode, by code in other case, unknown → 404; deleted item's barcode no longer resolves; `expectNoMoneyKeys` on storekeeper responses of item list, detail and resolve; sales item detail still has `referencePrice`; storekeeper PATCH `/items/:id` → 403, stock-settings → 200; frontend: after logout + login as another user the item query refetches.
7. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (items), AC-04 (locations, barcode), AC-05 (resolve half).

## Dependencies
- task-02-suppliers.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/services/item-stock-settings.service.spec.ts && test -f src/plugins/catalog/location/services/location.service.spec.ts && test -f src/kernel/shared/testing/money-keys.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/catalog src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/catalog/location/tests/location-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/catalog src/kernel/core/auth" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/catalog/item/services/item-stock-settings.service.spec.ts`, `src/plugins/catalog/location/services/location.service.spec.ts`, `src/plugins/catalog/item/item.controller.spec.ts` (resolve + money keys), frontend `src/plugins/catalog/location/tests/location-list.test.tsx`, the AuthContext cache test, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: known after P1; permission-labels run proven runnable on 2026-10-27 (see task-02 Reachability).
- Oracle: exit 0; the Step 6 cases produce the stated codes/keys; permission-labels 0 skipped.
- Counterexample: removing the cross-uniqueness check must fail "barcode = other item's code → 409"; returning `referencePrice` unconditionally must fail the storekeeper money-key assertion.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/services/item-stock-settings.service.spec.ts && test -f src/plugins/catalog/location/services/location.service.spec.ts && test -f src/kernel/shared/testing/money-keys.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/catalog src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/catalog/location/tests/location-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/catalog src/kernel/core/auth" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: c62ae7b56660e21f6b5d64b259bb74e5cf6f098a
Head: ffb6fa6f1e29274edf427734f64d21c4d4ef0688f297b9694d19f20cbe456626
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/services/item-stock-settings.service.spec.ts && test -f src/plugins/catalog/location/services/location.service.spec.ts && test -f src/kernel/shared/testing/money-keys.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/catalog src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/catalog/location/tests/location-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/catalog src/kernel/core/auth" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
No migrations are pending
> panelxerp-backend@0.0.1 seed
  - director: purchase_request:read, stock:availability, stock:read, stock:ledger, material:read, stock_receipt:read, stock_issue:read, stock_return:read, stocktake:read, stocktake:approve
  - salesManager: stock:availability, stock:read, stock:ledger, material:read
  - sales: stock:availability, material:read
  - engineeringLead: stock:availability, material:read, purchase_request:read, purchase_request:create
  - engineer: stock:availability, purchase_request:read, purchase_request:create
  - purchasing: purchase_order:read, purchase_order:create, purchase_order:update, purchase_order:submit, purchase_order:cancel, purchase_order:close, stock:availability, stock:read, stock:ledger, material:read, stock_receipt:read, stock_issue:read, stock_return:read, stocktake:read
  - storekeeper: stock:availability, stock:read, stock:ledger, material:read, purchase_order:read, purchase_request:read, purchase_request:create, stock_receipt:read, stock_receipt:create, stock_issue:read, stock_issue:create, stock_return:read, stock_return:create, stocktake:read, stocktake:create, stocktake:update, stocktake:submit, stocktake:cancel
PASS src/plugins/catalog/location/location.controller.spec.ts (12.618 s)
PASS src/plugins/catalog/item/item.controller.spec.ts (13.314 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/catalog/location/services/location.service.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (8.445 s)
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (21.59 s)
PASS src/plugins/catalog/_shared/gateways/catalog-gateway.spec.ts
PASS src/plugins/catalog/_shared/gateways/reference-check-registry.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
Test Suites: 15 passed, 15 total
Tests:       188 passed, 188 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (30 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 3160ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/catalog/item/tests/item-form-modal.test.tsx (1 test) 347ms
 ✓ src/plugins/catalog/item/tests/item-import-dialog.test.tsx (5 tests) 433ms
 ✓ src/kernel/core/auth/tests/auth-query-cache.test.tsx (2 tests) 105ms
 ✓ src/plugins/catalog/location/tests/location-list.test.tsx (4 tests) 501ms
 ✓ src/plugins/catalog/item/tests/item-list.test.tsx (8 tests) 1183ms
 Test Files  5 passed (5)
      Tests  20 passed (20)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 4173ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
Exit: 0
```
No test in the run above was skipped: backend 15 suites / 188 tests, including the real-Postgres `item-identifier-lock.spec.ts`; frontend 5 files; permission-labels ran with the backend mounted (6 passed, 0 skipped). The seed's pending-scope list no longer names `reference_price`, `purchase_price`, `location` or `item:stock_settings`, so those grants are now stored. Pre-change run: the Command exited 1 at the missing probe `item-stock-settings.service.spec.ts`. Extra evidence (not the canonical command), from the implementer after repair round 1: full backend jest 104 suites / 1371 passed; full frontend 147 files passed, 1 skipped / 1208 passed, 6 skipped (permission-labels skips in-container; proven above with the mount).

Negative controls, run by the controller on a disposable copy under the backend container's `/tmp/nc` (deleted afterwards):
- Cross-uniqueness check limited to `barcode` only → 3 failed. These were "ItemController › answers 409 to a barcode already used as a barcode or as another item code", "ItemStockSettingsService › answers 409 to a barcode equal to another active item barcode or code, in any case" and "… when a concurrent write wins the barcode index".
- `presentItem` returning the item unconditionally → "ItemController › hides every money key from the storekeeper on list, detail, resolve and stock settings" failed at `expectNoMoneyKeys`.
- The implementer removed `queryClient.clear()`; both AuthContext cache tests failed, and the line was restored.

Review (code-auditor), round 1: FAIL.
- Critical: routes `/items/...` against spec `/catalog/items/...`. Resolved by user decision, amendment in plan.md Review log.
- High: a deactivated default location blocked every stock-settings save.
- Mediums: two-call create, location delete race, code↔barcode race.
- All of these were fixed in repair round 1, together with Lows (a) and (b).

Re-review: PASS, Low only.

Live check after restarting the backend and frontend (Turbopack cache cleared once when /login returned 404), logged in as `storekeeper`:
- `/catalog/locations` renders; create BRW-T03-A appears; `brw-t03-a` shows "Mã vị trí đã tồn tại trong hệ thống.".
- The item list has columns Mã vạch / Vị trí / Tồn tối thiểu and no reference-price column.
- Opening a test item (created by admin via API with price 1 234 000) shows only the "Kho" section. Saving barcode 8931234567890, location BRW-T03-A and min stock 5 shows them in the list. The DB still holds reference_price 1234000.
- API as storekeeper:
  - list/detail carry no `referencePrice`; admin detail still has it.
  - `/items/resolve` by barcode → 200 with `defaultLocationCode`.
  - DELETE the location in use → 409.
  - deactivate it → 200, then stock-settings re-save with the same location and new min stock → 200.
  - PATCH `/items/305` → 403.
- Reopening the form shows the inactive location still selected.
- The test item and location were deleted by targeted SQL (counts 0) and the browser was closed. Screenshots are in the session scratchpad `browser/p2-t03-*.png`.

Known limitations:
- Lock-order note for later tasks (review Low): stock-settings takes advisory `item-identifier` → location `FOR UPDATE` → item row; location delete takes location `FOR UPDATE` only. These are not yet listed in D-04. A later task that locks a location after `items FOR SHARE` must place location before items.
- Advisory keys are sorted by string, not by `hashtext` value. Two concurrent imports with a hash collision could deadlock; this is very unlikely, and Postgres aborts one.
- Item detail/create/update responses carry `defaultLocationId` without the `defaultLocation` object (list/resolve have it). The select falls back to the raw id label.
- `director`, `engineeringLead` and `purchasing` hold `item:*`, so they implicitly get `item:stock_settings`.
- The location select loads at most 100 locations. The current one is always kept.
- The "Thêm" modal may flash the previously created item's title for one frame after reopening.
- Test-helper change outside Ownership: `crm/_shared/crm-fake-repo.helper-spec.ts` (`query` mock, `getRepository(entity)`). An import-dialog reason mapping was added in `ItemImportDialog.tsx`.
- Excel import of the new fields is out of scope.
- Per-row edit buttons sit in a horizontally scrolled column the browser tool cannot click; the browser check opened the form through a DOM click.
