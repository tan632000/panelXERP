# Task 03 — Estimate status shows one final badge

Status: done

## Outcome
The estimate status badge in the list table, the estimate detail page and the request's estimate section is one badge: Nháp, Chờ điền giá, Đã điền giá, Đã thay thế, or (an older still-submitted revision) Đã gửi.

## Scope
- In: `EstimateStatusBadge` takes an optional pricing timestamp and derives the label; the second pricing badge is removed from the detail page and the request's estimate section; pricing labels apply only to the latest revision.
- Out: the list status filter and the revision tab labels keep "Đã gửi" (`EstimateListPage.tsx:103-106`, `EstimateDetailPage.tsx:257`) — "Đã gửi" covers both awaiting and priced; vi/en bundles (keys `pricing.awaiting`/`pricing.priced` already exist).

## Coverage
- CP-03

## Ownership
- Modify: `frontend/src/plugins/sales/estimate/components/EstimateStatusBadge.tsx`, `EstimateTable.tsx`, `EstimateDetailPage.tsx`, `RequestEstimateSection.tsx`
- Modify: `frontend/src/plugins/sales/estimate/tests/request-estimate-section.test.tsx`
- Create: `frontend/src/plugins/sales/estimate/tests/estimate-status-badge.test.tsx`

## Steps
1. Badge prop `pricedAt?: string | null` (undefined = no pricing info): `submitted` + `pricedAt === null` → `pricing.awaiting` tone `pending`; `submitted` + string → `pricing.priced` tone `completed`; otherwise `statuses.<status>`.
2. Detail page: remove the extra `StatusBadge` (`EstimateDetailPage.tsx:212-219`); pass `revision.pricedAt` only when the viewed revision is the latest (`isLatest`), else nothing → an older still-`submitted` revision reads "Đã gửi".
3. Request section: remove `RequestEstimateSection.tsx:85-95`; pass `estimate.latestPricedAt ?? null` to the badge at `:80`.
4. `EstimateTable.tsx:76` passes `estimate.latestPricedAt ?? null`.
5. Tests: badge test covers draft, submitted+null, submitted+date, superseded, submitted+undefined; request-section test asserts exactly one badge for draft, awaiting and priced.

## Acceptance
- AC-03: both test files pass.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"`
- Named probe: `estimate-status-badge.test.tsx`, `request-estimate-section.test.tsx`
- Reachability: frontend container
- Oracle: exit 0; exactly one badge per state
- Counterexample: "Đã gửi" and "Chờ điền giá" both rendered, or an older submitted revision labelled "Chờ điền giá" → test fails
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/plugins/sales/estimate/tests/estimate-status-badge.test.tsx (5 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-totals.test.ts (4 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx (5 tests)
 ✓ src/plugins/sales/estimate/tests/request-estimate-section.test.tsx (12 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-pricing.test.tsx (12 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-editor.test.tsx (23 tests)
 Test Files  6 passed (6)
      Tests  61 passed (61)
EXIT=0
```

Final-Head rerun: the Command above was rerun on the final tree after every task in this packet was implemented; the output block is from that run.
