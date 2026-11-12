# Task 01 — vi UI says "Dự án" and "Đã lên đơn hàng"

Status: done

## Outcome
Every Vietnamese label that said "Công trình/công trình" says "Dự án/dự án", and the `won` request status reads "Đã lên đơn hàng".

## Scope
- In: vi bundle values only; the matching words in `docs/user-flow-guide.md` (lines 26, 83, 89, 91, 97, 105, 157, 317 at planning time).
- Out: keys, code identifiers, English bundles, the `DA_` code prefix.

## Coverage
- CP-01

## Ownership
- Modify: `frontend/src/kernel/langs/vi/crm.json`, `order.json`, `permission.json`, `project.json`, `request.json`, `status.json`
- Modify: `docs/user-flow-guide.md`

## Steps
1. Replace "Công trình" → "Dự án" and "công trình" → "dự án" in the five vi bundles.
2. `request.json` `statuses.won` → "Đã lên đơn hàng"; `status.json` `won` → "Đã lên đơn hàng".
3. In `docs/user-flow-guide.md` replace the same words and "Thắng thầu" → "Đã lên đơn hàng"; the file carries uncommitted edits from `specs/director-and-price-access/task-11-docs.md` — keep them (compare `git diff docs/user-flow-guide.md` before and after: only the renamed words differ).

## Acceptance
- AC-01: both greps report no match (exit 1); lint and request/order/crm tests pass.

## Dependencies
- none

## Verification Plan
- Command: `grep -rniE 'công trình|thắng thầu' docs/user-flow-guide.md frontend/src/kernel/langs/vi; test $? -eq 1 && grep -q '"won": "Đã lên đơn hàng"' frontend/src/kernel/langs/vi/status.json && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request src/plugins/sales/order src/plugins/crm"`
- Named probe: host grep with exit-1 check (no match; grep errors exit 2 and fail); `scripts/check-i18n-enum-conformance.mjs` via `npm run lint`
- Reachability: host shell at repo root (docs are not mounted in the frontend container, `compose.yml:142`); frontend container
- Oracle: exit 0
- Counterexample: one bundle or doc line missed → grep exit 0 → command fails
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: grep -rniE 'công trình|thắng thầu' docs/user-flow-guide.md frontend/src/kernel/langs/vi; test $? -eq 1 && grep -q '"won": "Đã lên đơn hàng"' frontend/src/kernel/langs/vi/status.json && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request src/plugins/sales/order src/plugins/crm"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ grep -rniE 'công trình|thắng thầu' docs/user-flow-guide.md frontend/src/kernel/langs/vi; test $? -eq 1 && grep -q '"won": "Đã lên đơn hàng"' frontend/src/kernel/langs/vi/status.json && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/request src/plugins/sales/order src/plugins/crm"
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (8 tests)
 ✓ src/plugins/sales/order/tests/order-detail.test.tsx (10 tests)
 ✓ src/plugins/crm/customer/tests/customer-list.test.tsx (5 tests)
 ✓ src/plugins/sales/request/tests/request-detail.test.tsx (5 tests)
 ✓ src/plugins/crm/project/tests/project-list.test.tsx (5 tests)
 ✓ src/plugins/crm/contact/tests/contact-section.test.tsx (5 tests)
 ✓ src/plugins/sales/request/tests/request-attachments.test.tsx (20 tests)
 ✓ src/plugins/crm/project/tests/project-form-modal.test.tsx (1 test)
 ✓ src/plugins/crm/project/tests/project-form.test.tsx (3 tests)
 ✓ src/plugins/sales/order/tests/order-notification.test.ts (3 tests)
 ✓ src/plugins/sales/request/tests/request-list.test.tsx (5 tests)
 ✓ src/plugins/crm/customer/tests/customer-form-owner.test.tsx (2 tests)
 ✓ src/plugins/crm/customer/tests/map-customer-api-errors.test.ts (4 tests)
 ✓ src/plugins/sales/order/tests/map-order-api-errors.test.ts (2 tests)
 ✓ src/plugins/sales/request/tests/map-request-api-errors.test.ts (2 tests)
 ✓ src/plugins/sales/order/tests/quotation-order-section.test.tsx (7 tests)
 Test Files  16 passed (16)
      Tests  87 passed (87)
EXIT=0
```

Final-Head rerun: the Command above was rerun on the final tree after every task in this packet was implemented; the output block is from that run.
