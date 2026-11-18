# Task 13 — QC and delivery chain e2e over HTTP

Status: pending

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
