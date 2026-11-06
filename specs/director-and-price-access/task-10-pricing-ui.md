# Task 10 — Pricing UI

Status: done

## Outcome
On a submitted, unpriced revision an `estimate:price` holder edits BOM unit costs (prefilled with the reference price), manages cost lines and completes the pricing; every reader sees whether the estimate awaits pricing; a quotation attempt on an unpriced estimate shows a clear message.

## Scope
- In:
  - `types.ts`, `services/estimate.service.ts`, `hooks/api/useEstimate.ts`: `pricedAt`/`pricedBy` on revisions; calls for `PATCH :id/bom-lines/:lineId/unit-cost`, the cost-line routes and `POST :id/price` (task-07); draft BOM calls stop sending `unitCost` (`types.ts:110`).
  - `EstimateDetailPage.tsx:119-136`: pricing mode = `can(EstimatePermission.price)` && revision `submitted` && latest && `pricedAt == null` && request `estimated`; a status chip "Chờ điền giá" / "Đã điền giá"; a "Hoàn tất giá" action with confirm; the 400 naming zero-cost items is shown.
  - Pricing mode reaches the inputs (R-07): `EstimateEditor.tsx:31-36` passes a single `editable` prop to the grid and cost lines, so add a separate `pricing` prop; `useEstimateEditor.ts:55-59` commits every BOM field through `edits.updateBomLine` (the draft `PATCH /bom-lines/:id`, a 400 for `unitCost` after task-07), so in pricing mode a `unitCost` commit calls a new `setUnitCost` mutation and cost-line commits call the pricing cost-line mutations; `constants.ts:39-51` `estimateApiRoutes` gains `unitCost(id, lineId)` and `price(id)`.
  - `EstimateBomGrid.tsx`, `EstimateCostLines.tsx`: in pricing mode the unit cost input and the cost-line editor (moved from the draft) are live; elsewhere read-only.
  - `RequestEstimateSection.tsx`: the pricing status beside the revision, from the list item's `latestPricedAt` (task-07; the section reads `findAll`, `useEstimate.ts:51-58`).
  - `map-quotation-api-errors.ts:24`: the `noEstimate` matcher also matches `no priced estimate`; its vi/en text says the estimate is not priced yet.
  - `estimate.json` vi/en: labels for the chip, action, confirm and zero-cost error.
- Out: re-opening a priced revision.

## Coverage
- CP-09

## Ownership
- Modify: `frontend/src/plugins/sales/estimate/types.ts`, `constants.ts`, `services/estimate.service.ts`, `hooks/api/useEstimate.ts`, `hooks/useEstimateEditor.ts`, `components/EstimateEditor.tsx`, `components/EstimateDetailPage.tsx`, `components/EstimateBomGrid.tsx`, `components/EstimateCostLines.tsx`, `components/RequestEstimateSection.tsx`, `frontend/src/plugins/sales/quotation/utils/map-quotation-api-errors.ts`, `frontend/src/kernel/langs/{vi,en}/estimate.json`, quotation vi/en message files holding `noEstimate`
- Modify (added by the user on 2026-11-06 during execution): `frontend/src/plugins/sales/estimate/utils/estimate-drafts.ts` — only `DraftField` gaining the BOM `unitCost` field and `panelFigures` overlaying the typed unit cost, so the panel and estimate totals follow the price being typed in pricing mode.
- Create: `frontend/src/plugins/sales/estimate/tests/estimate-pricing.test.tsx`, `frontend/src/plugins/sales/quotation/tests/map-quotation-api-errors.test.ts`

## Steps
1. Test: sales user, revision submitted and unpriced → unit cost inputs and the complete action; typing a cost and leaving the field sends `PATCH …/unit-cost` with the number; complete sends `POST …/price`; a 400 shows the item codes.
2. Test: the same revision priced, or an engineer, or a draft → no inputs, chip shown.
3. `map-quotation-api-errors.test.ts` (R-14 d; no mapper test exists today): `The request has no priced estimate to quote.` resolves to `noEstimate`, and so does the old `no submitted estimate` text.
4. Implement; then the live walk below.

## Acceptance
- AC-14.

## Dependencies
- task-07-pricing-step-backend.md
- task-09-estimate-ui-no-prices.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate src/plugins/sales/quotation"`
- Named probe: `estimate-pricing.test.tsx` (pricing mode, `setUnitCost` call rather than `updateBomLine`, read-only cases, error), `map-quotation-api-errors.test.ts`.
- Reachability: known for source. Live: the dev DB already holds the new grants (re-seeded in task-07, R-08). After restarting the frontend and backend containers (Docker watch does not reload on this host), `engineer_a` submits an estimate without prices, `sales_a` prices and completes it, then creates the quotation; the data is kept.
- Oracle: exit 0; in the live walk the engineer never sees a price and the quotation is refused before completion and created after.
- Counterexample: showing inputs on a priced revision must fail Step 2; committing a pricing-mode unit cost through `updateBomLine` must fail Step 1; a mapper matching only `no submitted estimate` must fail Step 3; sending `unitCost` on a draft BOM call must make the backend answer 400 in the live walk.
- Artifacts: live demo data kept.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate src/plugins/sales/quotation"
Exit: 0
Base: 10591c9087f4f7ee49fd7b1dbcee5f7835621906
Head: 869919dd3cf7a55c20365d894abde46cd30baf5164d7d8a2a047f6497297856e
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate src/plugins/sales/quotation"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/sales/estimate/tests/request-estimate-section.test.tsx (10 tests) 417ms
 ✓ src/plugins/sales/estimate/tests/estimate-pricing.test.tsx (12 tests) 2803ms
 ✓ src/plugins/sales/estimate/tests/estimate-editor.test.tsx (23 tests) 3760ms
 ✓ src/plugins/sales/quotation/tests/map-quotation-api-errors.test.ts (2 tests) 25ms
 Test Files  12 passed (12)
      Tests  138 passed (138)
VERIFY_EXIT=0
```

This run started after the last edit; 0 skipped; on the host the Command was wrapped in `timeout 900`; ANSI colour codes were stripped from the output above. Named probes: `estimate-pricing.test.tsx` (12 cases: pricing mode shows unit cost inputs, editable cost lines, "Hoàn tất giá" and the "Chờ điền giá" chip; a typed unit cost goes to `PATCH /sales/estimates/7/bom-lines/12/unit-cost` with the number and never to the draft `bom-lines/12` route; a cost-line amount typed as `1000,5` saves a whole number and the PATCH is asserted to have been called; adding a cost line posts to the panel route; completion posts `/price` only after the confirmation; a 400 names the items without a cost; read-only with the chip for a priced revision ("Đã điền giá") and for an engineer; read-only without a chip on a draft; no pricing once the request moved on or on an older revision; a draft quantity edit sends only `{ quantity }`), `map-quotation-api-errors.test.ts` (`no priced estimate` and the old `no submitted estimate` both resolve to `noEstimate`). No pre-existing assertion changed; the task-09 read-only draft cost-line case still passes.

Pre-change run (tests first): exit 2; lint passed, typecheck failed on the i18n keys the new tests reference; vitest alone failed only the 12 new cases. Counterexamples (each restored, `cmp` equal): inputs on a priced revision, pricing without the `estimated` request check, without `isLatest`, a chip gated on the price scope, a pricing unit cost committed through `updateBomLine`, a draft BOM edit sending `unitCost`, completion not posting `/price`, cost lines left read-only in pricing mode, a mapper matching only `no submitted estimate`, and dropping the item codes from the 400 are each caught.

Ownership extended by the user on 2026-11-06 to `utils/estimate-drafts.ts` (`DraftField` BOM `unitCost`, `panelFigures` overlay); both already matched the working tree, so its only diff is task-09's.

Live walk (after `docker compose restart backend frontend`, health 200, `/login` 200; real browser as sales_a, engineer_a, the director): sales_a created KH_0002 and YC_2026_0002 "Demo định giá 2026-11-06 - Tủ MSB nhà xưởng" and assigned it to engineer_a; engineer_a built DT_2026_0002 (panel MSB-01 ×2, three BOM items) with no `₫`, money column, unit cost input or cost section on screen, and a draft `PATCH` carrying `unitCost` answered 400; after "Gửi dự toán" the engineer saw "Chờ điền giá" and still no money; sales_a saw the chip on the request, "Tạo báo giá" answered 409 with the toast "Dự toán của yêu cầu này chưa được điền giá nên chưa thể báo giá."; in pricing mode sales_a set unit costs (prefilled with reference prices) and a labour cost line; "Hoàn tất giá" with a zero-cost line showed "… còn thiếu giá: ST5ab562ab-1."; after pricing it, completion turned the chip to "Đã điền giá" and the inputs read-only (total 21.980.000 ₫, recomputed by hand); the quotation 01-06112026/BG v1 was then created from the priced costs; the engineer still saw no money after pricing; the director saw the figures read-only. DB (read by the controller): revision 24530 `submitted`, `priced_at` set, `priced_by` sales_a; quotation 23484 `01-06112026/BG`; request YC_2026_0002 `estimated`. Demo data kept: customer 14208, request 24027, estimate 24574, BOM lines 16544-16546, cost line 9, quotation 23484. Screenshots in the session scratchpad `dpa/live/`.

Review (code-auditor): PASS. Open Lows: a 409 from a pricing route ("only a submitted revision can be priced") shows the generic error toast and does not refetch (the estimate error mapper is outside this task); after completion a second confirm can still be opened until the refetch lands (it answers 409); the request-section chip has no automated test (seen in the live walk); `quotation.toast.noEstimate` says "not priced yet" also when no estimate was submitted; a draft shows no chip, read as intended though Step 2 lists the draft beside "chip shown". Live notes: the quotation refusal toast lasts about 3 s; sales still read the hint "Dùng 'Lập bản mới' để chỉnh" after completion although only engineering revises; the only items without a reference price are leftover spec items (`ST5ab562ab-1`, `-2`).
