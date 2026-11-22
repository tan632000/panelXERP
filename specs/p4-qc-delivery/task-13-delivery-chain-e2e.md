# Task 13 — QC and delivery chain e2e over HTTP

Status: done

## Outcome
The P4 chain runs end to end over HTTP on the compose Postgres, as each role, from a converted order to a `completed` order.

## Scope
- In: `backend/test/delivery-chain.e2e-spec.ts` reusing the P3 e2e setup (`backend/test/production-chain.e2e-spec.ts`): converted order (MSB qty 2, project with a site address) → productionManager creates, assigns and releases the production order → technicians finish all six stages of MSB-1 only (MSB-2 stays before `finishing`, so the production order stays `released`) → qc_a round on MSB-1 with one `fail` (+ note, + photo) → productionManager reads `qc.unit.failed`, marks the defect fixed, then verifying it himself → 409 (Q8) → qc_a verifies → qc_a round with no fail → MSB-1 `passed`, storekeeper reads `qc.unit.passed` → while the production order is still `released`: productionManager finishing undo on MSB-1 → 409 and production order cancel → 409 (Q1/Q2) → technicians finish MSB-2, qc_a lists it as `waiting` and passes it → storekeeper delivery note 1 (MSB-1): ship, receive with a PDF handover file (download has `Content-Disposition: attachment`) → order still `in_production`, followers read `delivery_received` → a second note naming MSB-1 → 400 → note 2a (MSB-2) created and cancelled → note 2 (MSB-2) created, ship, receive → order `delivered`, followers read `delivered`, the order holds 0 reservations → storekeeper workshop return to the `delivered` order → 2xx (Q9) → storekeeper installation with the project address prefilled, start → sales_a acceptance → 409 → finish with a photo → sales_b acceptance → 404 → sales_a acceptance (PDF) → order `completed`, followers read `completed`. Every P4 read by every actor in the chain passes `expectNoMoneyKeys`; technician on any P4 endpoint → 403. Cleanup removes P4 rows before the P3/P2/P1 cleanup.
- Out: browser walkthrough (GATE-DONE, project habit).

## Coverage
- CP-13

## Ownership
- Create: `backend/test/delivery-chain.e2e-spec.ts`
- Modify: `backend/test/production-chain.e2e-spec.ts`, `backend/test/inventory-chain.e2e-spec.ts`, `backend/test/sales-chain.e2e-spec.ts` (cleanup order only, if P4 rows block it)
- Read: `backend/test/production-chain.e2e-spec.ts`, `backend/test/jest-e2e.json`

## Steps
1. Write the e2e; run all four e2e suites.

## Acceptance
- AC-11, AC-14.

## Dependencies
- task-12-installation-acceptance-screens.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f test/delivery-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- delivery-chain production-chain inventory-chain sales-chain"`
- Named probe: `delivery-chain.e2e-spec.ts`
- Reachability: known (P3 task-08 receipt: `test:e2e` takes positional patterns).
- Oracle: exit 0, four suites passed, 0 skipped.
- Counterexample: an order that becomes `delivered` after the first of two receipts, or `completed` while the installation is `in_progress`, must fail.
- Artifacts: ephemeral (rows cleaned by the spec).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f test/delivery-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- delivery-chain production-chain inventory-chain sales-chain"
Exit: 0
Base: 55f6825254fb736d232a13342017f9407f65cc21
Head: ff82bf5e27c74a23f4675f46bcd882f35766fb776ca33c6e0ef01e837c81e274
```text
$ docker compose exec -T backend sh -c "test -f test/delivery-chain.e2e-spec.ts && npm run migration:run && npm run seed && npm run test:e2e -- delivery-chain production-chain inventory-chain sales-chain"
PASS test/sales-chain.e2e-spec.ts (34.5 s)
PASS test/production-chain.e2e-spec.ts (36.857 s)
PASS test/inventory-chain.e2e-spec.ts (44.32 s)
PASS test/delivery-chain.e2e-spec.ts (48.001 s)
Test Suites: 4 passed, 4 total
Tests:       4 passed, 4 total
FINAL_EXIT=0
```
Skipped: none reported in the log. Extra checks outside the Command: `npm run typecheck && npm run lint` in the backend container exited 0; after the run, `delivery_notes`, `installations`, `acceptances` and `qc_rounds` held 0 rows in Postgres (the spec cleans its P4 rows and stored S3 objects). Counterexamples (each run once against a temporary mutation of product code, reverted afterwards; SHA-256 of `delivery-note.service.ts` `1cc8bf1de2d61952…` and `acceptance.service.ts` `ef6355599a33c835…` identical before and after): (1) the order becoming `delivered` after the first of two receipts (`Number(remaining) <= 1` instead of `=== 0`) failed `delivery-chain.e2e-spec.ts:860` (expected `in_production`, received `delivered`); (2) acceptance accepted while the installation is `in_progress` (installation-done check disabled) failed `delivery-chain.e2e-spec.ts:945` (the 409 expected from the acceptance).
Review: code-auditor PASS (0 critical/high/medium). Low, left as is: acceptance is refused only while the installation is `in_progress`, not while it is `planned`; the Q1/Q2 vetoes assert only the 409 status and the production order staying `released`, with no check that the finishing stage of MSB-1 is still done; one negative notice assertion (before the first receipt's `delivered` notice) reads once without a wait; the "unit already on a note" 400 is tested only against a received note; `installPhotoId` could be a `const`; the e2e does not check that the refused acceptance stored no object (covered by the acceptance unit specs).
Deviations from the Scope chain: before delivery the storekeeper is issued 1 of the 2 units of stock (so that "reservations > 0, then 0 once delivered" and the Q9 workshop return to the `delivered` order have a real precondition); the final read matrix asserts 403 for productionManager and qcInspector on the acceptance read, which is the planned grant (plan D-02 and `seed-roles.ts`), not a test bent to the seed; follower notices are read by productionManager and sales_a (sales manager for `completed`), not by the storekeeper. The three existing e2e specs needed no change (P4 rows did not block their cleanup). Pre-change run by the controller: the `test -f` check failed (exit 1). The implementer reported `tsc --noEmit` errors in other spec files; `npm run typecheck` (the project script) and lint are clean, so that was a different invocation and is not pursued. Not verified: no browser walkthrough (out of scope for this task, done at GATE-DONE).
Docs impact: none yet (docs are task-14).
