# Task 12 — Installation and acceptance screens

Status: pending

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
