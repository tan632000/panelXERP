# Task 06 — Engineering receives no money

Status: done

## Outcome
An actor without `reference_price:read` gets no money key from any estimate route, and cannot set an item's reference price (D-06).

## Scope
- In:
  - Create `backend/src/plugins/sales/estimate/utils/estimate-price-visibility.util.ts`: `presentRevision(view, actor)`, `presentEstimate(detail, actor)`, `presentEstimatePage(page, actor)`, using `canReadReferencePrice` (`item-price-visibility.util.ts:7-9`; import across plugins only if the lint import rules allow it, else `matchesPermission` with `REFERENCE_PRICE_READ`). Without the scope they drop `total` (estimate, `revisions[]`, `current`), panel `unitCost`/`total`, BOM `unitCost`/`amount`, and `costLines`; key removed, not nulled.
  - Apply at every estimate response: `estimate.service.ts` `findAll` (`:142-159`) and `findOne` (`:161-200`, which `create`, `submit` and `revise` return); every `EstimateEditService` method returns `recalculateRevision(...)` (`estimate-edit.service.ts:242-263`) → present it in `edit`. Prefer one call site in the controller only if every route goes through it; list the routes covered in the Receipt.
  - Item writes: `item.service.ts:117-128` (create) stores `referencePrice: null` and `:172-174` (update) leaves it unchanged when the actor lacks the scope; `item-import.service.ts:119-130,183-184,226` ignores the parsed price for such an actor (no row error).
- Out: draft unit-cost input and pricing routes (task-07); the UI (task-09).

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/sales/estimate/utils/estimate-price-visibility.util.ts`
- Modify: `backend/src/plugins/sales/estimate/services/estimate.service.ts`, `backend/src/plugins/sales/estimate/services/estimate-edit.service.ts`, `backend/src/plugins/catalog/item/services/item.service.ts`, `backend/src/plugins/catalog/item/services/item-import.service.ts`
- Modify (specs): `plugins/sales/estimate/estimate.controller.spec.ts`, `plugins/catalog/item/services/item.service.spec.ts`, `plugins/catalog/item/services/item-import.service.spec.ts`
- Modify (specs, added by the user on 2026-11-05 during execution): `plugins/sales/estimate/services/estimate.service.spec.ts`, `plugins/sales/estimate/services/estimate-race.spec.ts` — only how their actors are built (seeded permissions) or which actor reads the figures; no assertion loosened. They read totals with role-only actors that hold no `reference_price:read`.

## Steps
1. Controller spec. Before any read, the revision gets a BOM line with unit cost > 0 and a cost line with `amount > 0` (through the draft routes, which task-07 later moves). Engineer A and LEAD: list, detail (latest and `?revision=`), create, submit, revise, add/update/delete panel and BOM line → `expectNoMoneyKeys(body)` (`money-keys.helper-spec.ts:6-21`) on every body; and for every panel in those bodies `'costLines' in panel === false` (R-14 a: `costLines` itself is not a money key, `money-keys.helper-spec.ts:6-21`); SALES_A, MANAGER and DIRECTOR on the same detail → `costLines[0].amount > 0`, `bomLines[0].unitCost > 0`, `total > 0`.
2. Item specs: engineeringLead creates with `referencePrice: 450000` → stored null; updates an item priced by purchasing → price unchanged; imports a sheet with an "Đơn giá" column → rows created, prices null; purchasing does the same → prices stored.
3. Implement.

## Acceptance
- AC-08.

## Dependencies
- task-02-director-bell-and-gates.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate src/plugins/catalog/item src/kernel/shared/testing"`
- Named probe: `estimate.controller.spec.ts` (engineer money keys per route), `item.service.spec.ts`, `item-import.service.spec.ts` (price writes by role).
- Reachability: known.
- Oracle: exit 0, 0 skipped; `expectNoMoneyKeys` passes for every engineering body and the sales bodies keep the keys.
- Counterexample: returning an empty or intact `costLines` array to the engineer must fail the `'costLines' in panel` assertion; nulling instead of dropping must fail `expectNoMoneyKeys` (it reports null keys, `money-keys.spec.ts:7-12`); presenting only `findOne` must fail the draft-edit routes; a 403 on a priced import must fail Step 2.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate src/plugins/catalog/item src/kernel/shared/testing"
Exit: 0
Base: a942a6ce71865a539ec305b4b1e28876f376e9b4
Head: cc194a8d3753a3c913c039869ca147c7a545b9c3b3fdb452cfdab1bbcddc6c31
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate src/plugins/catalog/item src/kernel/shared/testing"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales/estimate src/plugins/catalog/item src/kernel/shared/testing
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts (16.323 s)
PASS src/plugins/sales/estimate/services/estimate-race.spec.ts (17.62 s)
PASS src/plugins/catalog/item/services/item.service.spec.ts (6.06 s)
PASS src/plugins/catalog/item/services/item-import.service.spec.ts (22.826 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (27.368 s)
Test Suites: 13 passed, 13 total
Tests:       251 passed, 251 total
VERIFY_EXIT=0
```

This run started after the last edit; 0 skipped; on the host the Command was wrapped in `timeout 1500`. Routes covered (14), all through three service call sites: `GET /` → `findAll` → `presentEstimatePage`; `GET /:id` (latest and `?revision=`), `POST /`, `POST /:id/submit`, `POST /:id/revise` → `findOne` → `presentEstimate`; add/update/delete panel, BOM line and cost line (9 routes) → `EstimateEditService.edit` → `presentRevision`. Named probes: `estimate.controller.spec.ts` (`expectNoMoneyKeys` and no `costLines` key on every body for engineer A and the engineering lead, list body non-empty; sales, sales manager and director keep the figures on latest, `?revision=1` and list; `keeps the figures in the body of a draft edit by the director`), `item.service.spec.ts` (the lead's create stores null, update keeps purchasing's price), `item-import.service.spec.ts` (the lead's import creates rows with null prices, an invalid price cell is ignored without a row error; purchasing's prices stored). The database held its 4 earlier estimates and no new items or requests after the runs.

Pre-change run (specs first): exit 1, 4 failed, the four new cases (engineer and lead bodies still carried `total`; item create stored 450000; import stored 450000 and 320000); the sales/manager/director case passed already as the positive control. Counterexamples (each restored, `cmp` equal): `costLines` kept or emptied, and nulling instead of dropping, fail the engineer/lead case; presenting only `findOne` fails it on the draft-edit routes; an error on a priced import fails the import case. Own mutations, all caught: list unpresented, `?revision=` unpresented, `revisions[].total` kept, the director losing keys, item create/update/import storing the price for every actor; `presentRevision` always dropping keys first survived and is now caught by the director draft-edit case; reporting the price parse error for every actor is caught by the invalid-price case.

Ownership extended by the user during execution to `estimate.service.spec.ts` and `estimate-race.spec.ts`: their actors read money as role-only actors without `reference_price:read`. Changes there: actors built from `seededRolePermissions`; money reads moved to the director or the sales owner; computation cases (`makes the first draft DT_YYYY_0001…`, server totals, reference-price default, recompute, revise copy, whole-VND cost lines) now act as the director, while engineer A still starts every estimate and still submits and revises in the who-may-act cases; the submit case keeps its status assertions on the submit body and reads the same totals through `findOne` as the director; the renamed-item snapshot case gives purchasing its seeded permissions so the price change is not silently ignored. Controller spec: the money assertions after the cost line and the submit now read through `GET /:id` as the sales owner. Review: PASS (code-auditor), who judged every actor switch to be about computation, not about who may act. `findOne` now builds the detail on a copy instead of writing onto the loaded entity. Open Lows: the presented types still declare the dropped keys (a future in-process caller acting as an engineer would read `undefined`); a negative `referencePrice` from the lead is still a 400 while a valid one is ignored; the estimate controller's Swagger text does not mention the dropped keys (controller is outside this task).
