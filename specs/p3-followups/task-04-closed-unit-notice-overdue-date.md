# Task 04 — Closed-unit notice and overdue notice date

Status: done

## Outcome
The unit page says why photos and issues are closed when its order is not released, and the overdue notice shows its planned end date as dd/MM/yyyy.

## Scope
- In: `UnitDetailPage.tsx` shows one line above the photos and issues sections when `productionOrderStatus` is not `released` (`working` at line 109), worded by status: draft → "Lệnh sản xuất chưa phát hành", completed → "Lệnh sản xuất đã hoàn thành", cancelled → "Lệnh sản xuất đã huỷ", each followed by "nên không thêm ảnh hoặc báo vấn đề được."; vi/en labels. `useNotifications.ts` formats `plannedEndDate` of the overdue notice with `formatIsoDate` (`frontend/src/kernel/core/lib/formatters.ts:17`).
- Out: changing the 409 rule.

## Coverage
- CP-04

## Ownership
- Modify: `frontend/src/plugins/production/progress/components/UnitDetailPage.tsx`, `frontend/src/kernel/core/hooks/api/useNotifications.ts`, `frontend/src/kernel/langs/vi/production.json`, `frontend/src/kernel/langs/en/production.json`
- Modify (tests): `frontend/src/plugins/production/progress/tests/unit-stages.test.tsx`, `frontend/src/kernel/core/tests/use-notifications.test.ts`

## Steps
1. Test in `unit-stages.test.tsx` (fixture `productionOrderStatus: "completed"` exists at `:262`): a completed unit shows the completed line and no upload button; a released unit shows no such line.
2. In `use-notifications.test.ts` change the overdue expectations at `:348` and `:351` from `2026-11-02` to `02/11/2026` (the text the notice now shows).
3. Implement.

## Acceptance
- AC-08, AC-09.

## Dependencies
- task-03-history-section.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production/progress src/kernel/core/tests/use-notifications.test.ts src/kernel/langs"`
- Named probe: `unit-stages.test.tsx` (closed notice), `use-notifications.test.ts` (overdue date).
- Reachability: known.
- Oracle: exit 0.
- Counterexample: passing the ISO date through must fail the notice test; showing the line for a released unit must fail.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production/progress src/kernel/core/tests/use-notifications.test.ts src/kernel/langs"
Exit: 0
Base: e088f943fce05d0378c3b55024899c6ce23f39cc
Head: 78fd084bec77c3f935e1c2749a50ae33cda596e69b6c94ad00412b4cfe866592
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production/progress src/kernel/core/tests/use-notifications.test.ts src/kernel/langs"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/kernel/core/tests/use-notifications.test.ts (52 tests) 213ms
 ✓ src/plugins/production/progress/tests/unit-stages.test.tsx (15 tests) 1346ms
 Test Files  5 passed | 1 skipped (6)
      Tests  81 passed | 6 skipped (87)
VERIFY_EXIT=0
```

Pre-change run (tests first): lint and typecheck passed; exactly the 4 new or changed cases failed (the overdue notice phrasing, and the draft, completed and cancelled closed lines); 77 passed. Mutations: passing the ISO date through fails the notice case; showing the line for a released order fails the released case. The overdue expectation sits at `use-notifications.test.ts:348,352` (the task named :351). Review: PASS (code-auditor); the cancelled wording was then aligned to the file's existing spelling "huỷ" in the task, the json and the test, and this run is after that change. Every status other than released has a label (draft, completed, cancelled).

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
