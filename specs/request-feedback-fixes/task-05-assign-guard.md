# Task 05 — Assign refused without requirements or files

Status: done

## Outcome
Assigning a request to a new engineer fails with 409 when its technical requirements are blank and it has no attachment; the UI shows "Cần nhập yêu cầu kỹ thuật hoặc đính kèm ít nhất 1 tài liệu trước khi phân công kỹ sư." Re-assigning the same engineer stays a 200 no-op.

## Scope
- In: check in `assign` after the same-engineer no-op return (`backend/src/plugins/sales/request/services/request.service.ts:456-458`), inside the locked transaction; files counted with `manager.getRepository(SalesRequestAttachment).count({ where: { requestId: id } })` (attachments are hard-deleted, `request-attachment.service.ts:210`).
- Out: create/update validation; blocking later deletion of files.

## Coverage
- CP-05

## Ownership
- Modify: `backend/src/plugins/sales/request/services/request.service.ts`
- Modify: `backend/src/plugins/sales/request/services/request.service.spec.ts`, `backend/src/plugins/sales/request/request-fixture.helper-spec.ts`, `backend/src/plugins/sales/request/request.controller.spec.ts`
- Modify: `backend/test/sales-chain.e2e-spec.ts`, `backend/test/inventory-chain.e2e-spec.ts`, `backend/test/production-chain.e2e-spec.ts`
- Create: `frontend/src/plugins/sales/request/tests/map-request-api-errors.test.ts`
- Modify: `frontend/src/plugins/sales/request/utils/map-request-api-errors.ts`, `frontend/src/kernel/langs/vi/request.json`, `frontend/src/kernel/langs/en/request.json`
- Read: `backend/src/plugins/sales/request/entities/request-attachment.entity.ts`

## Steps
1. Guard: `trimToNull(request.technicalRequirements) === null` and count 0 → `ConflictException('A request needs technical requirements or an attachment before it is assigned.')`.
2. Fixture: `createDraft` defaults `technicalRequirements: 'PIR 50mm'` and accepts an override (`request-fixture.helper-spec.ts:331-341`); controller spec create body and the three e2e request bodies (`sales-chain.e2e-spec.ts:264`, `inventory-chain.e2e-spec.ts:449`, `production-chain.e2e-spec.ts:436`) add `technicalRequirements`; so does the direct `fixture.service.create` at `request.service.spec.ts:278-291`.
3. Specs: refused with neither (override to empty); allowed with text only; allowed with one file only; same engineer twice with requirements cleared → no-op.
4. Frontend resolver row `[["needs technical requirements"], "assignBriefMissing"]` + vi/en `toast.assignBriefMissing`; a vitest case asserts the 409 message resolves to `assignBriefMissing` (path: `AssignRequestDialog.tsx:52-62` → `useRequest.ts:94-100` → `resolveRequestToastKey`).

## Acceptance
- AC-05: the four new specs pass; existing request specs and the three e2e chains pass.

## Dependencies
- task-01-rename-labels.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/request && npm run test:e2e -- --ci" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"`
- Named probe: the four new cases in `request.service.spec.ts`; `map-request-api-errors.test.ts` (`assignBriefMissing`); e2e `sales-chain`, `inventory-chain`, `production-chain`
- Reachability: backend and frontend containers (e2e run as in `specs/director-and-price-access`)
- Oracle: exit 0; the "neither" case expects `ConflictException`
- Counterexample: guard missing → "neither" case resolves; guard before the no-op → same-engineer case gets 409
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/request && npm run test:e2e -- --ci" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/request && npm run test:e2e -- --ci" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts (6.264 s)
PASS src/plugins/sales/request/services/request-owner-race.spec.ts (6.507 s)
PASS src/plugins/sales/request/services/request.service.spec.ts (6.816 s)
PASS src/plugins/sales/request/request.controller.spec.ts (29.38 s)
Test Suites: 4 passed, 4 total
Tests:       165 passed, 165 total
PASS test/inventory-chain.e2e-spec.ts (31.009 s)
PASS test/production-chain.e2e-spec.ts (31.709 s)
PASS test/app.e2e-spec.ts (38.492 s)
PASS test/sales-chain.e2e-spec.ts (41.219 s)
Test Suites: 4 passed, 4 total
Tests:       4 passed, 4 total
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/plugins/sales/request/tests/map-request-api-errors.test.ts (2 tests)
 ✓ src/plugins/sales/request/tests/request-attachments.test.tsx (20 tests)
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (8 tests)
 ✓ src/plugins/sales/request/tests/request-list.test.tsx (5 tests)
 ✓ src/plugins/sales/request/tests/request-detail.test.tsx (5 tests)
 Test Files  5 passed (5)
      Tests  40 passed (40)
EXIT=0
```

Final-Head rerun: the Command above was rerun on the final tree after every task in this packet was implemented; the output block is from that run.

ANSI colour codes were stripped from the output above; the Command ran once after the last edit. Pre-change run: exit 1, "refuses a request with neither, and changes nothing" failed (1 failed, 164 passed). Repair round 1: frontend lint flagged import order in the new `map-request-api-errors.test.ts`; fixed with `eslint --fix`, then the whole Command was rerun.

Scope exception: `backend/test/app.e2e-spec.ts` gained `jest.setTimeout(60_000)`. It failed on HEAD without this task's change (the request service restored to HEAD, same 5 s hook timeout); a timed throwaway probe put `Test.createTestingModule().compile()` at 6.8 s, of which `TypeOrmCoreModule` took 4.6 s, over jest's 5 s hook default. The other e2e suites already set 120-180 s; the health assertion is unchanged.

Review: the guard runs inside the assign transaction after the same-engineer no-op, so a reassign is checked too; attachments are hard-deleted (`request-attachment.service.ts:210`), so the count sees only live files. A draft still saves with a blank brief: the refusal case creates one with `technicalRequirements: '   '` before the assign is refused.
