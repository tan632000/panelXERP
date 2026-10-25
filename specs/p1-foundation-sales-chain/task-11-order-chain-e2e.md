# Task 11 — Sales order from confirmed quotation, chain proven end-to-end

Status: done

## Outcome
A customer-confirmed quotation version becomes exactly one sales order that snapshots all data, and the full request → estimate → quotation → order chain is proven over HTTP against a real database.

## Scope
- In: `sales/order` feature. Order (code `DH_YYYY_NNNN`, customer snapshot name/tax code/address, project, contract no./date, delivery date, links to request, estimate revision, quotation version; snapshot lines with price/VAT/total; payment terms text). Unique `quotation_id` without soft-delete filter; no delete endpoint, only `cancel` with reason (D-04). Status `open → in_production → delivered → completed | cancelled` (P1 exposes `open`, `cancelled`). Convert locks the quotation header (D-08); request → `won` synchronously. Event `sales.order.created` after commit (consumed in P2/P3). Scope D-12; permissions `order:*`.
- Out: production order, payment schedule (P3, P5).

## Decisions (user, 2026-10-25)
- Cancelling an order (reason required; `order:cancel`, held by salesManager, director, admin — sales holds `order:read|create|update`, never `order:cancel`) moves its request `won → lost` in the same transaction; this is the only path into `lost` from `won`. The quotation stays `customer_confirmed` and is never converted again (unique `quotation_id` counts cancelled orders); a returning customer gets a new request.
- Contract number, contract date and delivery date are optional at conversion and editable while the order is `open`; lines, prices, totals and snapshots are never editable.
- The order's sales owner may edit those three fields too: the sales role is granted `order:update` (D-12 scope still limits it to its own orders); cancelling stays with salesManager, director, admin.
- Payment terms: the order snapshots the full terms list of the confirmed quotation version, read-only.

## Coverage
- CP-11

## Ownership
- Create: `backend/src/plugins/sales/order/`, `frontend/src/plugins/sales/order/`, `frontend/src/app/[locale]/sales/orders/`, `backend/test/sales-chain.e2e-spec.ts`
- Modify: `backend/src/plugins/sales/sales.features.ts` (feature registration), shared registration files listed in plan.md; `backend/src/plugins/sales/request/constants/request-status-transitions.constant.ts` (`won → lost` for order cancel); `backend/src/kernel/core/database/seeds/seed-roles.panel.spec.ts` (drop the pending `order` module), `backend/src/kernel/core/database/seeds/seed-roles.ts` (sales `order:update`); `backend/src/kernel/core/database/soft-delete-unique-index.spec.ts` (order document-number indexes); for the won-request guards `backend/src/plugins/sales/request/services/request.service.ts` (+ `request.service.spec.ts`) and `backend/src/plugins/sales/quotation/services/quotation-approval.service.ts`; `backend/src/plugins/sales/quotation/quotation-db.helper-spec.ts` (cleanup of orders); `frontend/src/kernel/core/hooks/api/useNotifications.ts` (order event); `frontend/src/plugins/sales/quotation/components/QuotationDetailPage.tsx` (convert-to-order section)
- Read: `REF/backend/src/plugins/sales/order/`

## Steps
1. Entities/migration (unique code).
2. Convert service with guards and snapshot; code via `createWithDocumentCode('DH', …)` (D-09).
3. Frontend list + detail with chain breadcrumb.
4. Unit specs: second conversion → 409; convert `approved` (not confirmed) → 409; concurrent conversions → one order; Sales B reads Sales A's order → 404.
5. E2E: log in as demo users per role → customer, project, item → request → assign → estimate → submit → quotation → approve (by another user) → confirm → order; then revise quotation is refused and order lines still equal the confirmed version; request `won`.

## Acceptance
- AC-13.

## Dependencies
- task-10-quotation-approval-feedback.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/order && npm run validate:migrations && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/order"`
- Named probe: `src/plugins/sales/order/services/order-convert.service.spec.ts`, `test/sales-chain.e2e-spec.ts`
- Reachability: `test:e2e` mapper fixed and proven in task-01; e2e DB = compose Postgres.
- Oracle: e2e passes with request `won` and line totals equal to the confirmed version; unit 409 cases pass.
- Counterexample: order lines referencing live quotation lines must fail the post-order equality check.
- Artifacts: e2e data uses a unique customer code prefix and is cleaned up.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/order && npm run validate:migrations && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/order"
Exit: 0
Base: e545971307bc27a5682a85c44c7902eab2e09e36
Head: 9c16236285fa51336498e25d2d89cf8df6b7a88a4c8f818491c817ab3731b127
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/order && npm run validate:migrations && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/order"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/sales/order/services/order-convert.service.spec.ts (18.807 s)
PASS src/plugins/sales/order/order.controller.spec.ts (21.736 s)
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (27 files).
> panelxerp-backend@0.0.1 test:e2e
PASS test/sales-chain.e2e-spec.ts (20.001 s)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/sales/order/tests/order-notification.test.ts (3 tests) 38ms
 ✓ src/plugins/sales/order/tests/quotation-order-section.test.tsx (7 tests) 426ms
 ✓ src/plugins/sales/order/tests/order-detail.test.tsx (8 tests) 935ms
 Test Files  3 passed (3)
      Tests  18 passed (18)
Exit: 0
```
No test in the run above was skipped: the real-Postgres convert/race/guard specs and the HTTP e2e (AppModule against the compose Postgres) executed. Pre-change run: the Command exited 1 ("No tests found" for `src/plugins/sales/order`). Extra evidence (same Head, not the canonical command): full backend jest 95 suites / 1267 passed; full frontend 142 files passed, 1 skipped / 1178 passed, 6 skipped (permission-labels needs `../backend`); negative control by the implementer in untracked throwaway copies (service without the estimate lock): the deterministic lock-order spec failed with "deadlock detected", copies deleted (controller checked no leftovers). Live smoke after migrate + seed + `docker compose restart backend`, 40 checks all PASS (statuses/amounts only): convert before approval 409, convert an approved but unconfirmed version 409; after confirm sales_b convert 404, engineer 403; convert 201 with code `DH_YYYY_NNNN`, status open, total 745 200 and line price 345 000 equal to the confirmed version, BOM snapshot present, terms equal to the version's 5 terms, chain links the quotation; request `won`; second convert 409, revise the confirmed quotation 409, closing the won request from the request page 409; sales_b read 404 and list by quotation 0 rows; sales owner edits contract no./date 200, sales_b 404, sales cancel 403, cancel without reason 400; director cancels 200 → order cancelled and request `lost`; edit after cancel 409; convert after cancel 409; manager gets exactly 1 `sales.order.created` notification. Cleanup: smoke order, quotation, estimate, request (children by cascade) and 5 notifications removed by targeted SQL; item and customer deleted through the API; sales and order tables verified 0. Review (code-auditor): round 1 FAIL (Critical: cancel/PATCH wrote with save() instead of the D-08 `WHERE status = :expected` update; Medium: convert locked the request before the estimate it references — deadlock with estimate writes; Medium: Ownership incomplete) + user decision (the sales owner may edit contract fields: sales gets `order:update`) → conditional `moveOpenOrder` with a bypass-the-lock spec, estimate `FOR SHARE` before the request, Ownership listed by the controller, BOM counterexample, production exception filter in the e2e, session cleanup by own ids → round 2 PASS_WITH_WARNINGS (deadlock spec not deterministic) → deterministic interleaving spec with negative control → round 3 PASS; controller narrowed the spec's poll to `pg_blocking_pids` of the writer and awaited the convert in `finally`. Known limitations: the controller's narrowed poll was not re-run against the old lock order (the earlier negative control used the broader poll); the 4-round convert-vs-revise race remains timing-dependent (kept alongside the deterministic spec); the first won-request guard in quotation cancel is defensive and mostly unreachable; an order keeps a null project when the project was deleted before conversion; seeding grants `order:update` to sales only while the sales role was never edited by an admin; no browser walkthrough of the UI.
