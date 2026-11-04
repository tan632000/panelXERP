# Task 09 — History rows read as words, not codes

Status: pending

## Outcome
On the production order detail page, stage events show the stage label, and cabinet update events show the technician and the planned end date as dd/MM/yyyy with vi/en labels, instead of codes and English text.

## Scope
- In: `types.ts` — each event gains `assigneeName: string | null` and `plannedEndDate: string | null`. The history row in `ProductionOrderDetailPage.tsx:186-216` already shows `stage` through `stages.<code>`; it adds "Kỹ thuật viên: <name>" when `assigneeName` is set and "Hoàn thành dự kiến: <dd/MM/yyyy>" (via `formatIsoDate`, `frontend/src/kernel/core/lib/formatters.ts:17`) when `plannedEndDate` is set; vi/en labels in `production.json` under `history`. `reason` still shows when present (an undo reason, a cancel reason, an issue text, an old row the migration could not parse).
- Out: backend (task-08); the 409 toast wording.

## Coverage
- CP-08

## Ownership
- Modify: `frontend/src/plugins/production/production-order/components/ProductionOrderDetailPage.tsx`, `frontend/src/plugins/production/production-order/types.ts`, `frontend/src/kernel/langs/vi/production.json`, `frontend/src/kernel/langs/en/production.json`
- Modify (tests): `frontend/src/plugins/production/production-order/tests/production-order-detail.test.tsx`

## Steps
1. Test: a `stage_finished` event with `stage: "finishing"` and no reason shows the finishing label and no code; a `unit_updated` event with `assigneeName` and `plannedEndDate: "2026-11-20"` shows the technician line and `20/11/2026`, and no `2026-11-20`.
2. Implement.

## Acceptance
- AC-17.

## Dependencies
- task-08-history-event-data.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"`
- Named probe: `production-order-detail.test.tsx` (stage event label, cabinet update line).
- Reachability: known; live check of the history section on LSX_2026_0003 before GATE-DONE.
- Oracle: exit 0.
- Counterexample: printing `plannedEndDate` as received must fail the date case; dropping the technician line must fail the cabinet update case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
