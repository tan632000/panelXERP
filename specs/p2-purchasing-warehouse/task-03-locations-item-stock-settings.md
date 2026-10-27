# Task 03 — Locations, item barcode / default location / minimum stock, scan resolve, price permissions

Status: pending

## Outcome
The warehouse has named locations; each item can carry an optional barcode, default location and minimum stock; any scanned value resolves to one active item; the item's reference price is visible only to `reference_price:read` holders, so storekeepers never see it.

## Scope
- In: catalog feature `location` (D-01): `code` (e.g. `A-01-02`, varchar(32), unique among active, case-insensitive), `name`, `note`, `is_active`; CRUD `/catalog/locations`, `location:read|create|update|delete`; deleting a location set as an active item's default → 409.
- Item columns (migration on `items`, `backend/src/plugins/catalog/item/entities/item.entity.ts:9-43`): `barcode` varchar(64) NULL, unique among active case-insensitive; `default_location_id` INT NULL → `locations(id)`; `min_stock numeric(18,3)` NULL, ≥ 0 (blank = no alert, D-15).
- `PATCH /catalog/items/:id/stock-settings` (`item:stock_settings`) edits only those three fields; the existing item create/update DTOs do not accept them.
- D-12 cross-uniqueness: barcode equal (case-insensitive) to another active item's barcode or code → 409; creating/renaming an item whose code equals another active item's barcode → 409 (`item.service.ts`, import path `item-import.service.ts`).
- `GET /catalog/items/resolve?code=<value>` (`item:read`): trimmed value; active item by barcode, else by code; 404 `{ message: 'No item for <value>' }`; returns id, code, name, unit, brand, barcode, default location code.
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
6. Specs: barcode duplicate 409; barcode = other item's code 409; new item code = other's barcode 409; resolve by barcode, by code in other case, unknown → 404; deleted item's barcode no longer resolves; `expectNoMoneyKeys` on storekeeper responses of item list, detail and resolve; sales item detail still has `referencePrice`; storekeeper PATCH `/catalog/items/:id` → 403, stock-settings → 200; frontend: after logout + login as another user the item query refetches.
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
