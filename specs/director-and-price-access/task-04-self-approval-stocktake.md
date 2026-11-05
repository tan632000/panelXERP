# Task 04 — Director self-approval: stocktake

Status: done

## Outcome
A stocktake submitted by the director is approved and posted in the same transaction; every approved stocktake notifies storekeeper and purchasing; the director is never refused by four-eyes, and admin still is.

## Scope
- In:
  - `stocktake-approval.service.ts`:
    - `submit` (`:62-80`): for `actor.role === 'director'`, after the `counting → submitted` move, set `held.status = SUBMITTED` (`moveStocktake` guards on the status held at lock time and never refreshes it, `stocktake-lock.util.ts:67-69`; GATE-REVIEW R-02), then run the approve body of `:120-137` in the same transaction (`postDifferences`, `submitted → approved` with `approved_by`), then `shortageAlerts.afterCommit` as `approve` does (`:135`).
    - `assertUninvolved` (`:273-…`) returns early for the director.
    - After commit of any approval (normal or self): emit `inventory.stocktake.approved` (new constant in `stocktake.constant.ts`) to roles `storekeeper`,`purchasing`, `requiredScope: 'stocktake:read'`, `excludeUserIds: [actor]`, link `/inventory/stocktakes/:id`, payload `{ stocktakeId, code }`. A failed notice is logged, never raised (pattern of `purchase-order-approval.service.ts:295-300`).
  - `stocktake-db.helper-spec.ts:119-132` lists its providers by hand without `NotificationService`, so every stocktake spec fails DI at `compile()` (R-05): provide a real `NotificationService` on the harness data source (pattern of `production-db.helper-spec.ts:196-200`) and delete `inventory.stocktake.%` notices whose `payload.stocktakeId` is one of the harness's counts in its cleanup. `test/inventory-chain.e2e-spec.ts:245-251` cleans notices by order, request, quotation, estimate and purchase order ids only: add `OR (payload->>'stocktakeId')::int = ANY(...)` for the stocktakes it creates (`:412`).
  - `stocktake.module.ts`: import `AuditModule` (the service has no `NotificationService` today, `stocktake-approval.service.ts:53-60`; `AuditModule` exports it, `audit.module.ts:23`).
  - Existing spec that encodes the old behavior: `stocktake-approval.service.spec.ts:131-172` uses `h.as(<user>, 'director')` as the involved counter/submitter refused with 403 → rewrite those refusals with `admin`-role actors; add the director cases below.
- Out: a stocktake submitted notice (none exists today; not requested).

## Coverage
- CP-03

## Ownership
- Modify: `backend/src/plugins/inventory/stocktake/services/stocktake-approval.service.ts`, `backend/src/plugins/inventory/stocktake/stocktake.module.ts`, `backend/src/plugins/inventory/stocktake/constants/stocktake.constant.ts`
- Modify (spec/helpers): `plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts`, `plugins/inventory/stocktake/stocktake-db.helper-spec.ts`, `backend/test/inventory-chain.e2e-spec.ts` (cleanup only)

## Steps
1. Spec (mandatory, R-02): the director opens, counts and submits → HTTP 200, a count with one shortfall and one gain → status `approved`, one `COUNT_ADJUSTMENT` movement per changed line (no duplicates), `approved_by` = director, one `inventory.stocktake.approved` row for storekeeper and purchasing excluding the director.
2. Spec: a count whose result would go below zero, submitted by the director → 409, the count stays `counting`, no movement, no notice.
2b. Spec (R-14 c): the notice is sent only after commit — spy on `dataSource.transaction` and on `NotificationService.emit` and assert `emit` is first called after the transaction promise resolved; and a director submit whose `moveStocktake` conflicts (status changed by a concurrent cancel committed first) answers 409 with 0 `inventory.stocktake.approved` rows.
3. Spec: storekeeper submits, an admin who counted is refused 403; the director who counted approves → 200 and the notice row exists.
4. Implement.

## Acceptance
- AC-05 (stocktake), AC-06.

## Dependencies
- task-03-self-approval-quotation-po.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/inventory/stocktake && npm run test:e2e -- --ci"`
- Named probe: `stocktake-approval.service.spec.ts` (director self-approval 200, negative-stock refusal, after-commit emit, admin four-eyes); `inventory-chain.e2e-spec.ts` (cleanup leaves no stocktake notice).
- Reachability: known.
- Oracle: exit 0, 0 skipped; movement count equals changed lines; the refused submit leaves status `counting`.
- Counterexample: a second `moveStocktake` on the stale `held` must fail Step 1 with 409; posting in a second transaction must fail Step 2 (a `submitted` count remains); emitting inside the transaction must fail Step 2b (emit before the transaction resolves, or a row after the conflicting submit).
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/inventory/stocktake && npm run test:e2e -- --ci"
Exit: 0
Base: a942a6ce71865a539ec305b4b1e28876f376e9b4
Head: ec178092f36a81d0386f0c2862323015184574c81dc110b8975a264a17961fdd
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/inventory/stocktake && npm run test:e2e -- --ci"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/inventory/stocktake
PASS src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts (14.876 s)
PASS src/plugins/inventory/stocktake/services/stocktake-race.spec.ts (15.191 s)
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
> panelxerp-backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json --ci
PASS test/app.e2e-spec.ts (25.591 s)
PASS test/sales-chain.e2e-spec.ts (28.473 s)
PASS test/inventory-chain.e2e-spec.ts (31.038 s)
PASS test/production-chain.e2e-spec.ts (31.578 s)
Test Suites: 4 passed, 4 total
Tests:       4 passed, 4 total
VERIFY_EXIT=0
```

This run started after the last edit, on an idle container; 0 skipped. On the host the Command was wrapped in `timeout 1500` so a hung jest could not block forever; the command run in the container is the one above. Named probes: `stocktake-approval.service.spec.ts` (director opens, counts and submits → 200 `approved`, one count-adjustment movement per changed line, `approved_by` = director, one `inventory.stocktake.approved` row for storekeeper and purchasing excluding the director; a below-zero count submitted by the director → 409, still `counting`, no movement, no notice; the notice is emitted only after the transaction resolved; a cancel committed first → 409 and no notice; admin who counted refused 403, the director who counted approves; `tells the stores when someone other than the director approves`; `keeps the approval when the notice cannot be sent`), `inventory-chain.e2e-spec.ts` (cleanup now also removes stocktake notices).

Pre-change run (specs and harness first): exit 1, 7 failed: the director self-approval case (`approved` expected, `submitted` received) plus six cascades, because that count stayed `submitted` and every later `open` answered 409. The harness already provided `NotificationService`, so no DI failure appeared; e2e did not run (the unit step failed first). An earlier attempt stopped at lint on the new spec's formatting and was not counted as the pre-run. Counterexamples (each restored, `cmp` equal): no `held.status` update before the second move fails the self-approval case with 409; posting in a second transaction fails the below-zero case (count left `submitted`); emitting inside the transaction fails the after-commit case. Own mutations: admin exempt in `assertUninvolved` fails three four-eyes cases; no `excludeUserIds` fails two cases; no try/catch around the emit fails the notice-failure case; `purchasing` dropped from the roles fails the self-approval case; a notice sent only on self-approval first survived, then the case `tells the stores when someone other than the director approves` was added and catches it.

Assertions changed outside the listed ones: the four-eyes cases now use admin-role actors, and the `directorWhoCounts` setup that added `stocktake:update` by hand was removed (the director now holds it). Review: PASS (code-auditor). Open Lows: the cancel-first case gets its 409 from the status assert under the row lock, not from the guarded move (the guarded move is proven by the self-approval case); the notice-failure case covers `approve`, not the self-approval path that shares `afterApproval`. Flaky, outside this task: `test/app.e2e-spec.ts` boots `AppModule` inside a `beforeEach` with jest's default 5 s hook timeout; under load (dev server reload, other runs) it timed out in the implementer's run and once hung without exiting, while on an idle container it passed in 25-43 s total. The Command and the timeout were not changed.
