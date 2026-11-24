# Task 05 — Project: cột template, kiểm hợp lệ và chặn xoá (backend)

Status: done

## Outcome
`projects.quotation_template_id` nullable (không FK cứng); project nhận template đang hoạt động hoặc null; xoá template đang được project dùng bị 409; project cũ không đổi (D-13).

## Scope
- In:
  - Migration `backend/src/plugins/crm/project/database/migrations/<Date.now()>-add-project-quotation-template.ts` (timestamp lớn hơn migration template của task-03): cột `int null` + index, không FK; `down()` gỡ cột.
  - `project.entity.ts`, `create-project.dto.ts`, `update-project.dto.ts`, project service: nhận `quotationTemplateId` (null được); id không tồn tại, đã xoá hoặc `is_active=false` → 400, kiểm bằng SQL đọc `quotation_templates` (shortcut ghi trong code: `shortcut: cross-plugin table read, move to a gateway if more template fields are needed`); trả `quotationTemplateId` và tên template ở detail/list.
  - `QuotationTemplateService.delete` kiểm project tham chiếu (409) bằng SQL trên `projects` (mẫu `ITEM_IN_LIVE_ESTIMATE_SQL`, `estimate.service.ts:109`); khi feature `template` tắt thì kiểm template bị bỏ qua.
- Out: UI (task-11); tự chọn template cho request; nạp template vào prompt AI (task-06).

## Coverage
- CP-02
- CP-01

## Ownership
- Create: migration trên
- Modify: `backend/src/plugins/crm/project/entities/project.entity.ts`, `.../dto/create-project.dto.ts`, `.../dto/update-project.dto.ts`, `.../services/` (project service, đọc để xác định file), `.../project.controller.spec.ts`, `backend/src/plugins/sales/template/services/quotation-template.service.ts`, `backend/src/plugins/sales/template/template.controller.spec.ts`
- Read: `backend/src/plugins/sales/estimate/services/estimate.service.ts:109-146`, `backend/src/plugins/sales/sales.plugin.ts:20`

## Steps
1. Controller spec: tạo project không có `quotationTemplateId` → 201 như cũ; với template hoạt động → 201 và detail trả template; id lạ, đã xoá hoặc đã tắt → 400; PATCH sang null → 200.
2. Spec template: DELETE template đang được project dùng → 409; không dùng → 200.
3. Migration spec: cột tồn tại, không có FK, `down()` gỡ sạch, project cũ có giá trị null.
4. `npm run validate:migrations`; `npm run migration:run`.

## Acceptance
- AC-12 (backend); phần xoá của AC-03.

## Dependencies
- task-04-template-api.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/crm/project src/plugins/sales/template"`
- Named probe: `project.controller.spec.ts` (Steps 1, 3), `template.controller.spec.ts` ca xoá (Step 2).
- Reachability: known.
- Oracle: exit 0, 0 skipped; status code đúng từng bước.
- Counterexample: chấp nhận template `is_active=false` phải làm Step 1 fail; DELETE không kiểm project phải làm Step 2 fail; thêm FK cứng phải làm Step 3 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/crm/project src/plugins/sales/template"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 4dc78f4cfc8e7aaffba75baad46e1de9f434de55be6952f11b5d246b59c81dd1
```text
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
Migration filename check passed (57 files).
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/crm/project src/plugins/sales/template
PASS src/plugins/crm/project/database/add-project-quotation-template.migration.spec.ts
PASS src/plugins/sales/template/database/template-in-live-project.spec.ts (6.357 s)
PASS src/plugins/sales/template/database/quotation-template.migration.spec.ts
PASS src/plugins/crm/project/services/project.service.spec.ts
PASS src/plugins/sales/template/database/quotation-template-seed.spec.ts (8.869 s)
PASS src/plugins/crm/project/project.controller.spec.ts (23.72 s)
[Nest] 5692  - 11/23/2026, 8:25:56 AM   ERROR [ExceptionsHandler] Error: disk full
    at Object.<anonymous> (/app/src/plugins/sales/template/template.controller.spec.ts:564:40)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
PASS src/plugins/sales/template/template.controller.spec.ts (22.062 s)
Test Suites: 7 passed, 7 total
Tests:       103 passed, 103 total
Snapshots:   0 total
Time:        23.053 s, estimated 24 s
Ran all test suites matching src/plugins/crm/project|src/plugins/sales/template.
```

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS: the delete-guard SQL was never executed by a test, now template-in-live-project.spec.ts runs TEMPLATE_IN_LIVE_PROJECT_SQL on Postgres in a rolled-back scratch schema and fails when the is_deleted clause is removed).
Limitations: Accepted race (D-13, no foreign key): assigning a template and deleting it at the same moment can leave a project pointing at a deleted template (a dangling id and name, no data loss); task-06 must check is_active and is_deleted at run time. Two files outside the Ownership list were added as valid extensions: crm/project/database/add-project-quotation-template.migration.spec.ts (Step 3 needs a real DB) and sales/template/database/template-in-live-project.spec.ts. The project controller spec mocks the template read, so only the delete guard SQL runs on a real database. No UI or end-to-end run.
