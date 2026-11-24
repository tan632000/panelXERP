# Task 06 — Sales bấm AI → job nền → nháp dự toán + thông báo, bền vững khi huỷ/restart/trùng

Status: done

## Outcome
`POST /sales/estimates/ai-prefill` tạo một run, job Bull đọc tài liệu và template của project, gọi `extractEstimateDraft`, rồi trong một transaction ghi Estimate + revision 1 `draft` + panel + line đánh dấu AI, điền yêu cầu kỹ thuật, và thông báo người bấm; Sales không có quyền sửa nháp; run không kẹt, không chạy lại, không trùng (D-02, D-03, D-05, D-06, D-09, D-10, D-11, D-12).

## Scope
- In:
  - Permission `estimate:ai_prefill` (`estimate.permissions.ts`, danh sách `estimatePermissions`), cấp cho `sales`,`salesManager` trong `seed-roles.ts`; nhãn quyền vi/en trong `frontend/src/kernel/langs/{vi,en}/permission.json`; guard role code `sales|salesManager|director` trong service (admin bị từ chối).
  - `POST /sales/estimates/ai-prefill {requestId}` → 202 `{runId}`; `GET /sales/estimates/ai-prefill/:runId` → `{status, error, estimateId, summary}` cùng permission + `dataScope.assertVisible` trên request của run (ngoài scope → 404). `@Throttle` 5/phút/người; trần 20 run/người/ngày (429). Điều kiện 409 khác: request status ∉ `draft|assigned`; đã có estimate và không thỏa D-06; không có attachment và `technical_requirements` rỗng; unique index run active (23505 → 409). Thiếu `ANTHROPIC_API_KEY` → 503; catalog >3000 item → 409.
  - Queue `ESTIMATE_AI_QUEUE` với `settings:{maxStalledCount:0}`, job `attempts:1`; processor `queued → running → succeeded|failed`; `queue.add` lỗi → run `failed`; `@Cron` mỗi phút đặt `failed` cho run `queued|running` quá 10 phút.
  - Nạp `projects.quotation_template_id` của request (nếu có) bằng SQL đọc `quotation_template_*` rồi truyền vào `extractEstimateDraft` (D-11).
  - Writer (1 transaction): khoá request `FOR UPDATE` (re-run: khoá estimate rồi request, `estimate-read.port.ts:27-31`); kiểm lại request tồn tại chưa xoá, status ∈ {draft, assigned}, chưa có estimate (hoặc D-06), mọi `itemId` còn sống; bắt 23505 trên `request_id` → lỗi rõ nghĩa; tạo estimate bằng `createWithDocumentCode`, `created_by` = người bấm; panel/line cờ AI, `unit_cost = reference_price` (D-04); `recalculateRevision`; `assigned → estimating` qua `statusPort.advance`; `technical_requirements` theo D-10 (tổng ≤10000); `recordRequestActivity` ghi tóm tắt `unmatched` (đã che giá); đặt run `succeeded` + `estimate_id` trong cùng transaction; lỗi bất kỳ → rollback, run `failed` với mã lỗi có kiểu.
  - Thông báo `sales.estimate.ai_filled`/`ai_failed` cho người bấm (+ kỹ sư được giao) **sau commit**, bọc try/catch (mẫu `estimate.service.ts:656-683`).
  - Mọi route sửa nháp hiện có vẫn từ chối Sales (không đổi `assertWritable`).
- Out: UI (task-08); assign khởi động dự toán (task-07).

## Coverage
- CP-03
- CP-04

## Ownership
- Create: `backend/src/plugins/sales/estimate/services/estimate-ai-prefill.service.ts`, `.../services/estimate-ai-writer.service.ts`, `.../services/estimate-ai-sweeper.service.ts`, `.../estimate-ai-prefill.processor.ts`, `.../estimate-ai.controller.ts`, `.../constants/estimate-ai.constant.ts`, `.../dto/ai-prefill.dto.ts`, `.../services/estimate-ai-prefill.service.spec.ts`
- Modify: `estimate.module.ts`, `permissions/estimate.permissions.ts`, `backend/src/kernel/core/database/seeds/seed-roles.ts`, `frontend/src/kernel/langs/vi/permission.json`, `frontend/src/kernel/langs/en/permission.json`
- Read: `ai/extract-estimate-draft.ts`, `backend/src/kernel/core/files/files.module.ts:20-25`, `backend/src/kernel/core/audit/notification.service.ts:129`, `services/estimate.service.ts:225-292`

## Steps
1. Spec trigger (client AI giả, queue chạy inline): sales chủ request → 202; sales khác → 404; engineer và admin → 403; request `estimated`/`estimating` → 409; request có estimate thủ công → 409; hai lần trigger đồng thời → một 202 một 409; request rỗng → 409; thiếu key → 503; vượt 20 run/ngày → 429.
2. Spec GET: chủ request 200; sales khác và engineer không liên quan → 404; admin → 403.
3. Spec writer thành công: 1 estimate, revision 1 `draft`, panel/line đúng, cờ AI đúng, `unit_cost=reference_price`, tổng khác 0 khi có giá; request `assigned` → `estimating`, `draft` giữ `draft`; `technical_requirements` trống được điền, đã có chữ được thêm `[AI] ` và không quá 10000 ký tự; run `succeeded` + `estimate_id` cùng transaction.
4. Spec lỗi/race: client AI lỗi, output sai schema, lỗi DB giữa transaction, request bị Hủy hoặc xoá trong lúc chạy, kỹ sư tạo estimate thủ công trước writer, item bị xoá trước writer → 0 hàng estimate (trừ trường hợp item chết: dòng đó bị bỏ + note), run `failed` có mã, thông báo `ai_failed`; `emit` ném lỗi sau commit → run vẫn `succeeded`.
5. Spec D-05: id lạ bị bỏ, `ai_note` nêu lý do, không có `items` mới (đếm trước/sau).
6. Spec D-06: re-run khi request `draft` và nháp toàn AI chưa verify → thay thế; có dòng đã verify hoặc request `assigned` → 409.
7. Spec quyền nháp: sales PATCH/POST route sửa panel/line/verify/submit → 403/404 như hiện hành; engineer được giao sửa, verify, submit được; response engineer qua `expectNoMoneyKeys`.
8. Spec rò giá qua chữ: tài liệu giả chứa "Đơn giá 85.000.000đ" → `ai_note`, activity timeline, `technical_requirements`, `summary` và nội dung thông báo không còn số tiền khi đọc bằng engineer.
9. Spec vòng đời: run `running` quá 10 phút → sweeper đặt `failed`; `queue.add` lỗi → `failed`; job stalled không chạy lại (`maxStalledCount:0`); sau `failed`, request trigger lại được.
10. Nạp template: request thuộc project có template → prompt chứa panel/line của template; không có template → prompt không có phần đó.

## Acceptance
- AC-04, AC-05, AC-06, AC-07, AC-11, AC-15.

## Dependencies
- task-01-estimate-ai-columns-verify.md
- task-02-ai-extraction-service.md
- task-04-template-api.md
- task-05-project-template-backend.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales src/kernel/core/database/seeds" && docker compose exec -T frontend sh -c "npx vitest run src/kernel/langs src/kernel/platform"`
- Named probe: `estimate-ai-prefill.service.spec.ts` (Steps 1-10); suite `src/plugins/sales` hiện có cho AC-11; `permission-labels.test.ts` cho nhãn quyền mới.
- Reachability: known cho source (client AI giả được tiêm, không là bằng chứng live); live với Anthropic `UNKNOWN` — để task-12.
- Oracle: exit 0, 0 skipped; số hàng DB đúng từng bước; status code đúng; không số tiền trong chuỗi AI mà engineer đọc được.
- Counterexample: writer commit estimate trước khi `advance` request thất bại phải làm Step 4 fail; bỏ unique index run phải làm Step 1 (đồng thời) fail; cấp `estimate:update` cho sales phải làm Step 7 fail; bỏ `redactMoney` phải làm Step 8 fail; thiếu `maxStalledCount:0` phải làm Step 9 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales src/kernel/core/database/seeds" && docker compose exec -T frontend sh -c "npx vitest run src/kernel/langs src/kernel/platform"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: ec86dcde6271bbcbbccffc14fe44c47ceae9f67bf474f21866bb52783b55ad70
```text
-- backend half (exit 0)
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales src/kernel/core/database/seeds
PASS src/plugins/sales/quotation/quotation.controller.spec.ts (21.06 s)
[Nest] 8591  - 11/23/2026, 12:25:05 PM   ERROR [EstimateAiPrefillService] Could not notify the AI draft DT_2026_0001
Error: bell down
    at Object.<anonymous> (/app/src/plugins/sales/estimate/services/estimate-ai-prefill.service.spec.ts:766:49)
    at Promise.finally.completed (/app/node_modules/jest-circus/build/jestAdapterInit.js:1561:28)
    at new Promise (<anonymous>)
    at callAsyncCircusFn (/app/node_modules/jest-circus/build/jestAdapterInit.js:1501:10)
    at _callCircusTest (/app/node_modules/jest-circus/build/jestAdapterInit.js:1011:40)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at _runTest (/app/node_modules/jest-circus/build/jestAdapterInit.js:951:3)
    at /app/node_modules/jest-circus/build/jestAdapterInit.js:853:7
    at _runTestsForDescribeBlock (/app/node_modules/jest-circus/build/jestAdapterInit.js:866:11)
    at _runTestsForDescribeBlock (/app/node_modules/jest-circus/build/jestAdapterInit.js:861:11)
    at _runTestsForDescribeBlock (/app/node_modules/jest-circus/build/jestAdapterInit.js:861:11)
    at run (/app/node_modules/jest-circus/build/jestAdapterInit.js:765:3)
    at runAndTransformResultsToJestFormat (/app/node_modules/jest-circus/build/jestAdapterInit.js:1993:21)
    at jestAdapter (/app/node_modules/jest-circus/build/runner.js:111:19)
    at runTestInternal (/app/node_modules/jest-runner/build/testWorker.js:276:16)
    at runTest (/app/node_modules/jest-runner/build/testWorker.js:344:7)
    at Object.worker (/app/node_modules/jest-runner/build/testWorker.js:498:12)
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_RATE_LIMITED
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_INTERNAL (Error)
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_OUTPUT_INVALID
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_INTERNAL (Error)
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_INTERNAL (ConflictException)
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_REQUEST_CHANGED
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_REQUEST_CHANGED
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_REQUEST_CHANGED
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_OUTPUT_INVALID
[Nest] 8591  - 11/23/2026, 12:25:05 PM   ERROR [EstimateAiPrefillService] AI run 1 could not be queued
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts (21.614 s)
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiSweeperService] AI run 1 timed out
[Nest] 8591  - 11/23/2026, 12:25:05 PM    WARN [EstimateAiPrefillService] AI run 1 failed: AI_RUN_INACTIVE
PASS src/plugins/sales/estimate/services/estimate-ai-prefill.service.spec.ts (21.706 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (22.143 s)
[Nest] 8598  - 11/23/2026, 12:25:10 PM   ERROR [QuotationApprovalService] Could not send the sales.quotation.submitted notice of quotation 03-23112026/BG
Error: queue down
    at Object.<anonymous> (/app/src/plugins/sales/quotation/services/quotation-approval.service.spec.ts:227:51)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts (10.172 s)
PASS src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts (11.53 s)
PASS src/plugins/sales/estimate/database/estimate-ai-run-sql.spec.ts
PASS src/plugins/sales/order/services/order-convert.service.spec.ts (14.09 s)
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts (14.904 s)
PASS src/plugins/sales/estimate/services/estimate-verify.service.spec.ts (36.513 s)
PASS src/plugins/sales/request/request.controller.spec.ts (9.298 s)
PASS src/plugins/sales/order/order.controller.spec.ts (6.935 s)
[Nest] 8592  - 11/23/2026, 12:25:27 PM   ERROR [ExceptionsHandler] Error: disk full
    at Object.<anonymous> (/app/src/plugins/sales/template/template.controller.spec.ts:564:40)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
PASS src/plugins/sales/template/template.controller.spec.ts (7.964 s)
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts (8.92 s)
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts (8.02 s)
PASS src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts
PASS src/plugins/sales/estimate/services/estimate-pricing.service.spec.ts (8.23 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (8.106 s)
PASS src/kernel/core/database/seeds/role-matrix-doc.spec.ts (8.174 s)
PASS src/plugins/sales/request/services/request.service.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (8.295 s)
PASS src/plugins/sales/request/services/request-owner-race.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/sales/order/services/order-edit.service.spec.ts
PASS src/plugins/sales/template/database/quotation-template-seed.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-pdf.render.spec.ts
PASS src/plugins/sales/_shared/ports/order-production.port.spec.ts
PASS src/plugins/sales/_shared/ports/order-material-read.port.spec.ts
PASS src/plugins/sales/_shared/ports/request-status.port.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/sales/template/database/template-in-live-project.spec.ts
PASS src/plugins/sales/template/database/quotation-template.migration.spec.ts
PASS src/plugins/sales/estimate/ai/extract-estimate-draft.spec.ts
PASS src/plugins/sales/estimate/database/estimate-ai-fields.migration.spec.ts
PASS src/plugins/sales/quotation/services/quotation-pricing.spec.ts
PASS src/plugins/sales/_shared/utils/request-scope.util.spec.ts
PASS src/plugins/sales/estimate/database/estimate-pricing.migration.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-document.util.spec.ts
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/_shared/ports/request-close-registry.spec.ts
PASS src/plugins/sales/quotation/config/quotation-letterhead.config.spec.ts
Test Suites: 44 passed, 44 total
Tests:       919 passed, 919 total
Snapshots:   0 total
Time:        56.366 s, estimated 61 s
Ran all test suites matching src/plugins/sales|src/kernel/core/database/seeds.
PASS src/plugins/sales/quotation/services/quotation-code.spec.ts (12.153 s)
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/plugins/sales/order/database/bom-item-link.migration.spec.ts
Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
Snapshots:   0 total
Time:        13.125 s, estimated 14 s
Ran all test suites matching ^/app/src/plugins/sales/order/database/bom-item-link\.migration\.spec\.ts$|^/app/src/plugins/sales/quotation/services/quotation-code\.spec\.ts$|^/app/src/plugins/sales/_shared/utils/sales-document-code\.util\.spec\.ts$.
[Nest] 8650  - 11/23/2026, 12:25:54 PM     LOG [LinkBomLinesToItems1793230418562] sales_quotation_bom_lines: 1 line(s) left without an item link
[Nest] 8650  - 11/23/2026, 12:25:54 PM     LOG [LinkBomLinesToItems1793230418562] sales_order_bom_lines: 2 line(s) left without an item link
[Nest] 8650  - 11/23/2026, 12:25:54 PM     LOG [LinkBomLinesToItems1793230418562] sales_quotation_bom_lines: 1 line(s) left without an item link
[Nest] 8650  - 11/23/2026, 12:25:54 PM     LOG [LinkBomLinesToItems1793230418562] sales_order_bom_lines: 2 line(s) left without an item link
BE_EXIT=0

-- frontend half (exit 0)
 RUN  v4.1.10 /app
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 52ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 35ms
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 895ms
     ✓ resolves every key in the vi bundle  460ms
     ✓ resolves every key in the en bundle  418ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 20ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1419ms
     ✓ resolves every module page to a navigation entry  1416ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 51ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 7608ms
     ✓ gates no control on a literal permission string  4047ms
     ✓ declares every gated scope in a feature permission keys file  355ms
     ✓ leaves wildcard resolution to the permission helper  3203ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 61ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 32ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (195 tests) 200ms
 ↓ src/kernel/langs/tests/permission-labels.test.ts (6 tests | 6 skipped)
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 19ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 25ms
 Test Files  12 passed | 1 skipped (13)
      Tests  269 passed | 6 skipped (275)
   Start at  12:25:59
   Duration  20.82s (transform 15.17s, setup 2.65s, import 49.75s, tests 10.42s, environment 16.78s)
FE_EXIT=0

-- supplemental: same frontend command with backend/src/plugins copied into the frontend container for the run, then removed (the container cannot see backend/, so permission-labels.test.ts skips in the plain run)
 RUN  v4.1.10 /app
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 18ms
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 62ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 36ms
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 742ms
     ✓ resolves every key in the vi bundle  349ms
     ✓ resolves every key in the en bundle  369ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1427ms
     ✓ resolves every module page to a navigation entry  1422ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 37ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 7703ms
     ✓ gates no control on a literal permission string  3726ms
     ✓ leaves wildcard resolution to the permission helper  3767ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 51ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 36ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (195 tests) 147ms
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 29ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (35 tests) 38ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 28ms
 Test Files  13 passed (13)
      Tests  275 passed (275)
   Start at  12:26:41
   Duration  19.48s (transform 13.35s, setup 2.95s, import 46.35s, tests 10.35s, environment 17.43s)
VITEST_EXIT=0
```

Review: PASS (code-auditor, round 3 of review; round 1 PASS_WITH_WARNINGS: added wiring tests for cron, throttle, permission, 202 and module providers, an [AI] marker on the first fill so a re-run replaces the block, an atomic queued-to-running claim, redaction of the run summary, plan IDs removed from test names; round 2 PASS_WITH_WARNINGS on the fake-only evidence, fixed by estimate-ai-run-sql.spec.ts running the service's own SQL constants on real Postgres in a rolled-back scratch schema).
Proven by mutation (code broken, named test fails, restored): swallowing the advance error; removing the active-run unique index in the fixture; granting estimate:update to sales; removing redactMoney in the writer; removing maxStalledCount from the queue registration; removing @Cron and @Throttle; changing the claim condition; removing is_deleted=false from the live-items query. Removing redactMoney only in the schema layer is not caught by this task's spec because the writer redacts again (the task-02 spec catches it).
Limitations (not proven here): writer.write end to end, trigger and execute run only on in-memory fakes that ignore FOR UPDATE and FOR SHARE; no test shows two transactions contending for a lock, and the lock order (estimate then request) is code only; Redis and Bull are not exercised (a stalled job failing instead of re-running is checked by queue settings metadata only); Anthropic live is UNKNOWN; HTTP routes are checked by decorator metadata, not by a request. The live-items test shows the FOR SHARE statement runs, not that a delete waits. task-12 now lists these DB-dev checks explicitly (create path, re-run path, double click giving 409, sweeper failure). Low review notes left open: a Sales note that itself starts with the [AI] marker is cut on re-run; the 20 per day cap is checked then inserted (not atomic; throttle bounds the overshoot); GET of an unknown run is 404 while an admin gets 403 for an existing one; the template SQL still runs when the template feature is off; the sweeper counts from created_at so a run queued longer than 10 minutes is failed; the frontend has no bell label yet for sales.estimate.ai_filled and ai_failed (task-08). Other files touched outside the listed Ownership: estimate-fixture.helper-spec.ts (fake run and attachment repositories) and the new estimate-ai-run-sql.spec.ts.
