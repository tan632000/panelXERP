# Task 08 — Estimate: BOM per panel and cost estimate

Status: done

## Outcome
The assigned engineer (or EngineeringLead) builds an estimate for a request — panels with BOM lines and cost lines — and submits it; the request becomes `estimated` atomically and the sales owner is notified.

## Scope
- In: `sales/estimate` feature (D-02). Estimate (code `DT_YYYY_NNNN`, request, revision). Panel (tag e.g. `MSB-01`, quantity, description). BOM line (catalog item, quantity `numeric(18,3)`, unit cost defaulted from item reference price, note). Cost lines per panel by `design|labor|installation|transport|other`. Server-side totals with `decimal.js` (D-06): panel unit cost = Σ(qty × unit cost) + Σ cost lines; estimate total = Σ(panel unit cost × panel qty). Creating the first draft moves request `assigned → estimating`; submit moves `estimating → estimated` in the same transaction via `RequestStatusPort` (D-07); submitted is read-only; revise creates a new draft revision (allowed only while request is `estimated` or `estimating`, never after `quoted`). Permissions `estimate:*`; write/submit only by assigned engineer or EngineeringLead. Register item reference check.
- Out: stock/shortage, purchase request (P2); pricing (task-09); BOM Excel import.

## Decisions (user, 2026-10-25)
- Writing, submitting and revising an estimate is limited to the request's assigned engineer and the EngineeringLead role, exactly as AC-09 reads. Director and Admin read every estimate but cannot write one (404 outside the writer set); the seeded director role holds `estimate:read` instead of `estimate:*`.
- Cost-line amounts are whole VND: the API and the form accept integers only.

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/sales/estimate/`, `frontend/src/plugins/sales/estimate/`, `frontend/src/app/[locale]/sales/estimates/`
- Modify: `backend/src/plugins/sales/sales.module.ts`, shared registration files listed in plan.md
- Read: `backend/src/plugins/catalog/_shared/gateways/`, `backend/src/plugins/sales/request/`

## Steps
1. Entities/migration (unique code); create via `createWithDocumentCode('DT', …)` from task-07 (D-09); add `decimal.js` dependency.
2. Totals service as pure functions + spec.
3. Authorization: actor must be the request's `assignedEngineerId` or hold EngineeringLead scope.
4. Submit/revise in transactions with status port; notification after commit.
5. Frontend editor: panel tabs, BOM grid with item picker, cost lines, totals; submit/revise.
6. Specs: totals fixture (2 panels, qty 2 and 1, decimal quantities); first draft moves request `assigned → estimating`; engineer B edits A's estimate → 404 (outside D-12 scope); actor without `estimate:update` → 403; edit after submit → 409; submit sets request `estimated` and notifies once; revise after `quoted` → 409; deleting an item used in a BOM line → 409 (registered reference check).

## Acceptance
- AC-09.

## Dependencies
- task-07-sales-request.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/estimate && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"`
- Named probe: `src/plugins/sales/estimate/services/estimate-totals.spec.ts`, `src/plugins/sales/estimate/services/estimate.service.spec.ts`
- Reachability: known after task-02.
- Oracle: totals fixture equals the asserted VND value; status/permission assertions as listed.
- Counterexample: computing cost lines without multiplying by panel quantity must fail the totals fixture.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/estimate && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"
Exit: 0
Base: 0b134bd1887a945205432eaaffaba0b08065143c
Head: db61dc73dac544bb01863f9c0736dcf2b6b39abbc418ccf41e591ff1923347c4
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/estimate && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts (6.073 s)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts (7.098 s)
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (12.352 s)
Test Suites: 5 passed, 5 total
Tests:       103 passed, 103 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (23 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/sales/estimate/tests/estimate-totals.test.ts (4 tests)
 ✓ src/plugins/sales/estimate/tests/request-estimate-section.test.tsx (6 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-editor.test.tsx (18 tests)
 Test Files  3 passed (3)
      Tests  28 passed (28)
Exit: 0
```
The real-Postgres race spec (`estimate-race.spec.ts`) executed; nothing was skipped. Extra evidence (same Head, not the canonical command): full backend jest 82 suites / 1061 passed; full frontend 132 files / 1066 passed / 6 skipped; live smoke after seed + `docker compose restart backend` (statuses/amounts only): engineer_a starts the estimate 201 and the request becomes estimating; panel qty 2, BOM 2.5 × item at 100 000, labour cost 500 000 → estimate total 1 500 000 (hand-computed); cost 1000.5 → 400; engineer_b GET 404, director GET 200; director PATCH BOM 403, eng_lead PATCH 200; purchasing deleting the used item 409; submit 200 and the request becomes estimated, sales_a gets exactly 1 `sales.estimate.submitted` notification; edit after submit 409, second submit 409; revise 200, second revise 409. A first smoke run read the wrong response key (`revision` instead of `current`) and is not counted. Cleanup: both runs' estimates/revisions/panels/lines, requests, activities and notifications removed by targeted SQL (no delete endpoints by design); items and customers deleted through the API. Review (code-auditor): round 1 PASS_WITH_WARNINGS (writer set wider than AC-09; fractional cost lines) + user decisions (writers = assigned engineer or engineeringLead, director seeded estimate:read; whole-VND cost lines) → repaired with locked item read in add-line and locked item delete, panel-tag 409, status-gated editor → re-review PASS; controller aligned the request page's start button with the same writer rule (`isEstimateWriter`) and added 2 tests. Known limitations: add-line reads the catalog `items` table by raw SQL instead of through CatalogGateway; reference checks during item delete use a second pool connection; estimate list does not persist column preferences; no browser walkthrough of the UI; no estimate delete endpoint.
