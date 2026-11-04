# Task 05 — DateInput: Tab closes the calendar, it opens on the typed month

Status: done

## Outcome
In every date field, Tab out of the field's own input closes an open calendar without picking a day, Tab between calendar days keeps it open, and opening the calendar while the field holds a whole valid typed date shows that date's month.

## Scope
- In: `DateInput.tsx`
  - Tab (with or without Shift) whose `event.target` is the field's own input, while open → close the calendar and let focus move on (no `preventDefault`). Keys from inside the calendar (`handleOnKeyDown`/`onDayKeyDown` reach the same prop, `index.es.js:5411-5414,5602`) are ignored.
  - At the moment the calendar is opened (`onOpenCalendar`, an event handler), read the input's text; when it parses as dd/MM/yyyy within `min`/`max`, keep it in state and pass it as `openToDate`, else pass none. No reading of refs or DOM during render, no setState in an effect (`react-hooks` rules, see `ListToolbarFilters.tsx:242`).
  - `onOpenChange` keeps reporting.
- Out: changing `onChange` timing; any caller change.

## Coverage
- CP-05

## Ownership
- Modify: `frontend/src/kernel/core/components/ui/DateInput.tsx`
- Create: `frontend/src/kernel/core/components/ui/tests/date-input.test.tsx`
- Read: callers `OrderContractFields.tsx:56,63`, `RequestFormFields.tsx:141,154`, `LineInvoicesAction.tsx:218`, `PurchaseOrderEditor.tsx:201`, `QuotationFeedbackLog.tsx:67`, `ProductionUnitsTable.tsx:233`

## Steps
1. Test: open the calendar, type invalid text, keyDown Tab on the input → the calendar element is gone and `onChange` was not called.
2. Negative test: open the calendar, focus a day, keyDown Tab on the day → the calendar is still there.
3. Test: value `2027-01-15`, type `05/12/2026`, open via the icon → the header shows December 2026.
4. Implement; the callers' test suites run in the same command.

## Acceptance
- AC-10, AC-11.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/date-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core src/plugins/sales src/plugins/inventory src/plugins/production"`
- Named probe: `date-input.test.tsx` (Tab closes from the input, Tab from a day keeps it, open month); caller suites `production-order-detail.test.tsx`, `line-invoices-action.test.tsx`, `quotation-feedback-log.test.tsx` in the same run.
- Reachability: known; live check of one sales field and the production cell in the browser before GATE-DONE.
- Oracle: exit 0.
- Counterexample: no Tab handling must fail step 1 (the calendar element stays); closing on any Tab must fail step 2; opening on the selected month must fail step 3.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/date-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core src/plugins/sales src/plugins/inventory src/plugins/production"
Exit: 0
Base: 0559f7873dcc595a76f11f43ca301522728150d6
Head: ebe24559b0b32e245df5e14844c5e678115f4331ce3be355ec9289dab5b6b663
```text
$ docker compose exec -T frontend sh -c "test -f src/kernel/core/components/ui/tests/date-input.test.tsx && npm run lint && npm run typecheck && npx vitest run src/kernel/core src/plugins/sales src/plugins/inventory src/plugins/production"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/kernel/core/components/ui/tests/date-input.test.tsx (3 tests) 597ms
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (31 tests) 3720ms
 ✓ src/plugins/sales/quotation/tests/quotation-feedback-log.test.tsx (4 tests) 837ms
 ✓ src/kernel/core/tests/line-invoices-action.test.tsx (7 tests) 598ms
 Test Files  146 passed (146)
      Tests  1093 passed (1093)
VERIFY_EXIT=0
```

Pre-change run (tests first): lint and typecheck passed; vitest failed exactly 2 of the 3 new cases (Tab from the input closes the calendar; open on the typed month — header showed month 0 instead of 11); the Tab-on-a-day case passed before the change as the negative guard; 1084 passed. Mutations (date-input.test.tsx only, restored and compared after each): no Tab handling fails the Tab-close case; closing on any Tab fails the Tab-on-a-day case; no `openToDate` fails the open-month case. Review: PASS (code-auditor), 0 Critical/High/Medium; it walked both blur/close orders of the production planned-end cell and found no double PATCH and no lost typed text. Open Lows: icon path finds the input via `previousElementSibling`; `openToDate` is kept after close (overwritten on every open); no Shift+Tab case in the test. Live browser check of one sales field and the production cell is still owed before GATE-DONE.

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
