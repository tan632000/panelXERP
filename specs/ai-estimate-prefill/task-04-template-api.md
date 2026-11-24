# Task 04 — API quản lý template + quyền + nhãn quyền

Status: done

## Outcome
CRUD template (kèm panel và line) dưới quyền `quotation_template:*`, route `/sales/quotation-templates`, đăng ký như feature của plugin `sales`, kèm nhãn quyền vi/en (D-08).

## Scope
- In:
  - Feature đã đăng ký ở task-03; thêm controller/service/dto tại `backend/src/plugins/sales/template/`.
  - Route (`@Controller('sales/quotation-templates')`): `GET` (lọc `isActive`, tìm tên/mã), `GET :id`, `POST`, `PATCH :id` (thay toàn bộ panel/line trong 1 transaction), `POST :id/deactivate|activate`, `DELETE :id` (xoá mềm; kiểm tra project dùng do task-05 bổ sung).
  - Validation: mỗi `itemId` là item còn sống (400); `quantity` ∈ (0, `MAX_BOM_QUANTITY`]; tag duy nhất trong template; code `TPL_xxxx` trùng → 409.
  - Permission `quotation_template:read|create|update|delete`; cấp trong `seed-roles.ts`: read cho sales, salesManager, engineer, engineeringLead; create/update/delete cho salesManager, engineeringLead; director/admin qua `*:*`.
  - Nhãn quyền: thêm resource `quotation_template` và các action vào `frontend/src/kernel/langs/{vi,en}/permission.json` để `permission-labels.test.ts` qua.
- Out: UI (task-10); trường project (task-05).

## Coverage
- CP-01
- CP-04

## Ownership
- Create: `backend/src/plugins/sales/template/template.controller.ts`, `.../services/quotation-template.service.ts`, `.../dto/quotation-template.dto.ts`, `.../permissions/quotation-template.permissions.ts`, `.../template.controller.spec.ts`
- Modify: `backend/src/plugins/sales/template/template.module.ts`, `backend/src/plugins/sales/sales.features.ts` (permissions của feature), `backend/src/kernel/core/database/seeds/seed-roles.ts`, `frontend/src/kernel/langs/vi/permission.json`, `frontend/src/kernel/langs/en/permission.json`
- Read: `backend/src/plugins/crm/project/project.controller.ts`, `frontend/src/kernel/langs/tests/permission-labels.test.ts`

## Steps
1. Controller spec qua `RolesGuard` với `seededRolePermissions`: salesManager tạo 201; sales tạo 403 nhưng đọc 200; engineer đọc 200.
2. Tạo với `itemId` lạ → 400; code trùng → 409; tag trùng → 409.
3. PATCH thay panel/line atomically (lỗi giữa chừng không để lại dữ liệu nửa vời).
4. deactivate → 200 rồi activate → 200; DELETE template chưa dùng → 200 và biến mất khỏi danh sách.
5. Chạy `permission-labels.test.ts` và các spec seed-roles hiện có (không lệch `role-matrix`).

## Acceptance
- AC-03 (phần tạo/sửa): tạo hợp lệ, 400/409 đúng; phần "xoá khi project đang dùng → 409" do task-05 chứng minh.

## Dependencies
- task-03-template-schema-seed.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales/template src/kernel/core/database/seeds" && docker compose exec -T frontend sh -c "npx vitest run src/kernel/langs src/kernel/platform"`
- Named probe: `template.controller.spec.ts` (Steps 1-4); `permission-labels.test.ts` và `permission-gating-convention.test.ts` (Step 5); spec seed-roles/role-matrix hiện có.
- Reachability: known.
- Oracle: exit 0 cả hai lệnh, 0 skipped; status code đúng từng bước.
- Counterexample: cấp `quotation_template:create` cho sales phải làm Step 1 fail; thiếu nhãn `quotation_template` trong `permission.json` phải làm `permission-labels.test.ts` fail; PATCH không transaction phải làm Step 3 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales/template src/kernel/core/database/seeds" && docker compose exec -T frontend sh -c "npx vitest run src/kernel/langs src/kernel/platform"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 09a711763bd73d2351710a2e87f732da5b5e54fa1d0a6b051cbb076e7af6e79f
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
> node scripts/run-tests.js --ci src/plugins/sales/template src/kernel/core/database/seeds
PASS src/plugins/sales/template/database/quotation-template-seed.spec.ts (6.764 s)
PASS src/plugins/sales/template/database/quotation-template.migration.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (19.438 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (19.518 s)
PASS src/kernel/core/database/seeds/role-matrix-doc.spec.ts (20.651 s)
[Nest] 4725  - 11/23/2026, 3:42:11 AM   ERROR [ExceptionsHandler] Error: disk full
    at Object.<anonymous> (/app/src/plugins/sales/template/template.controller.spec.ts:555:40)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
PASS src/plugins/sales/template/template.controller.spec.ts (21.474 s)
Test Suites: 9 passed, 9 total
Tests:       150 passed, 150 total
Snapshots:   0 total
Time:        22.42 s, estimated 35 s
Ran all test suites matching src/plugins/sales/template|src/kernel/core/database/seeds.

-- frontend half (exit 0)
 RUN  v4.1.10 /app
 ↓ src/kernel/langs/tests/permission-labels.test.ts (6 tests | 6 skipped)
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 779ms
     ✓ resolves every key in the vi bundle  347ms
     ✓ resolves every key in the en bundle  413ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 55ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1866ms
     ✓ resolves every module page to a navigation entry  1863ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 7304ms
     ✓ gates no control on a literal permission string  2645ms
     ✓ leaves wildcard resolution to the permission helper  4389ms
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 74ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 64ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 42ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 51ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 24ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (193 tests) 184ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 19ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (32 tests) 27ms
 Test Files  12 passed | 1 skipped (13)
      Tests  264 passed | 6 skipped (270)
   Start at  03:42:17
   Duration  21.05s (transform 15.67s, setup 4.23s, import 48.51s, tests 10.49s, environment 18.22s)

-- supplemental: same frontend command with backend/src/plugins copied into the frontend container for the run, then removed (the container cannot see backend/, so permission-labels.test.ts skips in the plain run)
 RUN  v4.1.10 /app
 ✓ src/kernel/platform/tests/plugin-slot.test.tsx (2 tests) 71ms
 ✓ src/kernel/platform/tests/i18n-keys-exist.test.ts (3 tests) 751ms
     ✓ resolves every key in the vi bundle  336ms
     ✓ resolves every key in the en bundle  396ms
 ✓ src/kernel/platform/tests/app-navigation.test.ts (5 tests) 58ms
 ✓ src/kernel/platform/tests/slot-registry.test.ts (6 tests) 59ms
 ✓ src/kernel/platform/tests/permission-gating-convention.test.ts (3 tests) 7810ms
     ✓ gates no control on a literal permission string  3325ms
     ✓ declares every gated scope in a feature permission keys file  315ms
     ✓ leaves wildcard resolution to the permission helper  4166ms
 ✓ src/kernel/platform/tests/route-navigation-coverage.test.ts (1 test) 1491ms
     ✓ resolves every module page to a navigation entry  1488ms
 ✓ src/kernel/platform/tests/navigation-permissions.test.ts (7 tests) 41ms
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (5 tests) 43ms
 ✓ src/kernel/platform/tests/resolve-enabled-plugins.test.ts (4 tests) 37ms
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 31ms
 ✓ src/kernel/platform/tests/test-layout.test.ts (193 tests) 146ms
 ✓ src/kernel/platform/tests/toast-namespace-messages.test.ts (3 tests) 22ms
 ✓ src/kernel/platform/tests/delete-confirmation.test.ts (32 tests) 25ms
 Test Files  13 passed (13)
      Tests  270 passed (270)
   Start at  03:43:00
   Duration  22.77s (transform 15.49s, setup 3.12s, import 50.74s, tests 10.59s, environment 21.24s)
VITEST_EXIT=0
```

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS: added tests for search/order and for FOR SHARE and the pessimistic_write lock, each shown to fail when the code is removed).
Limitations: The plain frontend half skips the 6 permission-labels tests (0 skipped only in the supplemental run). The controller spec uses an in-memory repository, so unique indexes, FOR SHARE and row locks are proven by assertions on the calls, not by Postgres. Search is tested against a spec-local findAndCount that does not emulate erp_unaccent accent folding. The "delete blocked while a project uses it" case belongs to task-05; docs/permission/role-matrix.md has no quotation_template row yet (task-12). Low review notes left open: itemId has no upper bound, remove() has no transaction.
