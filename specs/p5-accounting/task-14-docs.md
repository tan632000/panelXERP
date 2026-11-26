# Task 14 — Docs: flow guide, role matrix, roadmap

Status: pending

## Outcome
The documents describe P5 as built: the accounting flow for each role, the `accountant` role and the `receivable`/`payable` rows in the role matrix (guarded by the doc spec), and the roadmap row and limitations.

## Scope
- In (D-02, D-15, D-16, D-18): `docs/user-flow-guide.md`: line 5 scope sentence (P5 done, P6 not), a new section "Kế toán" with the flow in the order a user meets it — schedule the milestones of an order ("Thanh toán" page), issue invoices, collect, void; supplier invoice and payment on a PO; the customer-debt and supplier-debt lists and their filters; the 07:00 reminders (stages, 3-day window, who is told, once per stage); the void rule (the accountant may void, the director is notified, no editing); that a collection needs an issued invoice on the milestone; that a re-assigned order keeps the previous owner's open reminder until it is closed; error messages the user will see; the demo account `accountant_a`; line 446 ("P5 – Kế toán" in the not-yet-done list) updated and the P5 known limitations listed (no editing, void only; no deposit before invoice; cancelling an order or PO does not check accounting rows; no aging report/export/e-invoice/bank reconciliation); `docs/permission/role-matrix.md`: `accountant` column and demo row (`accountant_a`, `accounting`, scope `material`), rows `receivable:read|manage` and `payable:read|manage`, notes on who sees what (accountant, director, admin; sales own orders read-only; salesManager read; purchasing none; engineering none), update date; `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts`: `REQUIRED_ROWS` gains the four scopes and a test requires the `accountant` column (as the `qcInspector` test, `:109-111`); `docs/development-roadmap.md`: P5 row status with GATE-DONE date left for the user's decision (text "Hoàn thành" only after GATE-DONE; until then "Đã làm xong, chờ GATE-DONE") and the date line.
- Out: any other doc; PDF/Excel documentation; marking the packet done.

## Coverage
- CP-14

## Ownership
- Modify: `docs/user-flow-guide.md`, `docs/permission/role-matrix.md`, `docs/development-roadmap.md`, `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts`
- Read: `backend/src/kernel/core/database/seeds/seed-roles.ts`, `seed-users.ts`, `specs/p5-accounting/plan.md`, `specs/p4-qc-delivery/task-14-docs.md` (same procedure, `role-matrix.md` "Cập nhật tài liệu này")

## Steps
1. Regenerate the role-matrix table from the seed by the procedure at the end of `role-matrix.md` (no generator script exists); add the notes.
2. Extend `role-matrix-doc.spec.ts` first (it fails against the old doc), then update the doc until it passes.
3. Write the flow-guide section from the implemented behavior of tasks 02-12 (read their Scope and the receipts), keeping existing sections byte-identical outside lines 5 and 446.
4. Roadmap row and date.

## Acceptance
- AC-15

## Dependencies
- task-13-accounting-chain-e2e.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/kernel/core/database/seeds/role-matrix-doc.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/kernel/core/database/seeds" && grep -c "accountant" docs/permission/role-matrix.md && grep -n "P5" docs/development-roadmap.md docs/user-flow-guide.md`
- Named probe: `role-matrix-doc.spec.ts` (`accountant` column, `receivable`/`payable` rows equal the seed, every column role seeded)
- Reachability: known (the spec reads `docs/permission/role-matrix.md` through the container's mounted docs; same form as P4 task-14).
- Oracle: exit 0, 0 skipped, the `grep -c` count ≥ 1, and the `grep -n` lines show P5 described as built, not "chưa làm".
- Counterexample: a matrix cell that disagrees with the seed (e.g. `sales` marked for `receivable:manage`) must fail the doc spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
