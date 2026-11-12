# Task 04 — Customer or project may be picked first

Status: done

## Outcome
In the create-request form the project select is usable before a customer is chosen and searches every visible project on the server; picking a project fills its customer, and picking a different customer clears a project that is not theirs.

## Scope
- In: create mode; with no customer, the project `FormSelect` uses `asyncLoad` (`frontend/src/kernel/core/components/ui/FormSelect.tsx:46`; usage example `ColumnValueFilter.tsx:95`) against `/projects?search=` (actor scope applies server-side, `backend/src/plugins/crm/project/services/project.service.ts:83-94`); option label `code — name (customerName)`. With a customer chosen, today's per-customer list stays.
- Out: edit mode (customer fixed, `RequestFormFields.tsx:73-82`); contacts still need a customer.

## Coverage
- CP-04

## Ownership
- Modify: `frontend/src/plugins/sales/request/components/RequestFormFields.tsx`
- Modify: `frontend/src/plugins/sales/request/services/request.service.ts`, `frontend/src/plugins/sales/request/hooks/api/useRequest.ts`
- Modify: `frontend/src/plugins/sales/request/tests/request-form.test.tsx`

## Steps
1. Service: `searchProjectOptions(search, page)` → `/projects` with `search`, returning `id, code, name, customerId, customerCode, customerName`; keep `getCustomerProjectOptions(customerId)`.
2. Project select: no `disabled` when no customer; `asyncLoad` with the search service when `customerId === 0`; keep the chosen option (label and customer) in local state and always include it in `options`, so the select shows its label whatever the current search page is.
3. On project change while customer is empty or different: set `customerId` and the picker label from the project; clear `contactId`.
4. Customer picker `onChange`: clear `projectId` only when the chosen project's `customerId` differs.
5. Tests: replace the case at `request-form.test.tsx:111-128` (it asserts no `/projects` call before a customer) with: project-first search sends `search` without `customerId`, fills the customer and shows the project label; after choosing customer 7, `/projects` is called with `customerId: 7`; changing to another customer clears the project; re-choosing the same customer keeps it.

## Acceptance
- AC-04: the four cases pass.

## Dependencies
- task-01-rename-labels.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request/tests/request-form.test.tsx"`
- Named probe: the four cases in `request-form.test.tsx`
- Reachability: frontend container
- Oracle: exit 0
- Counterexample: project select disabled with no customer, or search capped at the first 100 without querying → project-first case fails
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request/tests/request-form.test.tsx"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request/tests/request-form.test.tsx"
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (8 tests)
 Test Files  1 passed (1)
      Tests  8 passed (8)
EXIT=0
```

Final-Head rerun: the Command above was rerun on the final tree after every task in this packet was implemented; the output block is from that run.
