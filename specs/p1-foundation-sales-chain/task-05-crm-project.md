# Task 05 — Project (công trình/dự án) management

Status: pending

## Outcome
Sales records projects under a customer; requests and orders later link to a project.

## Scope
- In: Project (code `DA_0001`, customer, name, site address, note). Scope inherits the customer's owner. CRUD, i18n, permissions `project:*`, `CrmGateway.getProjectSummary(id)`, delete guarded by `ReferenceCheckRegistry`; customer deletion blocked when it has active projects.
- Out: site installation tracking (P4).

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/crm/project/`, `frontend/src/plugins/crm/project/`, `frontend/src/app/[locale]/crm/projects/`
- Modify: `backend/src/plugins/crm/crm.module.ts`, `backend/src/plugins/crm/_shared/gateways/`, shared registration files listed in plan.md

## Steps
1. Entity/migration (partial unique code); service with scope via customer owner.
2. Register a customer reference check for projects.
3. Frontend list/form with customer picker.
4. Specs: duplicate code 409; Sales B cannot read Sales A's project (404); deleting a customer with a project → 409.

## Acceptance
- AC-05, AC-06 for projects.

## Dependencies
- task-04-crm-customer-contact.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm/project && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm/project"`
- Named probe: `src/plugins/crm/project/services/project.service.spec.ts`, frontend `project-form.test.tsx`
- Reachability: known after task-02.
- Oracle: exit 0; both suites ≥ 1 passed.
- Counterexample: not registering the reference check must fail the customer-delete spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
