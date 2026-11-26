# Task 01 — `accountant` role, grants, scope, labels and demo account

Status: pending

## Outcome
The seed creates role `accountant` ("NV Kế toán") with the D-02 grants and the demo account `accountant_a`; sales and salesManager hold their `receivable:read`; every other role holds no accounting scope; `accountant` reads no sales-chain and no material record; the role has a Vietnamese and an English label.

## Scope
- In: `seed-roles.ts` `ROLES` gains `['Accountant', 'accountant', …]` after `qcInspector` (`seed-roles.ts:269-279`) with `receivable:*`, `payable:*`; `sales` gains `receivable:read` (`:118-143`), `salesManager` gains `receivable:read` (Q2, `:94-117`); `ROLE_DATA_SCOPES.accountant = 'material'` and the doc comment of `material` names the accountant (`data-scope.service.ts:11-13,30-48`); no `switch` over `DataScope` changes. `seed-users.ts`: `accountant_a` (`emailLocal: 'accountant.a'`, `department: 'accounting'`, after `qc_a`, `:134-141`). `seed-roles.panel.spec.ts`: `accountant` in `PANEL_ROLES` (`:14-25`); `PENDING_MODULES` (`:32`) lists `receivable` and `payable` (declared by `receivable` / `payable` features) so the seed stores no undeclared scope; exact-grant assertions per D-02. `frontend/src/kernel/langs/{vi,en}/auth.json`: `roles.accountant` = "NV Kế toán" / "Accountant" (`vi/auth.json:114`, `en/auth.json:114`).
- Out: the stored-grant database check (tasks 02 and 05); accounting endpoints, tables, screens (task-02+); role-matrix doc (task-14, `role-matrix-doc.spec.ts` stays unchanged here: it requires only named columns to be seeded, `:103-107`).

## Coverage
- CP-01

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `seed-roles.panel.spec.ts`, `seed-users.ts` (+ `seed-users.spec.ts`), `backend/src/kernel/shared/services/data-scope.service.ts` (+ `data-scope.service.spec.ts`), `frontend/src/kernel/langs/vi/auth.json`, `frontend/src/kernel/langs/en/auth.json`
- Read: `specs/p4-qc-delivery/task-01-qc-role-permissions-scope.md` (same pattern), `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts:85-111`

## Steps
1. `data-scope.service.spec.ts`: `scopeOf({role:'accountant'})` is `material`; `canSee` false; an unmapped role still falls back to `ownSales` (`data-scope.service.ts:50`) → spec fails before the mapping exists.
2. Roles and grants → panel spec asserts the exact D-02 sets: accountant holds exactly `receivable:*` and `payable:*` and none of `order:read`, `material:read`, `customer:read`, `request:read`, `purchase_order:read`, `purchase_price:read`, `reference_price:read`, `stock:read`; sales and salesManager hold `receivable:read` and neither `receivable:manage` nor any `payable:*`; engineeringLead, engineer, purchasing, storekeeper, productionManager, technician, qcInspector hold no `receivable:*`/`payable:*`; admin and director hold `*:*`.
3. Demo user `accountant_a`; `seed-users.spec.ts` covers it (role `accountant`, department `accounting`).
4. Labels: both `auth.json` files carry `roles.accountant`; the frontend lint (`lint:i18n`) passes with vi and en keys paired.

## Acceptance
- AC-01; AC-11 (role-level negatives: no other role holds an accounting scope).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/shared/services/data-scope.service.spec.ts src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck"`
- Named probe: `seed-roles.panel.spec.ts` (`accountant` in `PANEL_ROLES`, D-02 grant sets, `receivable`/`payable` pending), `data-scope.service.spec.ts` (`accountant` → `material`, `canSee` false), `seed-users.spec.ts` (`accountant_a`)
- Reachability: known (P4 task-01 ran the same form; compose services `backend`, `frontend`).
- Oracle: exit 0, 0 skipped. The database assertion that `sales`, `salesManager` and `accountant` store their receivable scopes is not made here: the seed stores only declared scopes (`seed-roles.ts:358-367`), so it moves to the receipts of task-02 and task-05 (F-03).
- Counterexample: mapping `accountant` to `ownSales` by omission, or granting it `order:read`, must fail the scope/panel specs; giving `sales` `receivable:manage` must fail the panel spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
