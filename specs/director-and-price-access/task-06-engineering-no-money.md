# Task 06 — Engineering receives no money

Status: pending

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
