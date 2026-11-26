# Task 02 — Accounting plugin and the payment milestones of an order

Status: pending

## Outcome
The `accounting` plugin is registered with feature `receivable`; an accountant (or director/admin) defines, edits and deletes the payment milestones of a sales order (name, percent or amount, due date) with whole-dong amounts, bounded by the order total; sales and other roles are refused per D-02/D-03.

## Scope
- In (feature `receivable`, D-05, D-06): backend plugin `accounting` (`accounting.plugin.ts`, `accounting.module.ts`, `accounting.features.ts`) registered in both backend catalogs after `delivery` (`enabled-plugins.ts:24-31`, `enabled-features.ts:25-32`); sales `_shared` port `OrderFinancePort` (`lockForFinance`: order row `FOR UPDATE` → `{id, code, status, total, customerName, projectName}` or null; exported by `SalesSharedModule`, `sales-shared.module.ts:20-43`); permissions `receivable:read|manage`; migration of `order_payment_plans` (unique `(order_id) WHERE is_deleted = false`, snapshot `order_code`, `customer_name`, `project_name`, `order_total`) and `payment_milestones` (`order_id`, `name` ≤ 200, `percent numeric(5,2)` null, `amount numeric(18,0) > 0`, `due_date date`, audit columns with `is_deleted`: a milestone is soft-deleted, never hard-deleted, D-05/D-21); no foreign key to `sales_orders` (D-21). Endpoints: `POST /accounting/orders/:orderId/milestones` `{name, percent? | amount?, dueDate}` (`receivable:manage`), `PATCH /accounting/milestones/:id`, `DELETE /accounting/milestones/:id` (soft delete); the response is the milestone row (`id, orderId, name, percent, amount, dueDate`). Inside every write: `OrderFinancePort.lockForFinance` → data scope (404, D-03) → order `cancelled` (409) → rules. Percent → amount with `decimal.js` `ROUND_HALF_UP` (D-04), except that the write completing Σ percent = 100.00 stores `total − Σ amounts of the other live milestones` (D-05, R-05); `dueDate` has no lower bound (F-05); both/neither of percent and amount → 400; Σ milestone amounts of the order ≤ order total → else 409 `Milestones exceed the order total (remaining: N)`; PATCH and DELETE here carry no invoice/collection guard (those tables do not exist yet); task-03 adds "PATCH amount ≥ live invoiced" and "DELETE only without a live invoice or collection" to `payment-milestone.service.ts`. The first milestone of an order creates the plan header in the same transaction. Only `receivable:manage` holders write: `sales` and `salesManager` hold `receivable:read` only and get 403 on all three routes (user, Q11). `seed-roles.panel.spec.ts`: remove `receivable` from `PENDING_MODULES`. `frontend/src/kernel/langs/{vi,en}/permission.json`: labels for `receivable:*`. OpenAPI and `api.ts` regenerated.
- Out: invoices and collections (task-03); read model and lists (task-04); screens; reminders.

## Coverage
- CP-02

## Ownership
- Create: `backend/src/plugins/accounting/accounting.{plugin,module,features}.ts`, `backend/src/plugins/accounting/receivable/**` (migration, entities `order-payment-plan`, `payment-milestone`, dto, permissions, `services/payment-milestone.service.ts` + `.spec.ts`, `services/payment-milestone-race.spec.ts`, `receivable.controller.ts` + `receivable.controller.spec.ts`, `receivable.module.ts`, `receivable-db.helper-spec.ts`), `backend/src/plugins/sales/_shared/ports/order-finance.port.ts` + `.spec.ts`
- Modify: `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `backend/src/kernel/platform/features/enabled-features.ts`, `backend/src/plugins/sales/_shared/sales-shared.module.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/sales/_shared/ports/order-production.port.ts:36-65,117-132`, `backend/src/plugins/delivery/delivery.plugin.ts`, `delivery/_shared/utils/delivery-scope.util.ts:15-32` (scope pattern), `backend/src/plugins/inventory/purchase-order/utils/purchase-order-pricing.ts:16-21`

## Steps
1. Port spec (real Postgres): `lockForFinance` returns the header with `total` as numeric text and holds the row (a second transaction's `UPDATE` waits via `queuedBehind`); unknown/deleted order → null.
2. Create → `payment-milestone.service.spec.ts`: percent 30 of total 1 000 001 → amount 300 000 (half-up, whole dong), `percent` stored 30; amount-only → `percent` null; 50% then 50% on total 1 000 001 stores 500 001 then 500 000 (Σ = total), 30% then 70% on 1 000 001 stores 300 000 and 700 001 (the completing write takes the remainder), while 30% and 60% stay at plain half-up figures; an amount-entered milestone counts in the "other amounts"; `dueDate` of yesterday is accepted; both → 400; neither → 400; `amount` 0, −1, 1.5 → 400; percent 0, 100.01, 3 decimals → 400; no `@Max` ceiling (a 10-digit amount that fits the total is accepted); `dueDate` malformed → 400; Σ over total → 409 with the stated message; cancelled order → 409; first milestone creates exactly one plan row with the snapshot, the second reuses it.
3. Scope and roles: sales_a (own order) `POST` → 403; sales_b `POST` or `PATCH` on sales_a's order → 403 (permission first) and with `receivable:manage` granted in the spec → 404 before any 409; salesManager (with `receivable:read`, scope `all`) → 403 on all three routes (user, Q11); technician, engineer, engineeringLead, purchasing, storekeeper, productionManager, qcInspector → 403 on all three routes; accountant, director, admin → 2xx.
4. PATCH/DELETE: edit name, due date, amount; (the invoiced-amount guard is asserted in task-03); DELETE of an unused milestone → 2xx, the row stays with `is_deleted = true` and is absent from the Σ bound (a new milestone may use the freed room); the order's last milestone deleted leaves the plan header (no cascade); a second DELETE → 404. The invoice/collection-aware branch (a milestone with only voided children deletes without a 500) is asserted in task-03.
5. Race → `payment-milestone-race.spec.ts` (`queuedBehind`, holder holds the `sales_orders` row): two creates that together exceed the total → exactly one 201, one 409; create ∥ order cancel (order moved to `cancelled` first) → create 409.
6. Registration: `getAllPluginPermissions()` contains `receivable:read|manage`; `FEATURE_CATALOG` contains the feature (migration ran, table exists); `validatePluginDependencies` passes with `ENABLED_PLUGINS` limited to `sales,inventory,accounting` plus the plugins they need.
7. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-02; AC-11 (milestone routes, every role); AC-16 (cancelled order refuses a new milestone).

## Dependencies
- task-01-accountant-role-permissions-scope.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/receivable/services/payment-milestone.service.spec.ts && test -f src/plugins/accounting/receivable/services/payment-milestone-race.spec.ts && test -f src/plugins/accounting/receivable/receivable.controller.spec.ts && test -f src/plugins/sales/_shared/ports/order-finance.port.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts src/kernel/platform && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*) from roles where (code in ('sales','salesManager') and not permissions ? 'receivable:read') or (code = 'accountant' and not permissions ? 'receivable:*')\""`
- Named probe: `payment-milestone.service.spec.ts` (rounding, percent/amount rule, Σ bound, cancelled, plan header), `payment-milestone-race.spec.ts` (create ∥ create, create ∥ cancel), `receivable.controller.spec.ts` (403 per role, 404 before 409), `order-finance.port.spec.ts` (lock)
- Reachability: known (same form as P4 task-08; compose services `backend`, `frontend`; `sales_orders` from P1).
- Oracle: exit 0, 0 skipped, `permission-labels.test.ts` passes, psql prints `0` (the stored roles hold `receivable:read` for sales/salesManager and `receivable:*` for the accountant; a non-zero count means a role was edited by an administrator → grant it manually per D-02 and record that in the receipt).
- Counterexample: computing Σ before the order lock must fail the create ∥ create race; floor/ceil instead of half-up must fail the 1 000 001 case; omitting the 404-before-409 order must fail the sales_b case; a hard `DELETE` must fail the soft-delete probe; letting salesManager write must fail the 403 probe; plain half-up on both halves of 50/50 must fail the remainder probe; skipping `FEATURE_CATALOG` must leave the migration table missing and fail the first spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
