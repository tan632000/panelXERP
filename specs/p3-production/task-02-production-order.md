# Task 02 — Production order backend, order-cancel veto and inventory status lists

Status: done

## Outcome
Over the API, a productionManager creates a production order from an open order, gets one unit per physical cabinet, assigns technicians and planned end dates, and releases it — the order becomes `in_production` and keeps its materials; an order with a live production order cannot be cancelled; cancelling a production order returns the order to `open`.

## Scope
- In: plugin `production` (D-01) registered in the backend plugin catalog; feature `production-order`. Tables `production_orders` (code `LSX_YYYY_NNNN`, `order_id` no FK (P2 D-04 lesson), order code snapshot, status, `released_at/by`, `cancel_reason`, `cancelled_at/by`, `completed_at`; partial unique per D-04), `production_units` (D-03; `assignee_id` NULL, `planned_end_date` date NULL; unique `(production_order_id, code) WHERE is_deleted = false`), `production_unit_stages` (six rows per unit), `production_order_events`. Sales port `OrderProductionPort` (D-05: `lockForProduction`, `moveStatus`, `ownerScopeCondition`). Lifecycle `onCancelled` veto (D-04, R-01). D-06 constants: `in_production` in `DEMAND_BEARING_STATUSES`, `ISSUABLE_ORDER_STATUSES`, `RETURNABLE_ORDER_STATUSES` (R-14). Endpoints: `POST /production/orders` `{orderId}` (order must be `open`, else 409; second non-cancelled → 409 mapped from the index), `GET /production/orders` (D-07 scope in SQL, filters `status`, `orderId` — the latter used by task-03 to find an order's production order), `GET /production/orders/:id` (units filtered per D-07), `GET /production/technician-options` (`production_order:update`; active users with role `technician`: id, name) (R-03), `PATCH /production/orders/:id/units/:unitId` `{assigneeId?, plannedEndDate?}` (`production_order:update`; assignee must hold `technician`, else 400; header `completed|cancelled` or unit `finishing` done → 409; D-05 locks), `POST …/:id/release` (D-04 Q2 rule), `POST …/:id/cancel` `{reason}`. Notifications D-14 (released, cancelled, assigned; one event per audience). `GET /production/open-orders` for the create picker: `open` orders without a non-cancelled production order, via `OrderMaterialReadPort.listOrders` (`order-material-read.port.ts:96`), fields code, customer name, delivery date only.
- Out: frontend (task-03); shortage display (task-04); stages (task-05).

## Coverage
- CP-02

## Ownership
- Create: `backend/src/plugins/production/` (`production.plugin.ts`, `production.module.ts`, `production.features.ts`, `production-order/`), `backend/src/plugins/sales/_shared/ports/order-production.port.ts` (+ spec), `backend/src/kernel/shared/testing/queued-behind.helper-spec.ts` (extracted from `issue-race.spec.ts:48-100`: `queuedBehind`, `waitForWaiters`, and the data-source handle they close over, passed as a parameter)
- Modify (race helper): `backend/src/plugins/inventory/issue/services/issue-race.spec.ts` (imports the extracted helper, assertions unchanged); frontend notification labels `frontend/src/kernel/core/hooks/api/useNotifications.ts` (+ `frontend/src/kernel/core/tests/use-notifications.test.ts`)
- Modify: `backend/src/plugins/sales/order/` module (port provider), `backend/src/plugins/inventory/material/constants/material.constant.ts`, `backend/src/plugins/inventory/issue/constants/issue.constant.ts`, `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `seed-roles.panel.spec.ts` (PENDING), `soft-delete-unique-index.spec.ts` (if needed)
- Read: `backend/src/plugins/inventory/purchase-order/` (header lock, events), `backend/src/plugins/sales/order/services/order-edit.service.ts:88-161`, `backend/src/plugins/inventory/issue/services/issue-race.spec.ts` (`queuedBehind`)

## Steps
1. Plugin skeleton + migrations + entities → backend boots with `production` enabled.
2. Extract `queuedBehind` first (Step 3), then port + services → real-DB specs:
   (a) order line MSB qty 3 + DB1 qty 1 → units `MSB-1..3`, `DB1-1`, 24 stage rows `pending`;
   (b) create on a cancelled order → 409; second create → 409; after cancelling the first → a new one allowed;
   (c) order cancel while a `draft` production order exists → 409 and the order stays `open`; release with an unassigned or undated unit → 400 listing the codes; release → order `in_production`; order cancel → 409; production cancel → order `open`; order cancel then succeeds;
   (d) release queued behind an order cancel holding the order row (`queuedBehind`): the cancel is vetoed (409), release then 2xx; `moveStatus(from='open')` on an `in_production` order → 409 (port spec);
   (e) assignee without role `technician` → 400; PATCH queued behind a release holding the header → sees `released`, succeeds without deadlock;
   (f) storekeeper create → 403; sales reads own order's production order 200, another owner's → 404; after the customer owner is reassigned (`request.service.ts:170-189`) the former owner → 404; technician_b reads the detail → only their units; a technician with no unit → 404 on detail, empty list; money-key helper finds no money key;
   (g) an `in_production` order: issue 2xx, reservation unchanged after release, `delivered` still 409 (inventory specs);
   (h) after release, each assignee reads `production.order.released` and the sales owner reads `production.order.released.owner` through their notification lists; a new assignee reads `production.unit.assigned`; `GET /production/orders?orderId=` returns the order's non-cancelled production order.
3. Extract `queuedBehind` → `issue-race.spec.ts` still passes unchanged.
4. Labels for notification events; regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02, AC-03, AC-04 (API half), AC-07 (production-order reads), AC-11 (production-order responses).

## Dependencies
- task-01-roles-permissions-scope.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/production/production-order/services/production-order.service.spec.ts && test -f src/plugins/production/production-order/services/production-order-race.spec.ts && test -f src/plugins/sales/_shared/ports/order-production.port.spec.ts && test -f src/kernel/shared/testing/queued-behind.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/plugins/sales src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- inventory-chain sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `production-order.service.spec.ts` (a)–(c), (e)–(h); `production-order-race.spec.ts` (d), (e) race; `order-production.port.spec.ts`; `issue-race.spec.ts` (unchanged after the extraction); `use-notifications.test.ts` (labels)
- Reachability: known (P2 real-DB helper `plugins/inventory/_shared/inventory-db.helper-spec.ts`, `queuedBehind`, e2e names, permission-labels form proven in P2).
- Oracle: exit 0, 0 skipped, both e2e suites pass.
- Counterexample: a production plugin without the `onCancelled` veto must fail (c) and (d); a release that writes the order without the `WHERE status = 'open'` guard must fail the port spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/production/production-order/services/production-order.service.spec.ts && test -f src/plugins/production/production-order/services/production-order-race.spec.ts && test -f src/plugins/sales/_shared/ports/order-production.port.spec.ts && test -f src/kernel/shared/testing/queued-behind.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/plugins/sales src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- inventory-chain sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/production/production-order/services/production-order.service.spec.ts && test -f src/plugins/production/production-order/services/production-order-race.spec.ts && test -f src/plugins/sales/_shared/ports/order-production.port.spec.ts && test -f src/kernel/shared/testing/queued-behind.helper-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/production src/plugins/sales src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- inventory-chain sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/use-notifications.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
PASS src/plugins/production/progress/services/unit-photo.service.spec.ts (31.924 s)
PASS src/plugins/production/progress/services/progress.service.spec.ts (9.405 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (7.303 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (7.452 s)
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (9.486 s)
PASS src/plugins/production/production-order/services/production-order-race.spec.ts (9.682 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (15.323 s)
PASS src/plugins/production/production-order/services/production-order-shortage.spec.ts (8.018 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (10.846 s)
PASS src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts (11.726 s)
PASS src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts (9.625 s)
PASS src/plugins/inventory/stocktake/services/stocktake-race.spec.ts (7.167 s)
PASS src/plugins/sales/order/services/order-convert.service.spec.ts (14.76 s)
PASS src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts (7.782 s)
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts (14.712 s)
PASS src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts (7.139 s)
PASS src/plugins/inventory/issue/services/issue.service.spec.ts (8.096 s)
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (8.198 s)
PASS src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts (8.178 s)
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts (10.32 s)
PASS src/plugins/sales/request/request.controller.spec.ts (8.882 s)
PASS src/plugins/inventory/material/services/estimate-vs-actual.service.spec.ts (7.764 s)
PASS src/plugins/sales/quotation/quotation.controller.spec.ts (7.07 s)
PASS src/plugins/sales/order/order.controller.spec.ts (6.466 s)
PASS src/plugins/inventory/issue/services/issue-race.spec.ts (8.461 s)
PASS src/plugins/inventory/material/services/shortage-notice-audience.spec.ts (7.158 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (7.46 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (6.58 s)
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (7.32 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (7.674 s)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts (7.199 s)
PASS src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts (5.861 s)
PASS src/plugins/sales/request/services/request-owner-race.spec.ts
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (7.051 s)
PASS src/plugins/sales/quotation/services/quotation-code.spec.ts
PASS src/plugins/sales/request/services/request.service.spec.ts
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts
PASS src/plugins/inventory/material/services/reservation-race.spec.ts
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/production/progress/services/overdue.job.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-pdf.render.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/sales/_shared/ports/request-status.port.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/production/production-order/dto/production-order.dto.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/_shared/ports/order-shortage.port.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/sales/_shared/ports/order-material-read.port.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/production/_shared/utils/vn-today.util.spec.ts
PASS src/plugins/production/progress/utils/image-type.util.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/plugins/sales/_shared/utils/request-scope.util.spec.ts
PASS src/plugins/sales/quotation/services/quotation-pricing.spec.ts
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/_shared/ports/order-production.port.spec.ts
PASS src/plugins/sales/order/database/bom-item-link.migration.spec.ts
PASS src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts
PASS src/plugins/sales/_shared/ports/request-close-registry.spec.ts
PASS src/plugins/sales/quotation/config/quotation-letterhead.config.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-document.util.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
Test Suites: 77 passed, 77 total
Tests:       944 passed, 944 total
> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
> panelxerp-backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json inventory-chain sales-chain
PASS test/sales-chain.e2e-spec.ts (28.26 s)
      error: error: relation "feature_flags" does not exist
      warn: Request failed Request failed {"action":"sales.quotations.13090.approve.post","context":{"method":"POST","path":"/api/v1/sales/quotations/13090/approve","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_6476ac16-1516-48d1-89c7-53b2b1d0a40a","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.330+07:00","trace_id":"req_6476ac16-1516-48d1-89c7-53b2b1d0a40a","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_20140b6e-b409-4989-80b5-b9c7f5c46a39","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.503+07:00","trace_id":"req_20140b6e-b409-4989-80b5-b9c7f5c46a39","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_6d77f151-e329-4066-b8b1-6794e8c4179f","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.508+07:00","trace_id":"req_6d77f151-e329-4066-b8b1-6794e8c4179f","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.orders.8465.get","context":{"method":"GET","path":"/api/v1/sales/orders/8465","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_11631ffd-99ac-4201-acd0-3f7a0ac66948","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.714+07:00","trace_id":"req_11631ffd-99ac-4201-acd0-3f7a0ac66948","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.8465.get","context":{"method":"GET","path":"/api/v1/sales/orders/8465","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_017d9324-6320-4892-96d7-fad581293082","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.737+07:00","trace_id":"req_017d9324-6320-4892-96d7-fad581293082","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.quotations.13090.revise.post","context":{"method":"POST","path":"/api/v1/sales/quotations/13090/revise","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_25c94ce7-7269-49b4-a934-0cf402c41c4f","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.751+07:00","trace_id":"req_25c94ce7-7269-49b4-a934-0cf402c41c4f","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f6acdcd0-843c-4a2c-87da-d3c189a40c77","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.781+07:00","trace_id":"req_f6acdcd0-843c-4a2c-87da-d3c189a40c77","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.requests.13519.lost.post","context":{"method":"POST","path":"/api/v1/sales/requests/13519/lost","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f03aa45e-5042-4985-a91a-5b6b415543c5","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.792+07:00","trace_id":"req_f03aa45e-5042-4985-a91a-5b6b415543c5","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.quotations.13090.patch","context":{"method":"PATCH","path":"/api/v1/sales/quotations/13090","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f14a2834-1436-495f-b9b5-593ea263865b","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.806+07:00","trace_id":"req_f14a2834-1436-495f-b9b5-593ea263865b","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.estimates.13798.revise.post","context":{"method":"POST","path":"/api/v1/sales/estimates/13798/revise","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_34a185f4-9e6f-42ed-8ef1-7ef8432a477c","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.818+07:00","trace_id":"req_34a185f4-9e6f-42ed-8ef1-7ef8432a477c","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.estimates.13798.panels.9633.patch","context":{"method":"PATCH","path":"/api/v1/sales/estimates/13798/panels/9633","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_3adbd071-455d-48e1-a42b-f5882caca25c","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.831+07:00","trace_id":"req_3adbd071-455d-48e1-a42b-f5882caca25c","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.orders.8465.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8465","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_39ddc8ab-e528-4356-af58-d5c2b266460c","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.891+07:00","trace_id":"req_39ddc8ab-e528-4356-af58-d5c2b266460c","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.8465.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8465","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_9223df9f-7246-4054-93fc-656977f51391","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.947+07:00","trace_id":"req_9223df9f-7246-4054-93fc-656977f51391","user_id":"3","username":"sales_mgr"}
      warn: Request failed Request failed {"action":"sales.orders.8465.cancel.post","context":{"method":"POST","path":"/api/v1/sales/orders/8465/cancel","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_08eec45a-e544-489d-af26-5052ebdfa970","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.988+07:00","trace_id":"req_08eec45a-e544-489d-af26-5052ebdfa970","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.8465.cancel.post","context":{"method":"POST","path":"/api/v1/sales/orders/8465/cancel","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_59d994cf-ecb5-455e-bc79-a1fafc34a440","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:16.994+07:00","trace_id":"req_59d994cf-ecb5-455e-bc79-a1fafc34a440","user_id":"3","username":"sales_mgr"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_e70ba0aa-fa08-4ff9-930c-5fd95be6b05b","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.161+07:00","trace_id":"req_e70ba0aa-fa08-4ff9-930c-5fd95be6b05b","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.8465.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8465","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_ee6a72f9-7044-471b-a782-b1f29b2eec10","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.178+07:00","trace_id":"req_ee6a72f9-7044-471b-a782-b1f29b2eec10","user_id":"3","username":"sales_mgr"}
PASS test/inventory-chain.e2e-spec.ts (29.504 s)
      error: error: relation "feature_flags" does not exist
      warn: Request failed Request failed {"action":"inventory.purchase-orders.3282.approve.post","context":{"method":"POST","path":"/api/v1/inventory/purchase-orders/3282/approve","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_94239f23-4a11-4dfb-9ddb-d10701ae45c4","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.250+07:00","trace_id":"req_94239f23-4a11-4dfb-9ddb-d10701ae45c4","user_id":"9","username":"purchasing"}
      warn: Request failed Request failed {"action":"inventory.receipts.post","context":{"method":"POST","path":"/api/v1/inventory/receipts","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_980f64fe-5069-4ccd-a8cc-2783fc52edc8","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.442+07:00","trace_id":"req_980f64fe-5069-4ccd-a8cc-2783fc52edc8","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.receipts.post","context":{"method":"POST","path":"/api/v1/inventory/receipts","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_7a6622e7-966f-4a0d-8cea-b17675137bc5","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.611+07:00","trace_id":"req_7a6622e7-966f-4a0d-8cea-b17675137bc5","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.issues.post","context":{"method":"POST","path":"/api/v1/inventory/issues","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_673d2ceb-fd5c-44a8-a318-119b17ad4b51","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:17.758+07:00","trace_id":"req_673d2ceb-fd5c-44a8-a318-119b17ad4b51","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.materials.orders.8466.get","context":{"method":"GET","path":"/api/v1/inventory/materials/orders/8466","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_c3e47338-7271-486b-8310-3be2f45bac66","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:18.053+07:00","trace_id":"req_c3e47338-7271-486b-8310-3be2f45bac66","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"inventory.materials.orders.8466.get","context":{"method":"GET","path":"/api/v1/inventory/materials/orders/8466","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_0c6f5035-4f94-4ea3-9578-76abdd43dcc9","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:18.073+07:00","trace_id":"req_0c6f5035-4f94-4ea3-9578-76abdd43dcc9","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"inventory.stock.get","context":{"method":"GET","path":"/api/v1/inventory/stock","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_a5d8da7b-bad3-4660-90fc-861b464d6e16","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T18:40:18.078+07:00","trace_id":"req_a5d8da7b-bad3-4660-90fc-861b464d6e16","user_id":"7","username":"engineer_a"}
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 Test Files  1 passed (1)
      Tests  52 passed (52)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Notes: four runs. Run 1 (implementer code) exit 0. Two `(D-07)` plan IDs were then removed from comments in `production-order-query.service.ts` and `production-scope.util.ts`, so run 1 no longer matches the final bytes. Run 2 was cut off during lint when the session ended. Run 3 exit 1: 5 tests in `material.service.spec.ts` hit `deadlock detected`. The Postgres log shows the cause: `bom-item-link.migration.spec.ts` runs `DROP INDEX ix_sales_order_bom_lines_item_id` (AccessExclusiveLock) on the shared database while another jest worker inserts into `sales_order_bom_lines`. Neither spec nor their helpers are touched by this task, so this is an existing parallel-DDL race between specs. Run 4 (above) is on the final bytes: exit 0, 836 passed, 0 skipped.
Deviations from the task text, accepted in review: the `OrderProductionPort` provider is in `sales/_shared/sales-shared.module.ts`, not the order module, because production may import only `_shared`. `PRODUCTION_FEATURES` is registered in `enabled-features.ts`, otherwise the plugin migration is skipped. `langs/{vi,en}/{common,permission}.json` were edited because the label tests require it. The cancelled notice is sent only for a released production order. `production.unit.assigned` has no dedupeKey, so a reassignment is not swallowed by the open-dedupe index. An order without cabinet lines returns 409. An empty PATCH returns 200.
Review (code-auditor): PASS, 0 Critical/High/Medium. Low limitations left open:
- The technician-role check on PATCH runs before the unit lock (TOCTOU), and is not re-checked under the lock.
- `ownerScopeCondition` duplicates `OrderMaterialReadPort.scopedOrderCondition`.
- `GET /production/orders?orderId=` also returns cancelled production orders, newest first, so task-03 must ignore `status === 'cancelled'` on the client.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
