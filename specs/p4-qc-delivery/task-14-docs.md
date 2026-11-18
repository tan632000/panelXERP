# Task 14 — Docs: flow guide, role matrix, roadmap

Status: pending

## Outcome
`docs/permission/role-matrix.md` lists `qcInspector` and every P4 permission row exactly as the seed grants them, and the doc spec now fails if either is missing; `docs/user-flow-guide.md` describes the P4 flow by role with "Dự án" wording; the roadmap P4 row links this packet.

## Scope
- In:
  - (R-14) `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts`: `REQUIRED_ROWS` (`:10-14`) gains every P4 scope (`qc_checklist:read|manage`, `qc_inspection:read|create|fix|verify`, `delivery_note:read|create|ship|receive|cancel`, `installation:read|manage`, `acceptance:read|create`); a new case asserts the parsed role header contains `qcInspector`.
  - `role-matrix.md`: demo account row `qcInspector | QC Inspector | qc_a | qc.a@example.com | qcLab | material` (section 1, after `technician_b`, `:27`); section 2 `material` row names QC, delivery and installation; section 3 table regenerated with `seededRoleCodes()`, `seededRolePermissions()` and `holds()` (as `:153-155` prescribes), adding the `qcInspector` column and the P4 rows; section 4 notes: qcInspector without `order:read` and prices; productionManager fixes defects and another user verifies ((user, Q8)); storekeeper delivers, installs and reads acceptance; sales accepts own orders, salesManager any ((user, Q7)); update date `:3`.
  - `user-flow-guide.md`: scope line `:5` (P4 done; P5–P6 not); overview chain (section 1, `:9-37`) gains QC → Phiếu giao → Lắp đặt → Nghiệm thu and document code `PGH_2026_0001`; demo table (`:44-56`) gains "QC (qcInspector) | `qc_a` | Tủ chờ QC, checklist (không thấy giá)"; order statuses `:168` become "Đang mở → Đang sản xuất → Đã giao → Hoàn thành" with the D-09 triggers; workshop returns also for Đã giao / Hoàn thành ((user, Q9)); new section "6. QC và giao hàng" after section 5 (6.1 Mẫu checklist — QL sản xuất; 6.2 Kiểm tra QC theo tủ và xử lý lỗi — QC, QL sản xuất; 6.3 Phiếu giao hàng từng đợt — Thủ kho; 6.4 Lắp đặt tại dự án — Thủ kho; 6.5 Biên bản nghiệm thu — Sales phụ trách), renumbering later sections; the end-to-end scenario (`:312-332`) and "Những gì chưa có" (`:334`) updated.
  - `development-roadmap.md:23`: P4 row status "Đang làm — [specs/p4-qc-delivery](../specs/p4-qc-delivery/plan.md)"; "Hoàn thành (GATE-DONE <date>)" is written only after the user's GATE-DONE.
- Out: other docs; code.

## Coverage
- CP-14

## Ownership
- Modify: `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts`, `docs/permission/role-matrix.md`, `docs/user-flow-guide.md`, `docs/development-roadmap.md`
- Read: `specs/director-and-price-access/task-11-docs.md` (pattern)

## Steps
1. Extend the spec; it fails on today's doc (no P4 rows, no `qcInspector` column).
2. Regenerate the section-3 table and the other role-matrix sections; the spec passes.
3. Guide and roadmap edits.

## Acceptance
- AC-15.

## Dependencies
- task-13-delivery-chain-e2e.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npx jest --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "qcInspector" docs/permission/role-matrix.md && grep -n "PGH_" docs/user-flow-guide.md && grep -n "tại dự án" docs/user-flow-guide.md && grep -n "specs/p4-qc-delivery" docs/development-roadmap.md && ! grep -n -i "công trình" docs/user-flow-guide.md`
- Named probe: `role-matrix-doc.spec.ts` (P4 rows required, `qcInspector` column required, cell-by-cell match against `holds()`); the four greps and the negated grep.
- Reachability: known (director-and-price-access task-11 receipt: the spec reads the doc through the backend container mount, else `../docs/permission`).
- Oracle: exit 0; 0 mismatched cells; each grep prints at least one line; no "công trình" in the guide.
- Counterexample: deleting the `delivery_note:create` row or the `qcInspector` column must fail the spec; a hand-edited ✅ for `delivery_note:create` under `productionManager` must fail it too.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
