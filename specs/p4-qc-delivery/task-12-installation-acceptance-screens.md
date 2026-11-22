# Task 12 — Installation and acceptance screens

Status: done

## Outcome
On an order's delivery page a storekeeper creates and advances the installation ("Lắp đặt tại dự án") with photos, and the order's sales owner (or salesManager/director) uploads the signed acceptance minutes ("Biên bản nghiệm thu") once the order is delivered and any installation is done; "QC & Giao hàng › Lắp đặt" lists installations.

## Scope
- In: frontend features `installation` and `acceptance` in `frontend/src/plugins/delivery/`: installation section on `/delivery/orders/[orderId]` (empty state with "Tạo lắp đặt" for `installation:manage` while the order is `in_production|delivered`; form with "Địa chỉ dự án" prefilled from the order data, planned date, person in charge (free text), note; "Bắt đầu lắp đặt", "Hoàn tất lắp đặt"; photo gallery and upload, up to 30); list `/delivery/installations` (status filter; columns đơn hàng, khách hàng, dự án, ngày dự kiến, phụ trách, trạng thái); acceptance section on the same page (read-only view of representative, signed date and downloadable files for `acceptance:read`; "Tải biên bản nghiệm thu" dialog for `acceptance:create` only when the order is `delivered` and the installation, if any, is `done`; otherwise a hint naming what is missing; files PDF/JPG/PNG 1–10, representative name, signed date). Status labels vi: Đã lên kế hoạch, Đang lắp đặt, Đã hoàn tất. Sidebar item "Lắp đặt" (`installation:read`) last in the section. No cancel buttons ((user, Q5)).
- Out: backend (tasks 10, 11).

## Coverage
- CP-12

## Ownership
- Create: `frontend/src/plugins/delivery/installation/**` (feature, components, hooks, services, types, tests `installation-section.test.tsx`), `frontend/src/plugins/delivery/acceptance/**` (components, hooks, services, types, tests `acceptance-section.test.tsx`), `frontend/src/app/[locale]/delivery/installations/page.tsx`
- Modify: `frontend/src/plugins/delivery/delivery.features.ts`, `frontend/src/plugins/delivery/delivery-note/components/OrderDeliveryPage.tsx` (mounts both sections, each gated by its permission and feature), `frontend/src/kernel/langs/{vi,en}/delivery.json`
- Read: `frontend/src/plugins/production/progress/` (photo upload and thumbnails)

## Steps
1. Installation section → `installation-section.test.tsx`: create form prefilled with the address from the order data; "Bắt đầu" only on `planned`, "Hoàn tất" only on `in_progress`, none without `installation:manage`; a 409 shows the server message.
2. Acceptance section → `acceptance-section.test.tsx`: upload button hidden on `in_production`, hidden on `delivered` with installation `in_progress` (hint shown), shown on `delivered` without installation for `acceptance:create`; submit disabled without a file, representative or date, and with more than 10 files; after 201 the order status badge reads "Hoàn thành"; storekeeper sees the minutes read-only.
3. List page and sidebar item.

## Acceptance
- AC-13 (storekeeper installation steps; sales acceptance step).

## Dependencies
- task-11-acceptance-backend.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "test -f src/plugins/delivery/installation/tests/installation-section.test.tsx && test -f src/plugins/delivery/acceptance/tests/acceptance-section.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts"`
- Named probe: `installation-section.test.tsx`, `acceptance-section.test.tsx`, `order-delivery-page.test.tsx` (still green with both sections mounted)
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: showing the acceptance upload while the installation is `in_progress` must fail the hint case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "test -f src/plugins/delivery/installation/tests/installation-section.test.tsx && test -f src/plugins/delivery/acceptance/tests/acceptance-section.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts"
Exit: 0
Base: 6c4524c5b6d30629aa1d29f47b13b9eb385dc511
Head: 34873bf84822ed4da861d2485fc85a5828d096937d88384679cab795522e6dd5
```text
$ docker compose exec -T frontend sh -c "test -f ...installation-section.test.tsx && test -f ...acceptance-section.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts"
> eslint . --max-warnings=0 && npm run lint:i18n
 Test Files  1 passed (1)
      Tests  7 passed (7)
> tsc --noEmit
 ✓ src/plugins/delivery/installation/tests/installation-section.test.tsx (8 tests)
 ✓ src/plugins/delivery/acceptance/tests/acceptance-section.test.tsx (8 tests)
 ✓ src/plugins/delivery/delivery-note/tests/order-delivery-page.test.tsx (3 tests)
 ✓ src/plugins/delivery/delivery-note/tests/delivery-note-create.test.tsx (4 tests)
 ✓ src/plugins/delivery/delivery-note/tests/delivery-note-detail.test.tsx (11 tests)
 ✓ src/kernel/core/tests/landing-path.test.ts (7 tests)
 Test Files  10 passed (10)
      Tests  72 passed (72)
FINAL_EXIT=0
```
Skipped: none reported in the log. Extra check outside the Command (platform navigation, because new routes were added): `npx vitest run src/kernel/platform/tests` passed, 12 files / 263 tests, exit 0, including `route-navigation-coverage.test.ts` and `app-navigation.test.ts`. Counterexample (run once against a temporary mutation of `acceptance/components/AcceptanceSection.tsx`, reverted afterwards; SHA-256 `5b24e80c34ffa5d4…` identical before and after): replacing the "installation not done" branch condition with `false`, so the upload button shows while the installation is `in_progress`, failed `acceptance-section.test.tsx` "is hidden on a delivered order whose installation is in progress, with a hint" (1 failed, 7 passed).
Review: first code-auditor run PASS_WITH_WARNINGS (status CONCERNS): one Medium, the installation 409 toast showed the server's English message, against the kernel convention that server wording is never shown. Step 1 of the task reads "a 409 shows the server message"; the user was asked and decided to follow the convention (explicit decision), so this is a deliberate deviation from the task text. One repair round: `useInstallationFeedback` now answers every 409 with the localized `installationConflict`, the unused imports were removed, and the test asserts `viDelivery.toast.installationConflict` instead of the English text; the whole Command was run again and a narrow code-auditor re-review returned PASS (0 critical/high/medium). Low, left as is: the en sentence "The installation or the order changed status, reloaded" reads terse; the photo picker stays visible to `installation:manage` on a `completed` or `cancelled` order, where the server refuses with a 409 (shown as the localized sentence); the installation section offers "Tạo lắp đặt" when its query fails; the installation is read with two requests (list by `orderId`, then detail); the acceptance file check repeats two lines of the delivery-note receive dialog's extension check; acceptance has no frontend feature entry (no route or menu), its section is gated by `acceptance:read`. Seeded roles that can upload acceptance minutes (sales, salesManager, director) also hold `installation:read`, so the "installation not done" hint works for them.
Deviations from Ownership: implementation delegated to the implementer agent and verified independently by the controller (pre-change run by the controller: the `test -f` check failed, exit 1). The 409 deviation above. Not verified: no live UI walkthrough.
Docs impact: none yet (user-facing docs are task-14).
