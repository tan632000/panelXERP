# Task 08 — Production chain e2e over HTTP

Status: done

## Outcome
The production chain runs end to end over HTTP on the compose Postgres, as each role.

## Scope
- In: `backend/test/production-chain.e2e-spec.ts` reusing the P2 e2e setup (`backend/test/inventory-chain.e2e-spec.ts`): converted order (MSB qty 2) → productionManager lists open orders and creates the production order → reads technician options, assigns technician_a / technician_b + planned dates → order cancel 409 → release (order `in_production`) → storekeeper issues stock to the order (2xx) → technician_a runs six stages on MSB-1 with a photo and an issue, technician_b on MSB-2 → technician_b reads MSB-1 → 404 and the production order detail shows only MSB-2 → productionManager resolves the issue → production order `completed`, order still `in_production`; notices readable by the intended actor for released, issue opened, completed (role and owner events); overdue `run()` with a past plan date gives productionManager and the assignee one notice each. Money-key helper over every production read. Cleanup removes production rows before P2/P1 cleanup.
- Out: browser walkthrough (done at GATE-DONE per the project habit).

## Coverage
- CP-08

## Ownership
- Create: `backend/test/production-chain.e2e-spec.ts`
- Modify: `backend/test/inventory-chain.e2e-spec.ts`, `backend/test/sales-chain.e2e-spec.ts` (cleanup order only, if production rows block it)

## Steps
1. Write the e2e; run all three e2e suites.

## Acceptance
- AC-11, AC-12.

## Dependencies
- task-07-overdue-alert.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f test/production-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- production-chain inventory-chain sales-chain"`
- Named probe: `production-chain.e2e-spec.ts`
- Reachability: known (P2 task-17; `test:e2e` takes positional patterns).
- Oracle: exit 0, three suites passed, 0 skipped.
- Counterexample: a technician scope that leaks MSB-1 to technician_b, in the unit read or the production order detail, must fail.
- Artifacts: ephemeral (rows cleaned by the spec).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f test/production-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- production-chain inventory-chain sales-chain"
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T backend sh -c "test -f test/production-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- production-chain inventory-chain sales-chain"
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
No migrations are pending
> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts
> panelxerp-backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json production-chain inventory-chain sales-chain
PASS test/inventory-chain.e2e-spec.ts (29.803 s)
      error: error: relation "feature_flags" does not exist
      error: error: duplicate key value violates unique constraint "uq_purchase_orders_code"
      warn: Request failed Request failed {"action":"inventory.purchase-orders.3359.approve.post","context":{"method":"POST","path":"/api/v1/inventory/purchase-orders/3359/approve","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_2d20b96a-9b4e-4158-b254-88ada641fff0","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.634+07:00","trace_id":"req_2d20b96a-9b4e-4158-b254-88ada641fff0","user_id":"9","username":"purchasing"}
      warn: Request failed Request failed {"action":"inventory.receipts.post","context":{"method":"POST","path":"/api/v1/inventory/receipts","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_ead29487-536c-48c0-a615-435022d89167","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.818+07:00","trace_id":"req_ead29487-536c-48c0-a615-435022d89167","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.receipts.post","context":{"method":"POST","path":"/api/v1/inventory/receipts","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_bca2ddf4-ada6-4adf-af7d-b1b382936f53","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.986+07:00","trace_id":"req_bca2ddf4-ada6-4adf-af7d-b1b382936f53","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.issues.post","context":{"method":"POST","path":"/api/v1/inventory/issues","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_845f5826-609f-4c23-bb29-28f05462c8b3","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.103+07:00","trace_id":"req_845f5826-609f-4c23-bb29-28f05462c8b3","user_id":"10","username":"storekeeper"}
      warn: Request failed Request failed {"action":"inventory.materials.orders.8921.get","context":{"method":"GET","path":"/api/v1/inventory/materials/orders/8921","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_d29ca53b-70d2-4b3b-a746-a63d9cd4ef45","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.320+07:00","trace_id":"req_d29ca53b-70d2-4b3b-a746-a63d9cd4ef45","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"inventory.materials.orders.8921.get","context":{"method":"GET","path":"/api/v1/inventory/materials/orders/8921","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_48de9621-29aa-4668-b6ba-386423d24f14","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.336+07:00","trace_id":"req_48de9621-29aa-4668-b6ba-386423d24f14","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"inventory.stock.get","context":{"method":"GET","path":"/api/v1/inventory/stock","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"inventory","request_id":"req_ed75bef2-2ada-4a32-88f5-286b0a3001d0","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.340+07:00","trace_id":"req_ed75bef2-2ada-4a32-88f5-286b0a3001d0","user_id":"7","username":"engineer_a"}
PASS test/production-chain.e2e-spec.ts (30.739 s)
      error: error: relation "feature_flags" does not exist
      error: error: duplicate key value violates unique constraint "uq_sales_quotations_code"
      error: error: duplicate key value violates unique constraint "uq_sales_orders_code"
      warn: Request failed Request failed {"action":"production.orders.post","context":{"method":"POST","path":"/api/v1/production/orders","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_a44368eb-5d11-4edc-8605-b1db1d9599fb","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.800+07:00","trace_id":"req_a44368eb-5d11-4edc-8605-b1db1d9599fb","user_id":"11","username":"production_manager"}
      warn: Request failed Request failed {"action":"production.orders.4027.release.post","context":{"method":"POST","path":"/api/v1/production/orders/4027/release","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_3cf6dc05-3b0d-4b72-ae33-275ce423a3a9","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.830+07:00","trace_id":"req_3cf6dc05-3b0d-4b72-ae33-275ce423a3a9","user_id":"11","username":"production_manager"}
      warn: Request failed Request failed {"action":"sales.orders.8923.cancel.post","context":{"method":"POST","path":"/api/v1/sales/orders/8923/cancel","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f16ed2b0-aecc-4b14-bf20-6b831adb1232","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:47.980+07:00","trace_id":"req_f16ed2b0-aecc-4b14-bf20-6b831adb1232","user_id":"3","username":"sales_mgr"}
      warn: Request failed Request failed {"action":"production.units.4692.stages.enclosure.start.post","context":{"method":"POST","path":"/api/v1/production/units/4692/stages/enclosure/start","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_858e98b4-5a3d-4f18-a050-45d8a2a62dc1","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.335+07:00","trace_id":"req_858e98b4-5a3d-4f18-a050-45d8a2a62dc1","user_id":"12","username":"technician_a"}
      warn: Request failed Request failed {"action":"production.units.4692.photos.post","context":{"method":"POST","path":"/api/v1/production/units/4692/photos","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_5b594619-4c4a-4dc9-a121-9bad99960ffd","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.615+07:00","trace_id":"req_5b594619-4c4a-4dc9-a121-9bad99960ffd","user_id":"12","username":"technician_a"}
      warn: Request failed Request failed {"action":"production.units.4692.stages.material_prep.start.post","context":{"method":"POST","path":"/api/v1/production/units/4692/stages/material_prep/start","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_8eb3cede-7578-4248-b625-9e4efbe784b7","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.855+07:00","trace_id":"req_8eb3cede-7578-4248-b625-9e4efbe784b7","user_id":"13","username":"technician_b"}
      warn: Request failed Request failed {"action":"production.units.4692.get","context":{"method":"GET","path":"/api/v1/production/units/4692","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_5e749cdc-7adc-4486-9039-d4f1e7c8b4fd","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.888+07:00","trace_id":"req_5e749cdc-7adc-4486-9039-d4f1e7c8b4fd","user_id":"13","username":"technician_b"}
      warn: Request failed Request failed {"action":"production.units.4692.photos.get","context":{"method":"GET","path":"/api/v1/production/units/4692/photos","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_54120318-1d25-4205-a359-399728392dd2","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.897+07:00","trace_id":"req_54120318-1d25-4205-a359-399728392dd2","user_id":"13","username":"technician_b"}
      warn: Request failed Request failed {"action":"production.photos.4167.content.get","context":{"method":"GET","path":"/api/v1/production/photos/4167/content","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_18b99050-02a6-4e18-9e3d-a36a1c8f7716","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.906+07:00","trace_id":"req_18b99050-02a6-4e18-9e3d-a36a1c8f7716","user_id":"13","username":"technician_b"}
      warn: Request failed Request failed {"action":"production.units.4692.issues.post","context":{"method":"POST","path":"/api/v1/production/units/4692/issues","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_49f32afd-b45a-479c-8a07-4fc9ec167703","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.920+07:00","trace_id":"req_49f32afd-b45a-479c-8a07-4fc9ec167703","user_id":"13","username":"technician_b"}
      warn: Request failed Request failed {"action":"production.orders.4027.get","context":{"method":"GET","path":"/api/v1/production/orders/4027","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_d07d9773-e310-48fd-a64c-2a296c2e62d6","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.972+07:00","trace_id":"req_d07d9773-e310-48fd-a64c-2a296c2e62d6","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"production.units.4692.get","context":{"method":"GET","path":"/api/v1/production/units/4692","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_fa6f11f8-d12f-4942-8da9-39efa0b1d73b","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:48.978+07:00","trace_id":"req_fa6f11f8-d12f-4942-8da9-39efa0b1d73b","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"production.issues.624.resolve.post","context":{"method":"POST","path":"/api/v1/production/issues/624/resolve","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_a8af2940-f2cb-4b81-9b7d-088dee95a4e4","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:49.208+07:00","trace_id":"req_a8af2940-f2cb-4b81-9b7d-088dee95a4e4","user_id":"12","username":"technician_a"}
      warn: Request failed Request failed {"action":"production.units.4693.stages.finishing.undo.post","context":{"method":"POST","path":"/api/v1/production/units/4693/stages/finishing/undo","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"production","request_id":"req_6240ce06-b7ae-483f-b2ea-476151258c53","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:50:49.378+07:00","trace_id":"req_6240ce06-b7ae-483f-b2ea-476151258c53","user_id":"11","username":"production_manager"}
PASS test/sales-chain.e2e-spec.ts (47.535 s)
      error: error: relation "feature_flags" does not exist
      warn: Request failed Request failed {"action":"sales.quotations.13549.approve.post","context":{"method":"POST","path":"/api/v1/sales/quotations/13549/approve","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_6a2915d7-11b0-4dba-b9fd-f5ea9ec07e0e","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:05.909+07:00","trace_id":"req_6a2915d7-11b0-4dba-b9fd-f5ea9ec07e0e","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_7c289e98-a10b-407c-9d69-3db69f1b958b","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.096+07:00","trace_id":"req_7c289e98-a10b-407c-9d69-3db69f1b958b","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_d002139d-ce22-4103-8ef8-eded4f95fcdb","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.099+07:00","trace_id":"req_d002139d-ce22-4103-8ef8-eded4f95fcdb","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.orders.8924.get","context":{"method":"GET","path":"/api/v1/sales/orders/8924","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_adec80fd-7d2d-4df5-a9e7-73358ef525a5","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.208+07:00","trace_id":"req_adec80fd-7d2d-4df5-a9e7-73358ef525a5","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.8924.get","context":{"method":"GET","path":"/api/v1/sales/orders/8924","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_68718558-d935-4512-9d6d-6e7210c4dd07","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.221+07:00","trace_id":"req_68718558-d935-4512-9d6d-6e7210c4dd07","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.quotations.13549.revise.post","context":{"method":"POST","path":"/api/v1/sales/quotations/13549/revise","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_9c7efebe-33d1-46e1-bdd2-4a924c96cb39","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.230+07:00","trace_id":"req_9c7efebe-33d1-46e1-bdd2-4a924c96cb39","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f0b9f882-6fed-453f-9512-b0f6bf1af409","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.251+07:00","trace_id":"req_f0b9f882-6fed-453f-9512-b0f6bf1af409","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.requests.13977.lost.post","context":{"method":"POST","path":"/api/v1/sales/requests/13977/lost","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_f4eed829-8048-40f2-a1ca-411479d1ca4c","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.259+07:00","trace_id":"req_f4eed829-8048-40f2-a1ca-411479d1ca4c","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.quotations.13549.patch","context":{"method":"PATCH","path":"/api/v1/sales/quotations/13549","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_97083c34-efaf-4436-be09-0aca5599d412","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.269+07:00","trace_id":"req_97083c34-efaf-4436-be09-0aca5599d412","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.estimates.14256.revise.post","context":{"method":"POST","path":"/api/v1/sales/estimates/14256/revise","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_af3cb0c1-5bfb-4582-8f7a-796faa326b7f","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.276+07:00","trace_id":"req_af3cb0c1-5bfb-4582-8f7a-796faa326b7f","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.estimates.14256.panels.9640.patch","context":{"method":"PATCH","path":"/api/v1/sales/estimates/14256/panels/9640","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_96c9cd80-1948-45c1-9bdf-d643c1bd9bb2","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.284+07:00","trace_id":"req_96c9cd80-1948-45c1-9bdf-d643c1bd9bb2","user_id":"7","username":"engineer_a"}
      warn: Request failed Request failed {"action":"sales.orders.8924.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8924","status_code":404},"environment":"development","error_code":"HTTP_404","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_bf02da50-ec90-4645-bc40-adbdea4ac53f","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.314+07:00","trace_id":"req_bf02da50-ec90-4645-bc40-adbdea4ac53f","user_id":"5","username":"sales_b"}
      warn: Request failed Request failed {"action":"sales.orders.8924.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8924","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_a1f20567-81ea-4e4b-a971-a8a936aa257f","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.343+07:00","trace_id":"req_a1f20567-81ea-4e4b-a971-a8a936aa257f","user_id":"3","username":"sales_mgr"}
      warn: Request failed Request failed {"action":"sales.orders.8924.cancel.post","context":{"method":"POST","path":"/api/v1/sales/orders/8924/cancel","status_code":403},"environment":"development","error_code":"HTTP_403","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_6a2fdc4d-34d3-4e27-9b17-9d0c66854cdf","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.373+07:00","trace_id":"req_6a2fdc4d-34d3-4e27-9b17-9d0c66854cdf","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.8924.cancel.post","context":{"method":"POST","path":"/api/v1/sales/orders/8924/cancel","status_code":400},"environment":"development","error_code":"HTTP_400","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_a18f4271-7e85-4391-9b22-2c53cef8aece","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.376+07:00","trace_id":"req_a18f4271-7e85-4391-9b22-2c53cef8aece","user_id":"3","username":"sales_mgr"}
      warn: Request failed Request failed {"action":"sales.orders.post","context":{"method":"POST","path":"/api/v1/sales/orders","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_bb301ea2-d5e7-4883-a0fe-96cacb95064a","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.459+07:00","trace_id":"req_bb301ea2-d5e7-4883-a0fe-96cacb95064a","user_id":"4","username":"sales_a"}
      warn: Request failed Request failed {"action":"sales.orders.8924.patch","context":{"method":"PATCH","path":"/api/v1/sales/orders/8924","status_code":409},"environment":"development","error_code":"HTTP_409","ip":"::ffff:127.0.0.1","module":"sales","request_id":"req_7771fa56-be57-4862-b6d3-045c848c1605","service":"erp-backend","status":"failed","tenant_id":"panelxerp","timestamp":"2026-11-03T19:51:06.471+07:00","trace_id":"req_7771fa56-be57-4862-b6d3-045c848c1605","user_id":"3","username":"sales_mgr"}
Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
```

Notes:

Runs:
- Run 1 ran on the implementer's bytes and exited 0 (3 suites passed, backend lint clean).
- Review then returned PASS_WITH_WARNINGS with one Medium: MSB-2 was planned on the fixed date 2027-02-01, so the "no overdue notice for MSB-2" assertion would fail from 2027-02-02. The controller fixed it:
  - `daysFromToday(days)` is built on `vnToday()`.
  - Delivery is +120 days, MSB-1 is planned −30 days (late), MSB-2 is planned +90 days.
  - No fixed calendar date remains.
- The controller also fixed two Lows:
  - Storage objects are deleted in `finally`, from keys read before any row is deleted.
  - technician_b's unit list is filtered by the production order and asserted with `toEqual([msb2.id])`.
- Run 2, above, is on the final bytes: exit 0, 3 suites passed, 0 skipped. A separate `npm run lint` on the backend exited 0.
- Re-review: PASS.

Counterexample: a technician_b scope leak of MSB-1 fails exact assertions:
- the unit read, its photos, the photo content and an issue on MSB-1 → 404;
- the production order detail units are `toEqual(['MSB-2'])` with `unitCount` 1;
- the unit list is `toEqual([msb2.id])`.

Deviations:
- Stock for the order comes from a purchase-order receipt, not a stocktake. `inventory-chain` asserts a single open stocktake and runs in parallel.
- The order is cancelled by `sales_mgr`, because `sales` holds no `order:cancel`.

Photo storage: photos go to the compose object storage, not a mock, and are deleted in cleanup.

Open limitations (Low):
- The order-cancel 409 is asserted by status only, not by the production hook's message.
- The cleanup notice query keeps a `payload unitId` branch that relies on parameter order.
- technician_b's issue list is read twice.
- Write responses (release, PATCH, resolve) are not run through the money-key helper; only reads are, as Scope requires.
- `OverdueService.run(vnToday())` scans every released unit in the shared database, as the bootstrap pass already does. It may notify late demo units, and cleanup removes only this spec's notices.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
