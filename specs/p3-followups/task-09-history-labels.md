# Task 09 — History rows read as words, not codes

Status: done

## Outcome
On the production order detail page, stage events show the stage label, and cabinet update events show the technician and the planned end date as dd/MM/yyyy with vi/en labels, instead of codes and English text.

## Scope
- In: `types.ts:33-43` — each event gains `assigneeName: string | null` and `plannedEndDate: string | null`. The history row in `ProductionOrderDetailPage.tsx:186-216` already shows `stage` through `stages.<code>`; it adds "Kỹ thuật viên: <name>" when `assigneeName` is set and "Hoàn thành dự kiến: <dd/MM/yyyy>" (via `formatIsoDate`, `frontend/src/kernel/core/lib/formatters.ts:17`) when `plannedEndDate` is set; vi/en labels in `production.json` under `history`. `reason` still shows when present (an undo reason, a cancel reason, an issue text, an old row the migration could not parse).
- Out: backend (task-08); the 409 toast wording.

## Coverage
- CP-08

## Ownership
- Modify: `frontend/src/plugins/production/production-order/components/ProductionOrderDetailPage.tsx`, `frontend/src/plugins/production/production-order/types.ts`, `frontend/src/kernel/langs/vi/production.json`, `frontend/src/kernel/langs/en/production.json`
- Modify (tests): `frontend/src/plugins/production/production-order/tests/production-order-detail.test.tsx`

## Steps
1. The existing `history()` fixture (`production-order-detail.test.tsx:733-756`) gains `assigneeName: null, plannedEndDate: null` on each event.
2. Test, reading each row through `within(list).getAllByRole("listitem")` and `toHaveTextContent` on that row: a `unit_updated` event with `assigneeName: "Kỹ thuật C"` and `plannedEndDate: "2026-12-05"` shows the technician label with "Kỹ thuật C" and `05/12/2026`, and the row does not contain `2026-12-05`. The names and dates differ from the unit fixture (`:99-100`) and the history actor (`:748`).
3. The label test (`:810-822`) checks the two new `history` keys in both vi and en.
4. A `stage_finished` event with `stage: "finishing"` and no reason shows the finishing label and not `finishing` — a regression guard, not a probe of this task (the page already renders `stages.<code>`).
5. Implement.

## Acceptance
- AC-17.

## Dependencies
- task-08-history-event-data.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"`
- Named probe: `production-order-detail.test.tsx` (cabinet update row, vi/en label keys).
- Reachability: known; live check of the history section on LSX_2026_0003 before GATE-DONE.
- Oracle: exit 0.
- Counterexample: printing `plannedEndDate` as received must fail the date case; dropping the technician line must fail the cabinet update case; removing the en `history` key for the date must fail the label test.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"
Exit: 0
Base: e088f943fce05d0378c3b55024899c6ce23f39cc
Head: 78fd084bec77c3f935e1c2749a50ae33cda596e69b6c94ad00412b4cfe866592
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (35 tests) 7079ms
 Test Files  8 passed | 1 skipped (9)
      Tests  76 passed | 6 skipped (82)
VERIFY_EXIT=0
```

This run started after the last edit (mutations restored, prettier applied). Pre-change run: typecheck failed on the new `assigneeName`/`plannedEndDate` fields in the test fixtures; the detail test file alone failed exactly the cabinet update case (34 passed); the stage case passed already as the planned regression guard; the vi/en key test also passed already because the two keys were added before the pre-run. Counterexamples (detail test file only, restored and compared): printing `plannedEndDate` as received fails the date case; dropping the technician line fails the cabinet update case; removing the en `history.plannedEnd` key fails the en label case. A prettier reflow of `update.mutateAsync` outside the task was reverted. Review: PASS (code-auditor). Open Low: the history row is adjacent spans, read as one line by a screen reader; each part carries its own label. Live check of LSX_2026_0003 is still owed before GATE-DONE.
