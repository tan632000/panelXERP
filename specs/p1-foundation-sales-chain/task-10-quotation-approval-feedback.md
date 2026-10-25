# Task 10 — Quotation approval, customer feedback and PDF

Status: done

## Outcome
A quotation version is approved internally in one step by someone other than its creator, can be printed as PDF for the customer, and customer feedback and final decision are recorded.

## Scope
- In: `submit` (`draft → pending_approval`, by the version creator or SalesManager; notifies approvers after commit); approval per D-11 (`quotation:approve` for `salesManager`, `director`, `admin`; approver ≠ `version.createdBy` → 403); reject sets the version `rejected` with reason (immutable, D-03); Sales revises to N+1. Approve on first approved version advances request to `quoted` synchronously (D-07). Customer feedback log (date, channel, content). `customer_confirmed` only from `approved`; `cancelled` with reason → request `lost`. All transitions lock the header (D-08). Notifications after commit: approvers on `submit`, sales owner on approve/reject. Customer-facing output of an approved version in BOTH .xlsx and PDF following the layout of `docs/BG.xlsx` (user decision 2026-10-24): company letterhead (name, address, website, tax code, bank accounts from config), title `BẢNG CHÀO GIÁ`, number `NN-ddmmyyyy/BG`, quotation date, `Kính gửi` customer, recipient contact name/phone/email, sender (sales owner) name/phone/email, one Roman-numbered section per panel with its quantity, unit price and amount, the panel's BOM lines listed below it (description, code, brand, unit, quantity), subtotal, VAT at the version rate, total after tax, numbered terms, and the `Xác nhận đặt hàng` / place-and-date block. Default terms (warranty 12 months; delivery 1–2 weeks; delivery at the seller's workshop; 50% advance after contract, balance before delivery; valid 15 days) are copied into each new quotation and editable per version.
- Out: e-signature, email sending, configurable approval engine.

## Decisions (user, 2026-10-25)
- Stale estimate: `submit` of a draft whose estimate revision is no longer the request's latest submitted revision → 409; the draft offers "update from the latest estimate" (`POST /sales/quotations/:id/refresh-estimate`, draft only), which rebuilds the panel lines and frozen BOM from the latest submitted revision and keeps each margin whose panel tag still exists.
- Revise button on the quotation page, shown while the current version is `pending_approval`, `approved` or `rejected`.
- A cancelled quotation ends its request (`lost`); a returning customer gets a new request. One quotation per request stays.
- Letterhead (company name, address, website, tax code, bank accounts) comes from config with the values of `docs/BG.xlsx` as defaults; the sender block uses the sales owner's own name, phone and email, never a config value.
- Submit is allowed to the version creator and to every approver role (salesManager, director, admin), not only SalesManager.
- Approval is four-eyes on the content too: approve or reject → 403 when the actor created the version or made its last price/terms edit (pricing PATCH or estimate refresh).
- Closing a request from the request page (`cancel` or `lost`) while its quotation is open (`draft|pending_approval|approved|rejected`) cancels the current version in the same transaction with the same reason, through a synchronous request-close hook the quotation feature registers (like the CRM owner-change hook); a `customer_confirmed` quotation blocks the close with 409.

## Coverage
- CP-10

## Ownership
- Create: `backend/src/plugins/sales/quotation/services/{quotation-approval,quotation-feedback,quotation-pdf}.service.ts` + specs, matching controller routes, `frontend/src/plugins/sales/quotation/components/approval/`, `feedback/`
- Modify: `backend/src/plugins/sales/quotation/quotation.controller.ts`, `quotation.module.ts`, shared registration files listed in plan.md; for the request-close hook `backend/src/plugins/sales/_shared/` and `backend/src/plugins/sales/request/services/request.service.ts`
- Read: `REF/backend/src/plugins/sales/quotation/services/quotation-approval.service.ts`

## Steps
1. Approval service with SoD check and row lock.
2. Feedback entity/migration + service.
3. Confirm/cancel transitions + request status port.
4. Excel + PDF render (BG layout) for approved versions only; spec: the generated xlsx has the header row `STT | MÔ TẢ | MÃ HÀNG | HÃNG SẢN XUẤT | ĐV TÍNH | SỐ LƯỢNG | Đơn giá (VNĐ) | Thành tiền (VNĐ)`, one Roman-numbered row per panel, and the VAT/total rows matching the version totals.
5. Frontend approval panel, feedback log, confirm/cancel actions, Excel and PDF download buttons.
6. Specs: submit moves `draft → pending_approval` and notifies approvers once; approve a `draft` → 409; creator approves own version → 403; `sales` approves → 403; confirm `pending_approval` → 409; reject → version `rejected`, revise from it succeeds; approve sets request `quoted`; PDF of non-approved → 409; revise and confirm on the same approved version via `Promise.all` on real DB → exactly one succeeds and the version is not both `closed` and `customer_confirmed`.

## Acceptance
- AC-11 (revise–confirm race), AC-12.

## Dependencies
- task-09-quotation-pricing-versions.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/sales/quotation/services/quotation-approval.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation src/plugins/sales/request && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/quotation/tests/approval-panel.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation src/plugins/sales/request"`
- Command changed (user, 2026-10-25): the earlier Command equalled task-09's and exited 0 before any task-10 change; the named probes are now required and the request feature runs too, since the request-close hook changes `request.service.ts`.
- Named probe: `src/plugins/sales/quotation/services/quotation-approval.service.spec.ts`, `src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts`, `src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts`, frontend `src/plugins/sales/quotation/tests/approval-panel.test.tsx`
- Reachability: known after task-02.
- Oracle: exit 0; status codes as listed.
- Counterexample: removing the creator check must fail the self-approval spec.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/sales/quotation/services/quotation-approval.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation src/plugins/sales/request && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/quotation/tests/approval-panel.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation src/plugins/sales/request"
Exit: 0
Base: 39ef5c8be7381002cc516d033aa8f4e4aac8d00b
Head: 9ab6f7522f8ca1c95107b5a0ae3769939444ca09048a7806e1429402f2901270
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/sales/quotation/services/quotation-approval.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts && test -f src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts && npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation src/plugins/sales/request && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/quotation/tests/approval-panel.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation src/plugins/sales/request"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/sales/quotation/services/quotation-pdf.service.spec.ts (16.071 s)
PASS src/plugins/sales/quotation/services/quotation-approval.service.spec.ts (16.925 s)
PASS src/plugins/sales/quotation/services/quotation-feedback.service.spec.ts
PASS src/plugins/sales/quotation/quotation.controller.spec.ts (21.107 s)
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts (5.984 s)
PASS src/plugins/sales/request/services/request-owner-race.spec.ts
PASS src/plugins/sales/quotation/services/quotation-code.spec.ts
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-pdf.render.spec.ts
PASS src/plugins/sales/quotation/services/quotation-pricing.spec.ts
PASS src/plugins/sales/quotation/config/quotation-letterhead.config.spec.ts
PASS src/plugins/sales/quotation/utils/quotation-document.util.spec.ts
PASS src/plugins/sales/request/services/request.service.spec.ts
PASS src/plugins/sales/request/request.controller.spec.ts (11.784 s)
Test Suites: 14 passed, 14 total
Tests:       323 passed, 323 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (26 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/sales/quotation/tests/approval-panel.test.tsx (36 tests) 1228ms
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (3 tests) 423ms
 ✓ src/plugins/sales/quotation/tests/quotation-editor.test.tsx (13 tests) 1936ms
 ✓ src/plugins/sales/quotation/tests/quotation-feedback-log.test.tsx (4 tests) 453ms
 ✓ src/plugins/sales/quotation/tests/quotation-terms-editor.test.tsx (5 tests) 620ms
 ✓ src/plugins/sales/request/tests/request-list.test.tsx (5 tests) 762ms
 ✓ src/plugins/sales/quotation/tests/request-quotation-section.test.tsx (5 tests) 441ms
 ✓ src/plugins/sales/quotation/tests/quotation-pricing.test.ts (16 tests) 34ms
 ✓ src/plugins/sales/request/tests/request-attachments.test.tsx (20 tests) 467ms
 ✓ src/plugins/sales/request/tests/request-detail.test.tsx (4 tests) 879ms
 Test Files  10 passed (10)
      Tests  111 passed (111)
Exit: 0
```
No test in the run above was skipped: the real-Postgres revise–confirm race, the request-close races and the feedback-vs-approve/close specs executed. Pre-change runs: the original Command (equal to task-09's) exited 0 before any change, so it was replaced by user decision; the new Command exited 1 before implementation (probe files missing). Extra evidence (same Head, not the canonical command): full backend jest 93 suites / 1232 passed; full frontend 139 files passed, 1 skipped / 1157 passed, 6 skipped (permission-labels needs `../backend`); counterexample: removing the creator check failed the self-approval spec (implementer, restored). Live smoke after migrate + seed + `docker compose restart backend`, 70 checks all PASS (statuses only): 5 default terms copied, draft export 409, approve draft 409, sales approve 403, terms edit 200 in draft / 409 after submit, sales_b submit 404, submit → pending_approval with exactly 1 approver notification, confirm pending 409, reject without reason 400, reject → rejected, revise from rejected copies terms, approve → approved and request `quoted`, sales owner notified once; export .xlsx 200 (spreadsheetml, `PK`, file `01-25102026-BG.xlsx`) and .pdf 200 (`%PDF-`), sales_b export 404; feedback add 201, bad date 400, list 1, sales_b 404; confirm → customer_confirmed, then request lost 409 and quotation cancel 409; cancelling another request cancels its draft quotation with the same reason; stale draft flagged, submit 409, refresh 200 (2 panels), submit 200; four-eyes: manager edits VAT, sales submits, manager approve 403 and reject 403, director approve 200. Cleanup: the 4 smoke requests with their quotations, estimates (children by cascade) and 16 notifications removed by targeted SQL, plus 4 notifications orphaned by the task-09 smoke (requests already gone); item and customer deleted through the API; sales tables and sales notifications verified 0. Review (code-auditor): round 1 PASS_WITH_WARNINGS (Medium: feedback insert took the header before the request — deadlock risk; Lows) + user decisions (submit open to creator and every approver role; four-eyes also excludes the last price/terms editor) → feedback locks request then header with real-DB concurrency specs, `last_edited_by` with specs and UI gating, Submit button gated, refresh discount message, measured PDF row heights with a page-bottom spec, greeting from config → re-review PASS (3 Low); controller switched the second approver in two specs from engineeringLead to director. Known limitations: the feedback deadlock specs are timing-dependent and no negative control was run against the old lock order; the greeting prints the config company name in capitals ("CÔNG TY TNHH KỸ THUẬT TRÍ VINH trân trọng cảm ơn…"), unlike the sentence case of `docs/BG.xlsx`; the migration backfills default terms onto earlier versions, so re-exporting them prints the default terms; the Excel file was checked only by reading it back with exceljs, not opened in Excel; the PDF was checked visually once by the implementer from a rendered image; no browser walkthrough of the UI.
