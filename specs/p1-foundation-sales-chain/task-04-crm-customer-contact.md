# Task 04 — Customer and contact management with owner scope

Status: pending

## Outcome
Sales manages their customers (KH) and contacts; managers see all; other plugins read customers through a gateway and can block deletion of referenced customers.

## Scope
- In: `crm` plugin shell. Customer (code `KH_0001` master-data shape, name, tax code, address, phone, email, `salesOwnerId`, note). Contact (customer, name, position, phone, email, isPrimary). List with column filters, form, bulk delete, vi/en i18n, permissions `customer:*`, `contact:*`. `CrmGateway.getCustomerSummary(id)` returns deleted records too. `ReferenceCheckRegistry` (in `crm/_shared/gateways`) where consumers register "is customer used?" checks; delete returns 409 when any check says yes.
- Out: projects (task-05); credit/debt (P5); customer Excel import.

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/crm/` (shell, `customer/`, `contact/`, `_shared/gateways/`), `frontend/src/plugins/crm/`, `frontend/src/app/[locale]/crm/customers/`
- Modify: shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/master-data/other-material/`, `REF/docs/feature-standard/references/runbook.md`

## Steps
1. Scaffold from `docs/scaffold/new-plugin/`; register plugin.
2. Entities on `BaseEntity`; partial unique index on code `WHERE is_deleted = false`.
3. Services apply `DataScopeService` (Sales: `salesOwnerId = me`, else 404).
4. Frontend list/form with kernel components; permission-gated buttons.
5. Specs: duplicate code 409; soft-deleted code reusable; Sales A reading Sales B's customer → 404; missing `customer:create` → 403; registered reference check → delete 409. Frontend: create button hidden without permission.

## Acceptance
- AC-04, AC-05, AC-06 for customers/contacts.

## Dependencies
- task-03-roles-permissions-scope.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm"`
- Named probe: `src/plugins/crm/customer/services/customer.service.spec.ts`, `src/plugins/crm/customer/customer.controller.spec.ts`, frontend `src/plugins/crm/customer/**/customer-list.test.tsx`
- Reachability: known after task-02.
- Oracle: all commands exit 0; backend and frontend suites each ≥ 1 passed.
- Counterexample: removing the scope filter must fail the 404 spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
