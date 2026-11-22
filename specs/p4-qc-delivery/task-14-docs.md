# Task 14 — Docs: flow guide, role matrix, roadmap

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npx jest --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "qcInspector" docs/permission/role-matrix.md && grep -n "PGH_" docs/user-flow-guide.md && grep -n "tại dự án" docs/user-flow-guide.md && grep -n "specs/p4-qc-delivery" docs/development-roadmap.md && ! grep -n -i "công trình" docs/user-flow-guide.md
Exit: 0
Base: d475a359e3094fdd7d1b0cbc57ccec3829112e35
Head: b9ddcbd6c9b9f72fac346f447468f87a566c5d5449dbb27349f5e5666325da2e
```text
$ docker compose exec -T backend sh -c "npm run lint && npx jest --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "qcInspector" docs/permission/role-matrix.md && grep -n "PGH_" docs/user-flow-guide.md && grep -n "tại dự án" docs/user-flow-guide.md && grep -n "specs/p4-qc-delivery" docs/development-roadmap.md && ! grep -n -i "công trình" docs/user-flow-guide.md
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
docs/permission/role-matrix.md: 28, 41, 48, 167 (qcInspector)
docs/user-flow-guide.md: 37, 336, 398 (PGH_)
docs/user-flow-guide.md: 3, 344, 346 (tại dự án)
docs/development-roadmap.md: 23 (specs/p4-qc-delivery)
(no "công trình" in docs/user-flow-guide.md)
FINAL_EXIT=0
```
Skipped: none reported in the log. Before the docs were edited, the extended spec failed on the old docs (implementer's run: 16 of 21 tests failed); the controller's pre-change greps also found 0 matches for `qcInspector` and `PGH_`. Counterexamples (each run once against a temporary edit of `docs/permission/role-matrix.md`, reverted afterwards; file SHA-256 `ee391b41c78f6400…` identical before and after): (1) deleting the `delivery_note:create` row failed "role matrix document › has a row for delivery_note:create" (1 failed, 20 passed); (2) deleting the `qcInspector` column failed "has a column for qcInspector" (1 failed, 20 passed); (3) a hand-edited ✅ for `delivery_note:create` under `productionManager` failed "matches holds() over the seeded roles in every cell" (1 failed, 20 passed).
Review: first code-auditor run PASS_WITH_WARNINGS (one Medium: the guide said the delivery address is editable while a note is a draft and the installation address until it is done, but the UI has no edit step after creation). One repair round: section 6.3 and 6.4 now say the address is edited in the create form or dialog and cannot be edited afterwards, and section 9 lists that as missing; the whole Command was run again and a narrow code-auditor re-review returned PASS (0 critical/high/medium). Low, left as is: `frontend/src/kernel/langs/vi/delivery.json` key `installation.description` still says "tại công trình" (outside Ownership; a one-string follow-up); the guide's "10 hạng mục" checklist figure is the initial seed; section 6.3 names the project address as the prefill without the customer-address fallback that 6.4 mentions. The auditor also spot-checked the guide's button labels, statuses, file limits, date rules, notice wording and role grants against the lang files, services and seed, and found them consistent; the role-matrix section 3 matches the seed cell by cell (checked by the spec).
Deviations: implementation delegated to the implementer agent and verified independently by the controller. The roadmap P4 row text "lắp đặt công trình" was changed to "lắp đặt tại dự án" (an owned file, beyond the literal task text, to follow the "Dự án" wording). The roadmap row says "Đang làm" and links the packet; "Hoàn thành (GATE-DONE <date>)" is not written and is left to the user's GATE-DONE. Not verified: the guide was not walked against the live UI.
Docs impact: this task is the docs update itself (role matrix, user flow guide, roadmap row).
