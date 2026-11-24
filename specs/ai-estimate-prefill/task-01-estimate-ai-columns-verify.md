# Task 01 — Estimate lưu dấu vết AI, bảng run, và kỹ sư verify được

Status: done

## Outcome
Panel và BOM line của dự toán có cột AI (giữ nguyên khi "Lập bản mới"); có bảng `sales_estimate_ai_runs`; kỹ sư (engineer được giao, engineeringLead, director) verify từng dòng hoặc tất cả dòng AI của bản nháp; response nêu `unverifiedAiCount`; không khoá giá mới nào lộ ra engineer (D-04, D-07, D-09).

## Scope
- In:
  - Migration `backend/src/plugins/sales/estimate/database/migrations/<Date.now()>-add-estimate-ai-fields.ts`: `sales_estimate_panels` thêm `is_ai_generated bool default false`, `ai_note varchar(1000) null`; `sales_estimate_bom_lines` thêm `is_ai_generated bool default false`, `ai_confidence numeric(3,2) null`, `ai_note varchar(1000) null`, `is_verified bool default false`; bảng `sales_estimate_ai_runs` (`id`, `request_id`, `status` varchar(20), `error` varchar(200) null, `estimate_id` int null, `summary` text null, `created_by` int, `created_at`, `updated_at`) kèm unique index từng phần `(request_id) WHERE status IN ('queued','running')`; `down()` xoá đúng các cột/bảng/index đó.
  - Entity `estimate-panel.entity.ts`, `estimate-bom-line.entity.ts` thêm cột; entity mới `estimate-ai-run.entity.ts`; enum `estimate-ai-run-status.enum.ts`.
  - `EstimateService.assertWritable` đổi từ `private` sang public (`estimate.service.ts:466`); `copyTree` (`estimate.service.ts:484-530`) chép cả cột AI và `is_verified` vào bản nháp mới.
  - View: `EstimateBomLineView` và `EstimatePanelView` + mapping trong `utils/estimate-revision.util.ts:14-25,157-168` trả các trường AI; detail trả `unverifiedAiCount` = số BOM line `is_ai_generated AND NOT is_verified` của revision mới nhất. Presenter giá (`estimate-price-visibility.util.ts`) không phải đổi vì cột AI không phải money key.
  - Route `PATCH :id/bom-lines/:lineId/verify` và `POST :id/verify` dưới `ESTIMATE_UPDATE`, chỉ trên revision `draft`; đi qua `assertWritable`, `assertDraft`, `assertRequestEstimatable`; idempotent; sửa số lượng/vật tư của dòng AI không đổi `is_verified`.
- Out: sinh dữ liệu AI (task-06); UI (task-09).

## Coverage
- CP-04
- CP-05

## Ownership
- Create: migration trên, `backend/src/plugins/sales/estimate/entities/estimate-ai-run.entity.ts`, `backend/src/plugins/sales/estimate/enums/estimate-ai-run-status.enum.ts`, `backend/src/plugins/sales/estimate/services/estimate-verify.service.ts`, `backend/src/plugins/sales/estimate/services/estimate-verify.service.spec.ts`
- Modify: `entities/estimate-panel.entity.ts`, `entities/estimate-bom-line.entity.ts`, `services/estimate.service.ts` (export `assertWritable`, `copyTree`), `utils/estimate-revision.util.ts`, `estimate.controller.ts`, `estimate.module.ts`, `estimate.controller.spec.ts`
- Read: `services/estimate-edit.service.ts:198-204`, `estimate-fixture.helper-spec.ts`, `database/migrations/1792856909735-init-estimate.ts`

## Steps
1. Spec service: dòng AI mới → `unverifiedAiCount=1`; verify dòng → 0; verify lần 2 → vẫn 200, không đổi; `POST :id/verify` đặt hết dòng AI; dòng thủ công không đổi.
2. Spec quyền qua `RolesGuard`: engineer được giao 200; engineer khác → 404; sales → 403; revision `submitted` → 409; request ở `draft` → 409 (chưa sửa/verify được).
3. Spec revise: nháp có dòng AI đã verify → "Lập bản mới" → bản mới giữ `is_ai_generated`, `ai_note`, `ai_confidence`, `is_verified` và `unverifiedAiCount` đúng.
4. Spec không lộ giá: response của engineer sau verify và sau revise qua `expectNoMoneyKeys`.
5. Spec migration trên schema tạm: cột/bảng/index có mặt; hai run `queued` cùng request → 23505; `down()` gỡ sạch.
6. Cài đặt; `npm run validate:migrations`; `npm run migration:run` trên DB dev.

## Acceptance
- AC-01: cột AI tồn tại, giữ qua revise; verify từng dòng/tất cả hoạt động và idempotent.
- AC-11: các suite `src/plugins/sales/estimate` hiện có vẫn qua.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales/estimate"`
- Named probe: `estimate-verify.service.spec.ts` (Steps 1-4), case migration (Step 5), toàn bộ suite estimate (AC-11).
- Reachability: known — docker compose backend chạy được jest, validate:migrations và migration:run.
- Oracle: exit 0, 0 skipped; verify idempotent; engineer khác nhận 404; revise giữ cờ AI.
- Counterexample: `copyTree` không chép cột AI phải làm Step 3 fail; verify cho revision `submitted` mà không 409 phải làm Step 2 fail; thêm khoá `aiUnitCost` vào response phải làm `expectNoMoneyKeys` fail.
- Artifacts: DB dev giữ các cột đã migrate; schema tạm do spec dọn.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales/estimate"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 4ddf638782ac56b8c00ac11bf761d5612f59b4d13a362e70b85f7f2295763d1e
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales/estimate"
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> tsc --noEmit -p tsconfig.build.json
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
Migration filename check passed (55 files).
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts (21.749 s)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts (23.741 s)
PASS src/plugins/sales/estimate/database/estimate-ai-fields.migration.spec.ts
PASS src/plugins/sales/estimate/database/estimate-pricing.migration.spec.ts
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/estimate/services/estimate-pricing.service.spec.ts (8.036 s)
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts (33.479 s)
PASS src/plugins/sales/estimate/services/estimate-verify.service.spec.ts (34.155 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (42.959 s)
Test Suites: 9 passed, 9 total
Tests:       155 passed, 155 total
Snapshots:   0 total
Time:        44.096 s
```

Review: code-auditor PASS (first pass PASS_WITH_WARNINGS; Medium-1 IDOR test, Low-1 public `assertWritable`, Low-2 index assert fixed and re-reviewed). Wider regression `src/plugins/sales src/plugins/production src/plugins/inventory/material`: 57 suites, 818 tests passed.

Limitations: service specs run on the in-memory fixture (lock order is not proven against Postgres); `migration:run` applied to the dev DB; `verifyAll` saves line by line; verify does not set `estimate.updatedBy`; the migration adds two CHECKs (`status`, `ai_confidence` 0..1) beyond the task text.
