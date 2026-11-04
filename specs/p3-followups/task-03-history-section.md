# Task 03 — History section on the production order detail page

Status: done

## Outcome
A production manager or admin sees the order's history on its detail page, newest first, with readable labels; anyone whose response has no `events` sees no history section.

## Scope
- In: `types.ts` — `events?` optional, each event gains `stage: ProductionStage | null` and `severity: string | null`; the event type is derived from a new runtime list `PRODUCTION_ORDER_EVENTS` in `constants.ts` (pattern of `constants.ts:33-39`). A `DetailSection` "Lịch sử" / "History" in `ProductionOrderDetailPage.tsx`, rendered only when `order.events` is defined; each row shows time (dd/MM/yyyy HH:mm), actor name, event label, unit code, stage label and severity label when present, and `reason`; an empty list shows an empty-state line. vi/en labels in `production.json`.
- Out: history on the unit page.

## Coverage
- CP-03

## Ownership
- Modify: `frontend/src/plugins/production/production-order/components/ProductionOrderDetailPage.tsx`, `frontend/src/plugins/production/production-order/types.ts`, `frontend/src/plugins/production/production-order/constants.ts`, `frontend/src/kernel/langs/vi/production.json`, `frontend/src/kernel/langs/en/production.json`
- Modify (tests): `frontend/src/plugins/production/production-order/tests/production-order-detail.test.tsx`

## Steps
1. Test: an order with events lists them newest first with the stage and severity labels; an order without `events` renders no history heading; an empty array shows the empty line.
2. Test: every value of `PRODUCTION_ORDER_EVENTS` has a vi and an en label.
3. Implement.

## Acceptance
- AC-07.

## Dependencies
- task-02-history-access-issue-events.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"`
- Named probe: `production-order-detail.test.tsx` (history section cases, label coverage).
- Reachability: known.
- Oracle: exit 0.
- Counterexample: rendering the section for `events: undefined` must fail; removing the `issue_resolved` label must fail the label test.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/production src/kernel/langs"
Exit: 0
Base: 0559f7873dcc595a76f11f43ca301522728150d6
Head: ebe24559b0b32e245df5e14844c5e678115f4331ce3be355ec9289dab5b6b663
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
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (31 tests) 5145ms
 Test Files  8 passed | 1 skipped (9)
      Tests  72 passed | 6 skipped (78)
VERIFY_EXIT=0
```

Pre-change run (tests first): typecheck failed on the missing `history` labels and `PRODUCTION_ORDER_EVENTS`; vitest alone failed exactly the 5 new cases (newest first, no section without events, empty line, vi labels, en labels). Mutations: rendering the section for undefined `events` fails the absence case; removing the en `issue_resolved` label fails the label case. The runtime list holds all 10 backend event codes (`production-order-event.enum.ts`). Review: PASS (code-auditor); its Lows on an unrelated prettier hunk and `<ol>` were applied before this run. The 6 skipped tests are outside this task.

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
