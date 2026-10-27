# Task 02 — Supplier master and the `inventory` plugin

Status: pending

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
