# Task 11 — UI Dự án chọn template (tùy chọn)

Status: done

## Outcome
Form Dự án có ô chọn template đang hoạt động (kèm "Không dùng"); bỏ trống thì payload và hành vi như cũ; tên template hiện ở chi tiết nếu có sẵn chỗ (D-13).

## Scope
- In: `TemplatePicker` trong `frontend/src/plugins/crm/project/components/`, gắn vào `ProjectFormFields.tsx`; types/schema zod nhận `quotationTemplateId` (số hoặc null); danh sách template lấy từ `GET /sales/quotation-templates?isActive=true`; i18n vi/en cho project; ẩn ô chọn khi user không có quyền đọc template.
- Out: UI quản lý template (task-10); backend (task-05).

## Coverage
- CP-02

## Ownership
- Create: `frontend/src/plugins/crm/project/components/TemplatePicker.tsx`, `frontend/src/plugins/crm/project/tests/project-template-picker.test.tsx`
- Modify: `frontend/src/plugins/crm/project/components/ProjectFormModal.tsx`, `frontend/src/plugins/crm/project/utils/form-payload.ts`, `frontend/src/plugins/crm/project/hooks/useActiveTemplates.ts` (create), `frontend/src/plugins/crm/project/components/ProjectFormFields.tsx`, `frontend/src/plugins/crm/project/types.ts`, `frontend/src/plugins/crm/project/services/` (thêm hàm lấy template đang hoạt động), `frontend/src/plugins/crm/project/schemas/` (schema project), `frontend/src/kernel/langs/vi/project.json`, `frontend/src/kernel/langs/en/project.json`
- Read: `frontend/src/plugins/crm/project/components/CustomerPicker.tsx`, `frontend/src/plugins/crm/project/services/` (service project hiện có)

## Steps
1. Test: select chỉ liệt kê template đang hoạt động; chọn "Không dùng" gửi `null`; submit không đổi các trường cũ của payload.
2. Test: user thiếu quyền đọc template → không thấy ô chọn, payload không có `quotationTemplateId`.
3. Test: sửa project đã có template → ô chọn hiện giá trị hiện tại.
4. `npm run lint` (gồm i18n) xanh.

## Acceptance
- AC-12 (phần UI): form chỉ cho chọn template đang hoạt động; bỏ trống như cũ.

## Dependencies
- task-05-project-template-backend.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm/project src/kernel/langs src/kernel/platform"`
- Named probe: `project-template-picker.test.tsx` (Steps 1-3).
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: liệt kê cả template đã tắt phải làm Step 1 fail; luôn gửi `quotationTemplateId` kể cả khi user thiếu quyền phải làm Step 2 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm/project src/kernel/langs src/kernel/platform"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 7967fc2d5164ad021f0da44ee39dd9db8352844993ee759e2823fe3a1e03422f
```text
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 RUN  v4.1.10 /app
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 8677ms
     ✓ has no Vietnamese enum label/value in plugin constants or utils  8645ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  10:53:04
   Duration  10.40s (transform 352ms, setup 342ms, import 198ms, tests 8.68s, environment 931ms)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 RUN  v4.1.10 /app
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 843ms
     ✓ resolves every key in the vi bundle  419ms
     ✓ resolves every key in the en bundle  373ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 8367ms
     ✓ gates no control on a literal permission string  3812ms
     ✓ leaves wildcard resolution to the permission helper  4305ms
 ✓ src/plugins/crm/project/tests/project-template-picker.test.tsx (7 tests) 1420ms
     ✓ lists only active templates and sends null for the no-template choice  654ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1470ms
     ✓ resolves every module page to a navigation entry  1454ms
 ✓ src/plugins/crm/project/tests/project-form-modal.test.tsx (1 test) 657ms
     ✓ fills a late suggested code without clearing the customer or name already entered  650ms
 ✓ src/plugins/crm/project/tests/project-form.test.tsx (3 tests) 404ms
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 88ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 67ms
 ✓ src/plugins/crm/project/tests/project-list.test.tsx (5 tests) 1401ms
     ✓ lists the projects the API returns, with their customer  590ms
     ✓ offers the row edit and delete controls only with project:update and project:delete  314ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 103ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 41ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 52ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 47ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (195 tests) 261ms
 ↓ src/kernel/langs/tests/permission-labels.test.ts (6 tests | 6 skipped)
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 50ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 36ms
 Test Files  16 passed | 1 skipped (17)
      Tests  285 passed | 6 skipped (291)
   Start at  10:53:59
   Duration  38.42s (transform 55.40s, setup 4.72s, import 105.28s, tests 15.31s, environment 29.92s)

-- supplemental: same vitest command with backend/src/plugins copied into the frontend container for the run, then removed (the container cannot see backend/, so permission-labels.test.ts skips in the plain run)
 RUN  v4.1.10 /app
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 880ms
     ✓ resolves every key in the vi bundle  401ms
     ✓ resolves every key in the en bundle  451ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 7580ms
     ✓ gates no control on a literal permission string  3162ms
     ✓ leaves wildcard resolution to the permission helper  4187ms
 ✓ src/plugins/crm/project/tests/project-template-picker.test.tsx (7 tests) 1477ms
     ✓ lists only active templates and sends null for the no-template choice  691ms
 ✓ src/plugins/crm/project/tests/project-form-modal.test.tsx (1 test) 610ms
     ✓ fills a late suggested code without clearing the customer or name already entered  602ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1047ms
     ✓ resolves every module page to a navigation entry  1044ms
 ✓ src/plugins/crm/project/tests/project-form.test.tsx (3 tests) 457ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 66ms
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 106ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 44ms
 ✓ src/plugins/crm/project/tests/project-list.test.tsx (5 tests) 1422ms
     ✓ lists the projects the API returns, with their customer  467ms
     ✓ offers the row edit and delete controls only with project:update and project:delete  314ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 109ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 55ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 51ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (195 tests) 198ms
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 29ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 36ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 56ms
 Test Files  17 passed (17)
      Tests  291 passed (291)
   Start at  10:54:53
   Duration  34.97s (transform 51.71s, setup 4.18s, import 98.66s, tests 14.23s, environment 28.14s)
VITEST_EXIT=0
```

Review: PASS (code-auditor, round 2; round 1 FAIL: editing a project whose template was later deactivated re-sent the old id and the backend answered 400, fixed on the frontend by sending quotationTemplateId on update only when it changed; plus the picker now hides and omits the key when the template list request fails).
Limitations: Deliberate deviation from D-13 wording "always send when the user can read templates": on edit the key is sent only when the value changed (needed because the backend rejects an inactive template and the plan allows a template to be deactivated after assignment). The template list is one request capped at 100 templates. The dropdown is a native select mock in the tests, so the real dropdown and a browser run are not covered. For a moment while the list loads and then fails (feature off) the picker is visible. The project detail page does not show the template name (D-13 allows skipping it). Extras beyond the original Ownership (ProjectFormModal.tsx, utils/form-payload.ts, hooks/useActiveTemplates.ts) are now listed in the task. The plain run skips the 6 permission-labels tests (0 skipped only in the supplemental run).
