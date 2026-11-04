# Task 06 — Planned end date cell polish

Status: done

## Outcome
The planned end date cell shows the saved date after Enter on invalid text and after a refused save (so the refused date is not sent again), and keeps focus after an Enter save.

## Scope
- In: `PlannedEndDateCell` in `ProductionUnitsTable.tsx`
  - D-06: after Enter on text that is not a whole date in range, and after a refused save while the field is focused, blur the input and focus it again inside the cell; the picker resets its text to the shown value on blur (`index.es.js:4776`). The cell's own leave logic must not fire for this internal blur (e.g. a ref flag set around the blur/focus).
  - Drop the `key` remount (line 125); follow `saved` with the "previous value in state, adjust during render" pattern for `draft`, and update `sent` in handlers, not during render (no setState in effects, no ref reads during render).
- Out: DateInput (task-05).

## Coverage
- CP-06

## Ownership
- Modify: `frontend/src/plugins/production/production-order/components/ProductionUnitsTable.tsx`
- Modify (tests): `frontend/src/plugins/production/production-order/tests/production-order-detail.test.tsx`

## Steps
1. Tests: Enter on `31/02/2026` → the field shows the saved date, no PATCH; a refused PATCH after Enter → the field shows the saved date and a following blur sends nothing; Enter save → `document.activeElement` is still the field after the refetch.
2. Implement; the existing 10 date tests stay green.

## Acceptance
- AC-12, AC-13, AC-14.

## Dependencies
- task-05-dateinput-tab-open-month.md
- task-03-history-section.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production"`
- Named probe: `production-order-detail.test.tsx` (three new cases plus the existing date cases).
- Reachability: known; live browser check of Enter and a refused save before GATE-DONE.
- Oracle: exit 0.
- Counterexample: keeping the `key` remount must fail the focus case; `setDraft` alone on Enter must fail the invalid-text case; letting the internal blur run the leave logic must fail the refused case with a second PATCH.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production"
Exit: 0
Base: 0559f7873dcc595a76f11f43ca301522728150d6
Head: ebe24559b0b32e245df5e14844c5e678115f4331ce3be355ec9289dab5b6b663
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (31 tests) 3318ms
 Test Files  8 passed (8)
      Tests  72 passed (72)
VERIFY_EXIT=0
```

Pre-change run (tests first): lint and typecheck passed; exactly the 3 new cases failed (invalid text after Enter, refused save after Enter, focus after an Enter save); 65 passed. Mutations: keeping the `key` remount fails the focus case; `setDraft` alone on Enter fails the invalid-text case; letting the internal blur run the leave logic fails the refused case with a second PATCH. Review round 1 FAIL (High): without the remount `sent` no longer followed a saved date changed by someone else, so a retyped date was silently not saved and invalid text showed a stale date; repaired with two tests that failed first (0 PATCH; 20/11 instead of 28/11). Review round 2 FAIL (High ABA S→A→S deduped by a value comparison; Medium stale `saved` in the refusal handler); repaired by counting saved versions and reading the newest saved date through a ref written in an effect, with two more tests that failed first at the intended assertions (1 PATCH instead of 2; 20/11 instead of 28/11). Mutations: the refusal handler using the closure date fails the refused-after-change case; a value-based resync fails the ABA case (and three refused cases). Review round 3: PASS (code-auditor). Open Lows: `latest` is written in a passive effect, so a handler in the same frame as a refetch render may read one render behind (worst case one redundant no-op PATCH); the refused-after-change test syncs `sent` through its invalid-text Enter before the refusal, so it does not isolate the refusal handler; overlapping saves can resend one date (backend no-op). Live browser check of Enter and a refused save is still owed before GATE-DONE. This run is on the bytes after the last change.

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
