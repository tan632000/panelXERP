# Task 03 — Customer, contact and project management

Status: pending

## Outcome
Sales can create, list, filter, edit and soft-delete customers, their contacts and their projects (công trình/dự án); other plugins pick a customer/project through an exported picker and gateway.

## Scope
- In: `crm` plugin. Customer (code `KH_0001`, name, tax code, address, phone, email, sales owner, note). Contact (customer, name, position, phone, email, is primary). Project (code `DA_0001`, customer, name, site address, note). List with column filters, create/edit form, bulk delete with reference check, vi/en i18n, permissions registered in task-02 mapping. Gateway `CrmGateway.getCustomerSummary(id)` and `getProjectSummary(id)` in `_shared/gateways`.
- Out: customer credit limit, debt view (P5), Excel import (not requested for customers).

## Coverage
- CP-03

## Ownership
- Create: `backend/src/plugins/crm/`, `frontend/src/plugins/crm/`, `frontend/src/app/[locale]/crm/`
- Modify: both `enabled-plugins.ts`, both `enabled-features`, `seed-roles.ts` (append keys only)
- Read: `REF/backend/src/plugins/master-data/company/` (reference CRUD per `REF/docs/feature-standard/references/codebase-map.md:21`), `REF/backend/src/plugins/master-data/other-material/` (coded CRUD, map line 19)

## Steps
1. Scaffold from `docs/scaffold/new-plugin/` → plugin registered, typecheck green.
2. Entities on `BaseEntity`; migration with partial unique index on code `WHERE is_deleted = false`.
3. Services use kernel list/pagination/column-filter utils and `db-error.util` for 409.
4. Frontend list + form pages with kernel `ListPageLayout`, `Table`, `FormInput`.
5. Specs: service (duplicate code → 409, soft-deleted code reusable, delete blocked when project references customer) and controller permission guard (403).

## Acceptance
- AC-04: creating a second active customer with the same code returns 409; a soft-deleted code can be reused.
- AC-03 (runtime half): user without `crm.customer.create` gets 403.

## Dependencies
- task-02-roles-permission-seed.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/crm && npm run validate:migrations && npm run typecheck" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/crm/customer/services/customer.service.spec.ts`, `src/plugins/crm/customer/customer.controller.spec.ts`
- Reachability: known after task-01.
- Oracle: jest ≥ 1 suite per entity passes; both typechecks exit 0.
- Counterexample: dropping the partial-index `WHERE` clause must make the reuse test fail.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
