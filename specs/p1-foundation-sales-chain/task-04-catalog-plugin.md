# Task 04 — Item catalog with Excel import

Status: pending

## Outcome
Engineering and purchasing share one item catalog (thiết bị điện, vỏ tủ, phụ kiện) that BOM lines pick from, importable from Excel.

## Scope
- In: `catalog` plugin. Item (code — user-entered manufacturer part number or internal code, unique; name; specification text; brand; group enum: `enclosure`, `breaker`, `contactor`, `relay`, `plc`, `inverter`, `cable`, `terminal`, `accessory`, `other`; unit; reference purchase price VND; note). CRUD list/form, Excel import with per-row error report, Excel export, picker + `CatalogGateway.getItems(ids)`.
- Out: barcode, stock, location, supplier price list (P2).

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/catalog/`, `frontend/src/plugins/catalog/`, `frontend/src/app/[locale]/catalog/`
- Modify: both `enabled-plugins.ts`, both `enabled-features`, `seed-roles.ts` (append keys only)
- Read: `REF/backend/src/plugins/master-data/other-material/`, REF kernel import/export utilities (located via `REF/docs/feature-standard/references/codebase-map.md`)

## Steps
1. Scaffold plugin; entity + migration (unique code partial index, `numeric` price with `numeric-column.transformer`).
2. CRUD services/controllers.
3. Import: parse xlsx with `exceljs`; validate each row; insert valid rows in one transaction; return `{created, errors:[{row, field, reason}]}`.
4. Frontend list, form, import dialog showing the error table.
5. Specs: import with 3 valid + 2 invalid rows (missing code, duplicate code in file) → 3 created, 2 errors with row numbers.

## Acceptance
- AC-05: import result matches the spec fixture exactly; invalid rows never partially insert.

## Dependencies
- task-02-roles-permission-seed.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/catalog && npm run validate:migrations && npm run typecheck" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/catalog/item/services/item-import.service.spec.ts`
- Reachability: known after task-01.
- Oracle: import spec asserts `created === 3` and errors on rows 4 and 6 (header = row 1).
- Counterexample: committing valid rows before validating all rows must fail the "duplicate in file" assertion.
- Artifacts: xlsx fixture under `src/plugins/catalog/item/services/__fixtures__/`.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
