# Task 06 — Item catalog with Excel import

Status: pending

## Outcome
Purchasing maintains one item catalog (thiết bị điện, vỏ tủ, phụ kiện) that estimate BOM lines pick from; items are importable from Excel.

## Scope
- In: `catalog` plugin. Item (code — manufacturer part number or internal code, unique among active; name; specification; brand; group enum `enclosure|breaker|contactor|relay|plc|inverter|cable|terminal|accessory|other`; unit; reference purchase price VND `numeric(18,2)`; note). Write permission `item:*` for `purchasing`, `engineeringLead`, `admin`; read for all internal roles. Excel import with per-row errors. `CatalogGateway.getItems(ids)` (includes deleted). Delete guarded by a reference-check registry.
- Out: barcode, stock, location, supplier price lists (P2); Excel export.

## Coverage
- CP-06

## Ownership
- Create: `backend/src/plugins/catalog/`, `frontend/src/plugins/catalog/`, `frontend/src/app/[locale]/catalog/`
- Modify: shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/master-data/other-material/`, REF kernel import utilities

## Steps
1. Scaffold; entity/migration with `numeric-column.transformer`.
2. Import: parse with `exceljs`, validate all rows first, insert valid rows in one transaction, return `{created, errors:[{row, field, reason}]}`.
3. Frontend list/form/import dialog with error table.
4. Specs: fixture 3 valid + 2 invalid (missing code, duplicate code in file) → created 3, errors on rows 4 and 6; `sales` lacks `item:create` → 403; referenced item delete → 409.

## Acceptance
- AC-05, AC-06, AC-07.

## Dependencies
- task-05-crm-project.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/catalog"`
- Named probe: `src/plugins/catalog/item/services/item-import.service.spec.ts`, frontend `item-import-dialog.test.tsx`
- Reachability: known after task-02.
- Oracle: import spec asserts `created === 3` and error rows `[4, 6]`.
- Counterexample: inserting rows before validating all must fail the duplicate-in-file case.
- Artifacts: xlsx fixture in `src/plugins/catalog/item/services/__fixtures__/`.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
