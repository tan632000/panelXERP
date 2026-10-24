# Task 05 — Project (công trình/dự án) management

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm/project && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm/project"
Exit: 0
Base: 3340df8f70e15b7f02652ce3cbd101235bfa2355
Head: a02ab81801cd56c34f0bf5424260f8517fd50d5902b28fd6a6524a91f168e345
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm/project && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm/project"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/crm/project/services/project.service.spec.ts (6.213 s)
PASS src/plugins/crm/project/project.controller.spec.ts (10.626 s)
Test Suites: 2 passed, 2 total
Tests:       31 passed, 31 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (19 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/crm/project/tests/project-form.test.tsx (3 tests)
 ✓ src/plugins/crm/project/tests/project-form-modal.test.tsx (1 test)
 ✓ src/plugins/crm/project/tests/project-list.test.tsx (5 tests)
 Test Files  3 passed (3)
      Tests  9 passed (9)
Exit: 0
```
Extra evidence (same Head, not the canonical command): full backend jest 65 suites / 644 passed; full frontend 121 files / 966 passed / 6 skipped; live smoke after seed + `docker compose restart backend` (statuses only): sales_a creates customer 201 and project 201; sales_b GET project 404, create under sales_a's customer 404; PATCH customerId 400; duplicate project code 409; sales_mgr delete customer with active project 409, delete project 200, then delete customer 200; temporary smoke script deleted. Counterexample: `project.service.spec.ts` asserts a customer with an active project deletes successfully when the reference check is not registered. Review (code-auditor): round 1 FAIL (Medium: fabricated migration timestamp 1792771612345) → renamed to 1792823066770 (Date.now), dev DB migrations row replaced, stale dist build removed; Low form reset fixed with a submit-level modal test → re-review PASS. Known limitation: no lock between creating a project and deleting its customer (a concurrent pair can leave a hidden project under a soft-deleted customer; no data loss or scope leak).
