# Task 08 — Nút "Phân tích & Điền bằng AI" và trạng thái chạy trên Yêu cầu

Status: done

## Outcome
Trên chi tiết Yêu cầu, Sales/salesManager/director thấy nút AI khi request đủ điều kiện; bấm thì thấy tiến trình, và khi xong thấy liên kết tới dự toán; không đủ điều kiện hoặc AI chưa cấu hình thì ẩn/vô hiệu kèm lý do (D-09).

## Scope
- In:
  - Service/hook gọi `POST /sales/estimates/ai-prefill` và poll `GET /sales/estimates/ai-prefill/:runId` (mỗi 3s đến khi `succeeded|failed`, dừng khi rời trang).
  - Khối UI trong `RequestDetailContent`: nút, hộp xác nhận ("tài liệu sẽ được gửi tới dịch vụ AI bên ngoài"), trạng thái `queued/running/succeeded/failed`, thông báo lỗi 409/503 bằng chữ dễ hiểu, sau thành công thấy tóm tắt và nút mở dự toán.
  - Hiển thị theo `can(EstimatePermission.aiPrefill)` (không viết chuỗi quyền literal trong component, `permission-gating-convention.test.ts`) và điều kiện D-03/D-06 (status, đã có estimate, có file/yêu cầu); i18n `vi` và `en`.
- Out: Review Mode (task-08); thay đổi form tạo yêu cầu.

## Coverage
- CP-03

## Ownership
- Create: `frontend/src/plugins/sales/request/components/AiPrefillPanel.tsx`, `frontend/src/plugins/sales/request/hooks/useAiPrefill.ts`, `frontend/src/plugins/sales/request/tests/ai-prefill-panel.test.tsx`
- Modify: `frontend/src/plugins/sales/request/components/RequestDetailContent.tsx`, `frontend/src/plugins/sales/request/services/` (request service gọi API), `frontend/src/plugins/sales/request/types.ts`, `frontend/src/kernel/langs/vi/request.json`, `frontend/src/kernel/langs/en/request.json`, `frontend/src/plugins/sales/estimate/permissions/estimate-permission.keys.ts` (thêm `aiPrefill: "estimate:ai_prefill"`)
- Modify (approved extras, bell and timeline labels for the new events): `frontend/src/kernel/core/hooks/api/useNotifications.ts`, `frontend/src/kernel/langs/vi/common.json`, `frontend/src/kernel/langs/en/common.json`, `frontend/src/plugins/sales/request/components/RequestTimeline.tsx`, `frontend/src/plugins/sales/request/tests/request-detail.test.tsx`, `frontend/src/kernel/core/tests/sales-estimate-notification.test.ts`
- Read: `frontend/src/plugins/sales/estimate/components/RequestEstimateSection.tsx`

## Steps
1. Test: user có quyền + request `draft` có file → thấy nút; không quyền → không thấy; request `estimated` → ẩn.
2. Test: bấm → hộp xác nhận → gọi API → trạng thái `running` → `succeeded` hiển thị liên kết dự toán; `failed` hiển thị lý do; 409 hiển thị câu thân thiện.
3. Test: poll dừng khi unmount.
4. `npm run lint:i18n` không báo thiếu khoá.

## Acceptance
- AC-09.

## Dependencies
- task-06-ai-prefill-run-api.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request src/kernel/langs src/kernel/platform"`
- Named probe: `ai-prefill-panel.test.tsx` (Steps 1-3); `lint:i18n` nằm trong `npm run lint` (Step 4).
- Reachability: known.
- Oracle: exit 0, 0 skipped; từng ca hiển thị đúng.
- Counterexample: hiển thị nút cho user không có `estimate:ai_prefill` phải làm Step 1 fail; poll không dọn khi unmount phải làm Step 3 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request src/kernel/langs src/kernel/platform"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: dfc18976989e5d93ea273ab0934101aa1e2186e9d83d1522ebc5df697d5e00c5
```text
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 63ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 54ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 33ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 41ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 31ms
 ✓ src/plugins/sales/request/tests/map-request-api-errors.test.ts (2 tests) 22ms
 ↓ src/kernel/langs/tests/permission-labels.test.ts (6 tests | 6 skipped)
 ✓ src/kernel/platform/tests/test-layout.test.ts (196 tests) 146ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 38ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 20ms
 Test Files  18 passed | 1 skipped (19)
      Tests  322 passed | 6 skipped (328)
   Start at  15:28:39
   Duration  43.79s (transform 88.18s, setup 5.43s, import 143.81s, tests 17.63s, environment 28.71s)

-- supplemental: same vitest command with backend/src/plugins copied into the frontend container for the run, then removed (the container cannot see backend/, so permission-labels.test.ts skips in the plain run)
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 34ms
 ✓ src/plugins/sales/request/tests/map-request-api-errors.test.ts (2 tests) 30ms
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 41ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (196 tests) 159ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 31ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 24ms
 Test Files  19 passed (19)
      Tests  328 passed (328)
   Start at  15:36:22
   Duration  44.05s (transform 87.05s, setup 6.12s, import 140.51s, tests 16.93s, environment 32.98s)
VITEST_EXIT=0
ls: /backend: No such file or directory
```

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS: 429 text made neutral because the server returns 429 for the per-minute throttle and the daily cap, and the no-input reason now shows only after the attachment list loaded).
Limitations: Deliberate deviation from AC-09, accepted by the user this session: the button is NOT hidden when the AI service is unconfigured (the backend exposes no configuration flag); it stays visible and a 503 after confirming shows a friendly 'not configured' message. The user decides at the final gate. The plain run skips the 6 permission-labels tests (0 skipped only in the supplemental run). Not walked through in a real browser; API is mocked in unit tests. run.error is shown as the server's fixed English 'CODE: sentence'; the run id is kept in component state, so leaving the page mid-run loses progress and a second click gets 409; the panel cannot know client-side whether an existing estimate is replaceable (the server answers 409); prettier rewrapped one old line in request.service.ts (searchProjectOptions). The bell and timeline labels for ai_filled, ai_failed and estimate_ai_filled were extras beyond the original Ownership and are now listed in the task.
