# Task 09 — Review Mode cho kỹ sư trên màn Dự toán

Status: done

## Outcome
Kỹ sư mở dự toán có dòng AI thấy badge/highlight, `ai_note`, nút Verify từng dòng và "Verify tất cả", cảnh báo còn N dòng AI chưa verify khi bấm "Gửi dự toán" (không chặn), và không thấy giá; luồng thêm/sửa/xoá thủ công giữ nguyên (D-07).

## Scope
- In:
  - `EstimateBomGrid` và panel header: badge "AI" + độ tin cậy, tô nền dòng AI chưa verify, tooltip/ô `ai_note`, nút Verify dòng và Verify tất cả (gọi route task-01), dòng đã verify hiện dấu tick.
  - `EstimateEditor`: hộp cảnh báo khi submit nếu `unverifiedAiCount > 0` có nút "Vẫn gửi".
  - Không thêm cột giá nào; cột giá vẫn theo `can(ItemPermission.referencePriceRead)` (`EstimateBomGrid.tsx:102`).
  - i18n `vi`/`en`.
- Out: nút AI (task-07); chỉnh sửa BOM hiện có.

## Coverage
- CP-05
- CP-04

## Ownership
- Modify: `frontend/src/plugins/sales/estimate/components/EstimateBomGrid.tsx`, `.../EstimateEditor.tsx`, `.../EstimateDetailPage.tsx` (nút "Gửi dự toán" và ConfirmDialog nằm ở đây), `frontend/src/plugins/sales/estimate/hooks/api/useEstimate.ts`, `frontend/src/plugins/sales/estimate/constants.ts`, `frontend/src/plugins/sales/estimate/services/estimate.service.ts`, `frontend/src/plugins/sales/estimate/types.ts`, `frontend/src/kernel/langs/vi/estimate.json`, `frontend/src/kernel/langs/en/estimate.json`
- Create: `frontend/src/plugins/sales/estimate/tests/estimate-review-mode.test.tsx`
- Read: `frontend/src/plugins/sales/estimate/tests/estimate-editor.test.tsx`

## Steps
1. Test: dòng AI chưa verify có badge và note; bấm Verify → gọi API và đổi sang trạng thái verified; Verify tất cả đặt hết dòng AI.
2. Test: submit khi còn dòng chưa verify → thấy cảnh báo; "Vẫn gửi" vẫn gọi submit.
3. Test: actor không có `referencePriceRead` → DOM không có cột giá/tổng ở dòng AI.
4. Test: estimate không có dòng AI → giao diện giống trước (snapshot/assert không có badge).
5. Chạy lại các test estimate hiện có.

## Acceptance
- AC-10, AC-11.

## Dependencies
- task-01-estimate-ai-columns-verify.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"`
- Named probe: `estimate-review-mode.test.tsx` (Steps 1-4); các test `estimate-editor.test.tsx`, `estimate-pricing.test.tsx` giữ nguyên (Step 5).
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: render cột giá cho engineer phải làm Step 3 fail; chặn submit khi còn dòng chưa verify phải làm Step 2 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 6eafd07c40a424dce436cc67c35e0e0fb06f4fff1a5eb37b39d20aea47d2518a
```text
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 RUN  v4.1.10 /app
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 7482ms
     ✓ has no Vietnamese enum label/value in plugin constants or utils  7456ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  03:21:06
   Duration  8.93s (transform 318ms, setup 240ms, import 220ms, tests 7.48s, environment 790ms)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 RUN  v4.1.10 /app
 ✓ src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx (5 tests) 278ms
 ✓ src/plugins/sales/estimate/tests/request-estimate-section.test.tsx (12 tests) 431ms
 ✓ src/plugins/sales/estimate/tests/estimate-totals.test.ts (4 tests) 59ms
 ✓ src/plugins/sales/estimate/tests/estimate-status-badge.test.tsx (5 tests) 137ms
 ✓ src/plugins/sales/estimate/tests/estimate-review-mode.test.tsx (8 tests) 1917ms
     ✓ marks AI lines that are not verified, with confidence and note, and leaves manual lines plain  329ms
     ✓ verifies every AI line at once  503ms
     ✓ warns with the count but does not block, and Vẫn gửi submits  360ms
 ✓ src/plugins/sales/estimate/tests/estimate-pricing.test.tsx (12 tests) 1956ms
     ✓ shows the unit cost inputs, the cost lines and the complete action  521ms
 ✓ src/plugins/sales/estimate/tests/estimate-editor.test.tsx (23 tests) 2730ms
     ✓ asks before removing a BOM line, then removes exactly that line  378ms
 Test Files  7 passed (7)
      Tests  69 passed (69)
   Start at  03:21:53
   Duration  24.66s (transform 72.56s, setup 1.97s, import 89.62s, tests 7.51s, environment 10.38s)
```

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS: per-line verify button no longer locks other lines, verified tick has role="img").
Limitations: Proven by vitest only; not walked through in the real UI yet. The submit warning lives in EstimateDetailPage.tsx (where the submit button is), not EstimateEditor. Two Low review notes left open (AI badge classes duplicated in EstimateEditor and EstimateBomGrid; the price-column test matches exact header text).
