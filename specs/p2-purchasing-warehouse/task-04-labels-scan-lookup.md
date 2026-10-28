# Task 04 — Code 128 item labels and keyboard-wedge scan lookup

Status: done

## Outcome
Users print internal labels (Code 128 of the item code) from the item list or detail, and a reusable keyboard-wedge scan input finds an item by its barcode or code from the item list.

## Scope
- In (backend): pure encoder `code128.util.ts` (code set B, start B = 104, modulo-103 checksum, stop; returns module widths); input outside ASCII 32–126 → 422. `GET /items/labels.pdf?ids=1,2&copies=1` (`item:read`, copies ≥ 1, `ids × copies ≤ 500` else 400) renders with `pdfkit` one 50×30 mm page per label for a thermal roll (D-13, user Q1): Code 128 bars, human-readable item code, short name truncated to one line. Unknown or deleted id → 404; `Content-Disposition` via `backend/src/kernel/shared/utils/content-disposition.util.ts`.
- In (frontend): kernel component `frontend/src/kernel/core/components/ui/ScanInput.tsx` (D-12): autofocus; Enter submits the trimmed value once (empty ignored); a sequence counter drops responses older than the latest submit (REF pattern `LotScanModal.tsx:138-236`); after each result the field clears and refocuses; not-found shows an inline error and keeps focus; disabled while the host says so; no camera. Hook `useResolveItem` calls `/items/resolve`. Item list: a scan box opens the found item's detail; "In nhãn" for selected rows and on item detail (copies input).
- Out: camera, printer drivers, batch label templates, EAN printing.

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/catalog/item/utils/code128.util.ts` (+ spec), `backend/src/plugins/catalog/item/services/item-label.service.ts` (+ spec), `frontend/src/kernel/core/components/ui/ScanInput.tsx`, `frontend/src/kernel/core/components/ui/tests/scan-input.test.tsx`, `frontend/src/plugins/catalog/item/hooks/useResolveItem.ts`
- Modify: `backend/src/plugins/catalog/item/item.controller.ts`, `frontend/src/plugins/catalog/item/components/ItemListPage.tsx`, shared registration files
- Read: `REF/frontend/src/plugins/warehouse/_shared/components/LotScanModal.tsx`

## Steps
1. Encoder + spec with vectors: `"PJ"` → values 104, 48, 42, checksum (104 + 48×1 + 42×2) mod 103 = 30, stop 106; `"A-01"` round-trips through a test decoder of module widths; `"Bộ"` → 422.
2. Label service: PDF has `copies × ids` pages of 50×30 mm (141.73 × 85.04 pt); the spec parses page count and page size from the PDF and checks the code text is present; 250 ids × 2 copies → 200, 251 × 2 → 400.
3. `ScanInput` + tests: Enter with `"  ABC "` calls resolve once with `ABC`; two quick scans where the first response arrives last → only the second result applied; not-found keeps focus; empty Enter does nothing.
4. Item list scan box + label buttons; i18n.
5. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-05 (input half), AC-06.

## Dependencies
- task-03-locations-item-stock-settings.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/utils/code128.util.spec.ts && test -f src/plugins/catalog/item/services/item-label.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog/item" && docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/scan-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/scan-input.test.tsx src/plugins/catalog/item"`
- Named probe: `src/plugins/catalog/item/utils/code128.util.spec.ts`, `src/plugins/catalog/item/services/item-label.service.spec.ts`, frontend `src/kernel/core/components/ui/tests/scan-input.test.tsx`
- Reachability: known after P1; a physical scanner is not used in proof (keyboard events are simulated).
- Oracle: checksum 30 for `"PJ"`; late-response test applies only the latest result.
- Counterexample: dropping the sequence check must fail the late-response test; a checksum computed without position weights must fail the vector spec.
- Artifacts: ephemeral (PDF bytes in memory).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/utils/code128.util.spec.ts && test -f src/plugins/catalog/item/services/item-label.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog/item" && docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/scan-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/scan-input.test.tsx src/plugins/catalog/item"
Exit: 0
Base: 0a227abbacbf2b853229b813d609b07ffd89f200
Head: 46895693588f5d903f34765f47ae95a67cc35f21b8fea42947f66f9284c0e106
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/catalog/item/utils/code128.util.spec.ts && test -f src/plugins/catalog/item/services/item-label.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/catalog/item" && docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/scan-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/scan-input.test.tsx src/plugins/catalog/item"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/plugins/catalog/item/services/item-label.service.spec.ts
PASS src/plugins/catalog/item/utils/code128.util.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts (5.703 s)
PASS src/plugins/catalog/item/item.controller.spec.ts (19.078 s)
Test Suites: 7 passed, 7 total
Tests:       135 passed, 135 total
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 2975ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/kernel/core/components/ui/tests/scan-input.test.tsx (9 tests) 664ms
 ✓ src/plugins/catalog/item/tests/item-import-dialog.test.tsx (5 tests) 1004ms
 ✓ src/plugins/catalog/item/tests/item-form-modal.test.tsx (1 test) 625ms
 ✓ src/plugins/catalog/item/tests/item-list.test.tsx (19 tests) 3081ms
 Test Files  4 passed (4)
      Tests  34 passed (34)
Exit: 0
```
No test in the run above was skipped. Pre-change run: the Command exited 1 at the missing probe `code128.util.spec.ts`. An earlier attempt at this proof exited 137: `tsc` was killed for memory while the WSL2 VM was capped at 4 GB (`.wslconfig`). The user raised the cap to 10 GB, and the run above is the first full run after that. Extra evidence (not the canonical command), from the implementer after repair round 1: full backend jest 106 suites / 1408 passed; full frontend 148 files passed, 1 skipped / 1229 passed, 6 skipped (permission-labels in-container skip, as before).

Negative controls, run by the controller on the final code in disposable copies inside the containers (`/tmp/nc-t04fe`, `/tmp/nc-t04be`, left in container /tmp):
- Sequence check removed from `ScanInput` → 3 failed: "applies only the newest result when the first answer arrives last", "drops a late failure of an older scan" and "hands nothing to the host once it is unmounted".
- Checksum without position weights → 5 failed, including `encodes "PJ" as start B, 48, 42, checksum 30, stop 106` and `weights each character by its position in the checksum`.

Review (code-auditor):
- Round 1: PASS_WITH_WARNINGS. The full 107-pattern table matched ISO/IEC 15417. One Medium: module width had no floor. The user decided to block over-long codes (amendment in plan.md). Repair round 1 also fixed 4 Lows: Enter in copies submitted the item form; the scan box took scans while the modal was open; oversized/hex ids gave 500; 404 had no toast.
- Re-review: PASS, Low only.

Live checks after restarting the stack (Turbopack cache cleared when /login returned 404):
- PDF as storekeeper for `LC1D09M7` × 2: 200, `application/pdf`, attachment `item-labels.pdf`, 2 pages. Viewed in the browser: the Vietnamese name is on one line with an ellipsis, Code 128 bars, and the readable code. The bytes do not contain the reference price 777000.
- `/items/resolve?code=lc1d09m7` → 200.
- Browser as `storekeeper` on /catalog/items:
  - the scan box has focus on load;
  - scanning `lc1d09m7` + Enter opens the item form, and the scan box is disabled while it is open;
  - Enter in "Số bản" = 3 requests `/items/labels.pdf?ids=322&copies=3` and the modal stays open;
  - Hủy → the scan box is enabled and focused;
  - scanning `KHONG-CO-MA` shows "Không tìm thấy vật tư với mã này." and keeps focus.
- API as storekeeper:
  - a 28-character code → 200 PDF;
  - 29 characters → 422 "… is too long to print as a scannable 50x30 mm label (at most 28 characters).";
  - `ids=99999999999` and `ids=0x10` → 400.
- Test items were deleted by targeted SQL (count 0). Screenshots are in the session scratchpad `browser/p2-t04-*.png`.

Known limitations:
- Not scanned with a physical scanner or printed on a real thermal printer. Bar geometry is proven by the encoder spec (decoder round-trip) and the dot math review only. Labels assume printing at 100 % on a 203-dpi head; "fit to page" or a 300-dpi head re-samples the bars.
- The 28-character limit is hard-coded in the `labelsTooLong` toast text.
- Toast classification for 422/400 matches substrings of the backend English messages.
- Opening the item modal while a scan is in flight lets that late result replace the modal's item; the window is small.
- For a read-only user, a scan filters the list by the code instead of opening the form (implementer judgement, reported to the user).
- Duplicate ids are de-duplicated before multiplying by copies.
- Outside Ownership (all within the item plugin): `item-labels-query.dto.ts`, `item.module.ts`, `item-limits.constant.ts`, `ItemLabelPrint.tsx`, `ItemFormModal.tsx`, `useItem.ts`, `item.service.ts`, `constants.ts`, `types.ts`, i18n `item.json`.
