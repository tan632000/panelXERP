# Task 06 — Item catalog with Excel import

Status: done

## Outcome
Purchasing maintains one item catalog (thiết bị điện, vỏ tủ, phụ kiện) that estimate BOM lines pick from; items are importable from Excel.

## Scope
- In: `catalog` plugin. Item (code — manufacturer part number or internal code, unique among active; name; specification; brand; group enum `enclosure|breaker|contactor|relay|plc|inverter|cable|terminal|accessory|other`; unit; reference purchase price VND `numeric(18,2)`; note). Write permission `item:*` for `purchasing`, `engineeringLead`, `admin`; read for all internal roles. Excel import with per-row errors that reads the company quotation layout `docs/BG.xlsx` directly (user decision 2026-10-24, see Import rules). `CatalogGateway.getItems(ids)` (includes deleted). Delete guarded by a reference-check registry.
- Out: barcode, stock, location, supplier price lists (P2); Excel export.

## Import rules (user decision 2026-10-24)
- Header row auto-detected within the first 50 rows: the first row holding both `MÔ TẢ` and `MÃ HÀNG` (accent- and case-insensitive). Columns by header text: `MÔ TẢ`→name, `MÃ HÀNG`→code, `HÃNG SẢN XUẤT`→brand, `ĐV TÍNH`→unit, `Đơn giá (VNĐ)`/`ĐƠN GIÁ`→referencePrice; optional `NHÓM`→group (absent or blank → `other`), `QUY CÁCH`/`THÔNG SỐ`→specification, `GHI CHÚ`→note. `STT`, `SỐ LƯỢNG`, `Thành tiền` are ignored.
- A row is an item row when it has a description and (a code or a unit). A row with neither code nor unit (panel sections `I`/`II`, sub-assemblies such as `BƠM HỒI 1.5KW`, totals, notes, signature lines) is skipped silently; rows whose `STT` is a Roman numeral are skipped.
- The goods table ends at the first row WITHOUT a code whose name or unit cell starts with `Tổng` (subtotal; a row holding a code, e.g. an item named `Tổng đài…`, never ends it); every row after it (VAT, totals, terms, the `Xác nhận đặt hàng` / place-and-date block, whose merged cell reaches the unit column) is skipped. Clarified 2026-10-24 during implementation so the signature line of `docs/BG.xlsx` (row 51) is not read as an item.
- Every catalog item needs a code (user decision): an item row without a code → error `code` ("missing code"). Auxiliary materials and labour stay estimate cost lines (D-05), not catalog items.
- A code repeated in the file with identical name/brand/unit is merged into one item; a repeat with different data → error on the later row. A code already used by an active item → error. Unit is free text (Cái, Gói, Bộ…). Price blank → null; non-numeric or negative → error.
- The downloadable template uses the same Vietnamese headers on row 1.

## Coverage
- CP-06

## Ownership
- Create: `backend/src/plugins/catalog/`, `frontend/src/plugins/catalog/`, `frontend/src/app/[locale]/catalog/`
- Modify: shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/master-data/other-material/`, REF kernel import utilities

## Steps
1. Scaffold; entity/migration with `numeric-column.transformer`.
2. Import: parse with `exceljs` per Import rules, validate all rows first, insert valid rows in one transaction, return `{created, errors:[{row, field, reason}]}` (row = sheet row number).
3. Frontend list/form/import dialog with error table.
4. Specs: (a) synthetic fixture with the Vietnamese header on row 1: rows 2, 3, 5 valid, row 4 has a unit but no code, row 6 repeats row 5's code with a different name → created 3, errors on rows 4 and 6; (b) `docs/BG.xlsx` copied as a fixture → created 11 (codes 600x400x200, BCL63E0CG-3P040, ME-43, RT 18-32X, ML22-22, BCL63E0CG-3P020, TF62A, EW-181H, BCL63E0CG-3P010, SC-03, TR-0N(4–6)), errors with field `code` on rows [20, 21, 25, 30, 31, 36, 38, 39], rows 14, 22, 32, 37 and the total/notes rows skipped; `sales` lacks `item:create` → 403; referenced item delete → 409.

## Acceptance
- AC-05, AC-06, AC-07.

## Dependencies
- task-05-crm-project.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/catalog"`
- Named probe: `src/plugins/catalog/item/services/item-import.service.spec.ts`, frontend `item-import-dialog.test.tsx`
- Reachability: known after task-02.
- Oracle: synthetic fixture → `created === 3`, error rows `[4, 6]`; BG fixture → `created === 11`, error rows `[20, 21, 25, 30, 31, 36, 38, 39]`.
- Counterexample: inserting rows before validating all must fail the duplicate-in-file case.
- Artifacts: xlsx fixtures in `src/plugins/catalog/item/services/__fixtures__/` (synthetic + a copy of `docs/BG.xlsx`).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/catalog"
Exit: 0
Base: 337533e136993eceeebe515596459883a25d99bf
Head: 9d98115a5afefab22bb89bd5e8634b1b2d4e73634f7deb4aaff853e300d89d64
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/catalog"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/catalog/_shared/gateways/reference-check-registry.spec.ts
PASS src/plugins/catalog/_shared/gateways/catalog-gateway.spec.ts
PASS src/plugins/catalog/item/item.controller.spec.ts (13.115 s)
Test Suites: 5 passed, 5 total
Tests:       69 passed, 69 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (20 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/catalog/item/tests/item-import-dialog.test.tsx (5 tests)
 ✓ src/plugins/catalog/item/tests/item-list.test.tsx (4 tests)
 Test Files  2 passed (2)
      Tests  9 passed (9)
Exit: 0
```
Extra evidence (same Head, not the canonical command): full backend jest 70 suites / 713 passed; full frontend 123 files / 981 passed / 6 skipped; live smoke after migrate + seed + `docker compose restart backend` (statuses/counts only): purchasing create 201; sales create 403; engineer list 200; duplicate code differing in case 409; PATCH code 400; import of `docs/BG.xlsx` by purchasing on an empty catalog → 200, created 11, error rows [20, 21, 25, 30, 31, 36, 38, 39]; sales import 403; smoke items removed through the API bulk delete (11 deleted, 0 remaining); temporary scripts and the file copy deleted. Oracles: synthetic fixture created 3 / errors [4, 6] and BG fixture created 11 / errors [20, 21, 25, 30, 31, 36, 38, 39] asserted in `item-import.service.spec.ts`. Review (code-auditor): round 1 FAIL (High: ExcelJS full load bypassed the kernel decompression guard) → kernel `openBoundedZip` exported and reused with a 30 MB cap, merged-slave cells read empty, strict text price parsing, coded rows never end the table, PATCH null → 400 → re-review PASS; controller tightened the zip-bomb spec to assert the guard's own message. Known limitations: a forged zip declaring small sizes can still inflate inside ExcelJS (no streaming second layer); a description merged vertically across rows leaves the later row nameless and skipped; data after a code-less "Tổng" row is not read; multipart field/part limits as kernel; English server reasons shown verbatim; catalog specs import the crm fake-repo spec helper.
