# Task 06 — Files can be attached in the create form

Status: done

## Outcome
The create-request modal has a "Tài liệu đính kèm" picker and a hint that technical requirements or a file are needed before assignment; chosen files upload one by one to the new request after it is created; a failed file is named in a toast and the request stays created; saving cannot run twice.

## Scope
- In: create mode; client checks reuse `attachment-file.ts` and `ATTACHMENT_MAX_COUNT` (`frontend/src/plugins/sales/request/constants.ts:57`); remove a queued file before saving; picker and hint rendered inside the modal, below `RequestFormFields`.
- Out: edit modal; drag-drop; preview.

## Coverage
- CP-06

## Ownership
- Modify: `frontend/src/plugins/sales/request/components/RequestFormModal.tsx`
- Modify: `frontend/src/plugins/sales/request/tests/request-form.test.tsx`
- Modify: `frontend/src/kernel/langs/vi/request.json`, `frontend/src/kernel/langs/en/request.json`
- Modify: `docs/user-flow-guide.md` (the create-request step)
- Read: `frontend/src/plugins/sales/request/components/RequestAttachments.tsx`, `frontend/src/plugins/sales/request/utils/attachment-file.ts`, `frontend/src/plugins/sales/request/services/request.service.ts:118` (`uploadRequestAttachment`), `frontend/src/plugins/sales/request/utils/map-request-api-errors.ts`

## Steps
1. Local `File[]` state; picker and hint (create mode only); refusal reasons from `attachment-file.ts`.
2. `submitDisabled={form.formState.isSubmitting}` on the `Modal`.
3. After `createMutation` resolves, call `uploadRequestAttachment(created.id, file)` per file, each in its own try/catch; collect failed names; if any, toast `toast.uploadFailed` with `{names}`; then `onCreated(created)` and close. Upload errors never reach the outer catch.
4. New vi/en keys: `attachments.pickAtCreate`, `attachments.assignHint`, `toast.uploadFailed`.
5. Doc: one sentence in the create-request step of `user-flow-guide.md` on attaching at create and the assign rule.
6. Tests: two files queued → `createRequest` once, then two upload calls; one upload rejects → toast names it, `createRequest` called once, `onCreated` still called.

## Acceptance
- AC-06: both tests pass.

## Dependencies
- task-04-two-way-customer-project.md
- task-05-assign-guard.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"`
- Named probe: the two new cases in `request-form.test.tsx`
- Reachability: frontend container
- Oracle: exit 0
- Counterexample: uploads before create, a second `createRequest`, or a failure skipping `onCreated` → test fails
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request"
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

ANSI colour codes were stripped from the output above; the Command ran once after the last edit. Pre-change run (tests written, component unchanged): exit 2, typecheck refused `viRequest.toast.uploadFailed` (key absent), so the new cases could not pass. The two new cases are "creates the request once, then uploads each queued file to it" (asserts POST order: create, then two uploads to `/sales/requests/5/attachments`, with the queued names) and "keeps the created request when a file fails to upload, and names that file" (one create, `onCreated` called, the toast captured through the real `subscribeToast` names `broken.pdf`).

Review: each upload has its own try/catch, so a failed file never reaches the outer form error handler and never re-runs the create; the submit button is disabled while `isSubmitting`, which spans the create and the uploads; the picker, queue and assign hint render only when no `request` is passed (edit modal unchanged); queued files are cleared each time the modal opens. Not walked in the browser for this task.
