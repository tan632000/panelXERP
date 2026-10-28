# Task 04 — Code 128 item labels and keyboard-wedge scan lookup

Status: pending

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
