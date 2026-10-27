# Task 02 — Supplier master and the `inventory` plugin

Status: done

## Outcome
Purchasing maintains suppliers in a new `inventory` plugin (backend + frontend), registered like the P1 plugins; storekeepers read them.

## Scope
- In: plugin `inventory` (`dependsOn: ['catalog', 'sales']`, D-01) registered in `backend/src/kernel/platform/plugins/enabled-plugins.ts:21-25` and the frontend plugin catalog; feature `supplier`. Supplier (extends `BaseEntity`): `code` varchar(64) unique among active (case-insensitive, partial index excluding deleted rows — `soft-delete-unique-index.spec.ts` must pass), `name`, `tax_code`, `address`, `phone`, `email`, `contact_name`, `note`, `is_active`. CRUD `/inventory/suppliers` with list filter/sort/paging like `crm/customer`; permissions `supplier:read|create|update|delete`. Delete is soft; a supplier-reference check hook (in-plugin registry function, consumed by task-07) can veto it with 409. Frontend list + form under `/inventory/suppliers`; menu group "Mua hàng & Kho".
- Out: supplier price lists, payables (P5), supplier rating.

## Coverage
- CP-02

## Ownership
- Create: `backend/src/plugins/inventory/` (`inventory.plugin.ts`, `inventory.module.ts`, `inventory.features.ts`, `supplier/`), `frontend/src/plugins/inventory/` (`plugin.ts`, `inventory.features.ts`, `supplier/`), `frontend/src/app/[locale]/inventory/`
- Modify: shared registration files (plan.md); `seed-roles.panel.spec.ts` (drop `supplier` from PENDING_MODULES)
- Read: `backend/src/plugins/crm/customer/` (house CRUD pattern), `backend/src/plugins/sales/sales.plugin.ts`

## Steps
1. Plugin skeleton + feature registration; backend boots with `ENABLED_PLUGINS` default.
2. Entity, migration (unique partial index), DTOs, service, controller.
3. Frontend list/form, i18n vi/en, permission labels.
4. Specs: duplicate active code (different case) → 409; deleted code reusable; delete vetoed by a registered check → 409; `storekeeper` create → 403; `sales` read → 403.
5. Regenerate OpenAPI + `api.ts` (plan.md).

## Acceptance
- AC-04 (supplier half; the PO veto is wired in task-07).

## Dependencies
- task-01-roles-permissions-scope.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier/services/supplier.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/supplier src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier/tests/supplier-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/supplier" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/supplier/services/supplier.service.spec.ts`, `src/plugins/inventory/supplier/supplier.controller.spec.ts`, frontend `src/plugins/inventory/supplier/tests/supplier-list.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts` (supplier labels)
- Reachability: known after P1 (containers, compose Postgres for the uniqueness spec). The permission-labels run (`MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend …`) was proven runnable by the controller on 2026-10-27 before implementation (Git Bash, from the repo root: 1 file passed, 6 tests passed, 0 skipped, exit 0); `MSYS_NO_PATHCONV=1` and the absolute `$(pwd -W)` path are both required — a relative `./backend` mount becomes an empty volume and the test skips. If it skips or fails during this task, stop with `Status: blocked` and report; do not substitute another command.
- Oracle: exit 0; duplicate → 409; storekeeper create → 403; permission-labels: 1 file passed, 0 skipped.
- Counterexample: a unique index without `WHERE is_deleted = false` must fail `soft-delete-unique-index.spec.ts`.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier/services/supplier.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/supplier src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier/tests/supplier-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/supplier" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 38c97b1b2dbaf675706c55180cfd866f1f4eebf7
Head: fb7d1f5552ca43bb3c24053966172782751be6f744d077cb6fc535a34891cac7
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier/services/supplier.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/supplier src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier/tests/supplier-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/supplier" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
No migrations are pending
> panelxerp-backend@0.0.1 seed
  - director: reference_price:read, purchase_price:read, location:read, purchase_request:read, stock:availability, stock:read, stock:ledger, material:read, stock_receipt:read, stock_issue:read, stock_return:read, stocktake:read, stocktake:approve
  - purchasing: reference_price:read, purchase_price:read, location:read, purchase_order:read, purchase_order:create, purchase_order:update, purchase_order:submit, purchase_order:cancel, purchase_order:close, stock:availability, stock:read, stock:ledger, material:read, stock_receipt:read, stock_issue:read, stock_return:read, stocktake:read
  - storekeeper: item:stock_settings, location:read, location:create, location:update, location:delete, stock:availability, stock:read, stock:ledger, material:read, purchase_order:read, purchase_request:read, purchase_request:create, stock_receipt:read, stock_receipt:create, stock_issue:read, stock_issue:create, stock_return:read, stock_return:create, stocktake:read, stocktake:create, stocktake:update, stocktake:submit, stocktake:cancel
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (9.533 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (12.775 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (13.036 s)
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (18.646 s)
Test Suites: 8 passed, 8 total
Tests:       86 passed, 86 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (28 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 3523ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 511ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 4454ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
Exit: 0
```
No test in the run above was skipped: the permission-labels test ran with the backend mounted (6 passed, 0 skipped), as the Oracle requires. The seed's pending-scope warnings no longer list `supplier` for purchasing, director or storekeeper — those grants are now stored (implementer's read-only SQL: purchasing and director store `supplier:*`, storekeeper `supplier:read`). Pre-change run: the Command exited 1 at the missing probe `supplier.service.spec.ts`. Extra evidence (not the canonical command): implementer's full backend jest 99 suites / 1313 passed and full frontend 144 files passed, 1 skipped / 1192 passed, 6 skipped (the in-container skip of permission-labels, proven above with the mount) — run before the controller's label-text fix below, which the canonical run covers. Negative control by the controller on a disposable copy under the backend container's `/tmp` (deleted afterwards): dropping `WHERE is_deleted = false` from `uq_suppliers_code_active` made `soft-delete-unique-index.spec.ts` fail ("suppliers.uq_suppliers_code_active (1793108442602-init-supplier.ts) — a deleted row keeps reserving this value"). Live browser check after restarting backend and frontend (Turbopack cache cleared once when /login returned 404 after the restart, per the known issue), logged in as `purchasing`: menu "Mua hàng & Kho" → /inventory/suppliers renders; create BRWNCC01 appears in the list; creating `brwncc01` shows "Mã nhà cung cấp đã tồn tại trong hệ thống." under the code field; select + "Xoá hàng loạt (1)" + confirm removes it and the DB row reads is_deleted = true; the test row was then removed by targeted SQL (suppliers count 0) and the browser session closed. Screenshots in the session scratchpad `browser/p2-t02-*.png`. Review (code-auditor): PASS, Low only; controller fixed Low 3 (the `supplier:delete` permission label said "and contacts" — now "Xoá nhà cung cấp" / "Delete supplier"). Known limitations: supplier code is editable on update (customer codes are locked; revisit in task-07 if PO snapshots the supplier code); optional email/phone/tax code are not trimmed in the DTO before validation (the form trims); the controller permission-metadata spec does not list bulk delete and column values (both guarded by their decorators); `supplierPageRoutes` is unused; per-row edit/delete buttons sit in a horizontally scrolled actions column that the browser tool could not click, so the per-row delete path was exercised through bulk delete only (both share `remove`).
