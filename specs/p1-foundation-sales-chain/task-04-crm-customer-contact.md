# Task 04 — Customer and contact management with owner scope

Status: done

## Outcome
Sales manages their customers (KH) and contacts; managers see all; other plugins read customers through a gateway and can block deletion of referenced customers.

## Scope
- In: `crm` plugin shell. Customer (code `KH_0001` master-data shape, name, tax code, address, phone, email, `salesOwnerId`, note). Contact (customer, name, position, phone, email, isPrimary). List with column filters, form, bulk delete, vi/en i18n, permissions `customer:*`, `contact:*`. `CrmGateway.getCustomerSummary(id)` returns deleted records too. `ReferenceCheckRegistry` (in `crm/_shared/gateways`) where consumers register "is customer used?" checks; delete returns 409 when any check says yes.
- Out: projects (task-05); credit/debt (P5); customer Excel import.

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/crm/` (shell, `customer/`, `contact/`, `_shared/gateways/`), `frontend/src/plugins/crm/`, `frontend/src/app/[locale]/crm/customers/`
- Modify: shared registration files listed in plan.md, the four frontend scanner tests above
- Read: `REF/backend/src/plugins/master-data/other-material/`, `REF/docs/feature-standard/references/runbook.md`

## Steps
1. Scaffold from `docs/scaffold/new-plugin/`; register plugin.
2. Entities on `BaseEntity`; partial unique index on code `WHERE is_deleted = false`.
3. Services apply `DataScopeService` (Sales: `salesOwnerId = me`, else 404).
4. Frontend list/form with kernel components; permission-gated buttons.
5. Now that a business plugin exists, restore a "found > 0 item" guard in the frontend scanners left on an empty-walk guard by task-02 (`delete-confirmation`, `permission-gating-convention`, `api-error-message-keys`, `toast-namespace-messages`), and drop the unused `/countries` hook or add its endpoint if the CRM form needs it.
6. Specs: duplicate code 409; soft-deleted code reusable; Sales A reading Sales B's customer → 404; missing `customer:create` → 403; registered reference check → delete 409. Frontend: create button hidden without permission.

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

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm"
Exit: 0
Base: 6ef44a24c9c4e1dced51eeaa132f8a1486e90952
Head: aca6289d96776c5d26cd034a45f89518b012d61f9fed824d152ce516a83fb089
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/crm && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/crm"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/crm/customer/services/customer.service.spec.ts
PASS src/plugins/crm/contact/services/contact.service.spec.ts
PASS src/plugins/crm/_shared/gateways/crm-gateway.spec.ts
PASS src/plugins/crm/contact/contact.controller.spec.ts (5.153 s)
PASS src/plugins/crm/customer/customer.controller.spec.ts (5.22 s)
PASS src/plugins/crm/_shared/gateways/reference-check-registry.spec.ts
Test Suites: 6 passed, 6 total
Tests:       51 passed, 51 total
> panelxerp-backend@0.0.1 validate:migrations
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/crm/customer/tests/customer-form-owner.test.tsx (2 tests)
 ✓ src/plugins/crm/customer/tests/map-customer-api-errors.test.ts (4 tests)
 ✓ src/plugins/crm/contact/tests/contact-section.test.tsx (5 tests)
 ✓ src/plugins/crm/customer/tests/customer-list.test.tsx (5 tests)
 Test Files  4 passed (4)
      Tests  16 passed (16)
Exit: 0
```
Extra evidence (same Head, not the canonical command): full backend jest 63 suites / 609 passed; full frontend 118 files / 951 passed / 6 skipped (permission-labels needs `../backend`); live smoke after migrate + seed + `docker compose restart backend` (statuses only): sales_a create 201; sales_b GET/PATCH sales_a's customer 404/404; sales_mgr GET 200; engineer_a list 403; duplicate active code 409; PATCH email null 200, name null 400; sales_mgr delete 200 then sales_a GET 404; temporary smoke script deleted. Review (code-auditor): round 1 PASS_WITH_WARNINGS (Medium: PATCH null text → 500) → repaired by implementer + controller (email null now clears) → re-review PASS. Known limitation: contact section shows at most 100 contacts (no paging). Bulk delete follows the kernel contract (201 with per-row `failed` carrying the 409 reason); single delete returns 409. AC-05 wording resolved 2026-10-24 with user approval: contacts carry no code (their uniqueness rule is one primary per customer → 409); plan.md AC-05 updated.
