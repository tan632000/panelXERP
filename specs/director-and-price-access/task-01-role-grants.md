# Task 01 — Role grants

Status: pending

## Outcome
The seeded roles carry the new policy: director `*:*`, engineering without any price scope, sales and salesManager able to price estimates, engineeringLead not.

## Scope
- In:
  - `seed-roles.ts`: director's permissions become `['*:*']` (`:101-107`; `DIRECTOR_GRANTS` `:72-91` and its comment go); its description says full access. Remove `reference_price:read` from engineeringLead (`:155`) and engineer (`:171`). engineeringLead `estimate:*` (`:154`) → `...ESTIMATE_WRITE` (`:31-36`). Add `estimate:price` to salesManager (after `:116`) and sales (after `:134`). Purchasing keeps `:182-183`.
  - `estimate.permissions.ts:1-11`: declare `ESTIMATE_PRICE = 'estimate:price'` in `estimatePermissions` (the seed drops undeclared scopes, `seed-roles.ts:336-341`).
  - Frontend labels and key for the new action: `frontend/src/kernel/langs/{vi,en}/permission.json` `actions.price` (`:175` block; the label test is `kernel/langs/tests/permission-labels.test.ts:77`), `frontend/src/plugins/sales/estimate/permissions/estimate-permission.keys.ts` `price: "estimate:price"`.
  - Existing specs that encode the old grants, changed to the new ones (each listed with its old assertion):
    - `seed-roles.panel.spec.ts:122-135` (director cannot write estimates) → director holds every estimate action; engineeringLead holds read/create/update/submit and not `estimate:price`.
    - `seed-roles.panel.spec.ts:137-145` (file routes admin alone) → `['admin', 'director']`.
    - `seed-roles.inventory.spec.ts:106-136` (director entry) → director holds every scope listed there; `:170-200` engineeringLead/engineer `granted` drop `reference_price:read` and their `refused` add it plus `estimate:price`; `:245-249` purchase-price holders stay `['admin','purchasing','director','salesManager']`.
    - `item.controller.spec.ts:433-447` ("still shows the reference price to sales, engineers and purchasing") → sales and purchasing still see it; the engineer gets no `referencePrice` key.
    - `stocktake-approval.service.spec.ts:133-134` (a director cannot count, 403) → 200; the four-eyes lines `:148-172` stay for task-04.
    - `production-issue.service.spec.ts:152` (director 403 opening an issue) → whatever the service now answers for a director with `*:*`, asserted exactly; record it.
    - `estimate.controller.spec.ts:181-200` (director 403 on a BOM line edit) → 404 until task-02 makes the director a writer.
  - Accepted consequences of `*:*` (D-02, GATE-REVIEW R-12), each pinned by a spec: the roles screen refuses to narrow the director role — `roles.service.spec.ts:177-186` already asserts it for a `director` role holding `*:*`; keep it and name it in the Receipt. The director's signature upload is stored directly without review — add a case beside `auth.service.spec.ts:758-770` with `buildService('director', ['*:*'])` asserting the stored `signatureUrl` and no review request (`auth.service.ts:311-322`).
- Out: notification, approval and estimate service behavior (tasks 02-07); the live DB re-seed (task-07).

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `backend/src/plugins/sales/estimate/permissions/estimate.permissions.ts`
- Modify: `frontend/src/kernel/langs/vi/permission.json`, `frontend/src/kernel/langs/en/permission.json`, `frontend/src/plugins/sales/estimate/permissions/estimate-permission.keys.ts`
- Modify (specs): `seed-roles.panel.spec.ts`, `seed-roles.inventory.spec.ts`, `plugins/catalog/item/item.controller.spec.ts`, `plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts` (`:133-134` only), `plugins/production/production-issue/services/production-issue.service.spec.ts` (`:152` only), `plugins/sales/estimate/estimate.controller.spec.ts` (`:181-200` only), `kernel/core/auth/auth.service.spec.ts` (new director signature case)

## Steps
1. Change the seed specs to the new matrix first → they fail on the old seed.
2. Change `seed-roles.ts` and `estimate.permissions.ts` → seed specs pass; `unrecognizedRolePermissions` reports nothing for `estimate:price`.
3. Run the whole backend suite; for every other failure, change only an assertion that encodes the director's or engineering's old grant set, and list each one in the Receipt. A failure for any other reason → Failure Protocol.
4. Add the frontend label and key.

## Acceptance
- AC-01; AC-03 (role lock and director signature).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/langs/tests/permission-labels.test.ts"`
- Named probe: `seed-roles.panel.spec.ts` (estimate writers, file routes), `seed-roles.inventory.spec.ts` (P2 role matrix), `item.controller.spec.ts` (reference price by role), `roles.service.spec.ts` (`leaves the full-access role alone`), `auth.service.spec.ts` (director signature stored without review).
- Reachability: known. The frontend container mounts only `./frontend` (`compose.yml:141-143`), so the cross-package half of the label test skips there; the backend suite is the proof for the scope list.
- Oracle: exit 0, 0 skipped DB specs; the engineer item response has no `referencePrice` key.
- Counterexample: leaving engineeringLead on `estimate:*` must fail the `estimate:price` refusal; leaving `reference_price:read` on the engineer must fail the item spec; declaring the scope only in the seed must make `unrecognizedRolePermissions` report it.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
