# Task 10 — Quotation approval, customer feedback and PDF

Status: pending

## Outcome
A quotation version is approved internally in one step by someone other than its creator, can be printed as PDF for the customer, and customer feedback and final decision are recorded.

## Scope
- In: `submit` (`draft → pending_approval`, by the version creator or SalesManager; notifies approvers after commit); approval per D-11 (`quotation:approve` for `salesManager`, `director`, `admin`; approver ≠ `version.createdBy` → 403); reject sets the version `rejected` with reason (immutable, D-03); Sales revises to N+1. Approve on first approved version advances request to `quoted` synchronously (D-07). Customer feedback log (date, channel, content). `customer_confirmed` only from `approved`; `cancelled` with reason → request `lost`. All transitions lock the header (D-08). Notifications after commit: approvers on `submit`, sales owner on approve/reject. PDF of an approved version (kernel print utilities).
- Out: e-signature, email sending, configurable approval engine.

## Coverage
- CP-10

## Ownership
- Create: `backend/src/plugins/sales/quotation/services/{quotation-approval,quotation-feedback,quotation-pdf}.service.ts` + specs, matching controller routes, `frontend/src/plugins/sales/quotation/components/approval/`, `feedback/`
- Modify: `backend/src/plugins/sales/quotation/quotation.controller.ts`, `quotation.module.ts`, shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/sales/quotation/services/quotation-approval.service.ts`

## Steps
1. Approval service with SoD check and row lock.
2. Feedback entity/migration + service.
3. Confirm/cancel transitions + request status port.
4. PDF render for approved versions only.
5. Frontend approval panel, feedback log, confirm/cancel actions, PDF button.
6. Specs: submit moves `draft → pending_approval` and notifies approvers once; approve a `draft` → 409; creator approves own version → 403; `sales` approves → 403; confirm `pending_approval` → 409; reject → version `rejected`, revise from it succeeds; approve sets request `quoted`; PDF of non-approved → 409; revise and confirm on the same approved version via `Promise.all` on real DB → exactly one succeeds and the version is not both `closed` and `customer_confirmed`.

## Acceptance
- AC-11 (revise–confirm race), AC-12.

## Dependencies
- task-09-quotation-pricing-versions.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation"`
- Named probe: `src/plugins/sales/quotation/services/quotation-approval.service.spec.ts`, `src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts`, frontend `approval-panel.test.tsx`
- Reachability: known after task-02.
- Oracle: exit 0; status codes as listed.
- Counterexample: removing the creator check must fail the self-approval spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
