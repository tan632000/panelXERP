# Task 11 — Docs

Status: done

## Outcome
`docs/permission/role-matrix.md` section 3 equals the table `holds()` produces over the seeded roles, its notes state the new grants, and the flow guide describes the pricing step, director self-approval and order notices. (The live re-seed moved to task-07, GATE-REVIEW R-08.)

## Scope
- In:
  - `role-matrix.md`: regenerate the section-3 table with `seededRoleCodes()`, `seededRolePermissions()` and `holds()` as `:150` prescribes; update the date `:3`, the director description, and notes `:142-145` (director `*:*`, engineering without price, `estimate:price`, the director role locked on the roles screen, the director's signature stored without review).
  - Create a spec that checks the doc against the seed (R-14 f), so the oracle can fail: `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts` reads section 3 of `role-matrix.md` from `<backend root>/docs/permission/` (the container mount, `compose.yml:74`) or else `<backend root>/../docs/permission/` (host), parses the header's role columns and each `| \`scope\` |` row, and asserts for every row and column that ✅ equals `holds(new Set(seededRolePermissions(role)), scope)`, and that the rows `estimate:price`, `reference_price:read` and `purchase_price:read` exist (whether the table must list every declared scope is not verified; the spec checks every row it finds). It fails, not skips, when the file is missing.
  - `user-flow-guide.md:113-133`: the estimate step (engineer quantities only; sales price and "Hoàn tất giá"; quotation needs a priced estimate; director writes estimates), director self-approval of quotation, purchase order and stocktake, and order follower notices; the line `:115` "Admin và Giám đốc chỉ xem được" changes.
- Out: other docs; the live re-seed (task-07).

## Coverage
- CP-10

## Ownership
- Modify: `docs/permission/role-matrix.md`, `docs/user-flow-guide.md`
- Create: `backend/src/kernel/core/database/seeds/role-matrix-doc.spec.ts`

## Steps
1. Write the spec; it fails on today's doc (engineer still ✅ on `reference_price:read`, no `estimate:price` row).
2. Regenerate and replace the table; then the notes and the guide; the spec passes.

## Acceptance
- AC-15.

## Dependencies
- task-08-bell-phrases.md
- task-10-pricing-ui.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm test -- --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "Hoàn tất giá" docs/user-flow-guide.md`
- Named probe: `role-matrix-doc.spec.ts` (cell-by-cell match against `holds()`, the three price/pricing rows present); the guide grep.
- Reachability: known. The spec reads the doc through the backend container's read-only mount (`compose.yml:74`); the grep runs on the host from the work context root.
- Oracle: exit 0; the spec reports 0 mismatched cells and the three rows present; the guide names the pricing action.
- Counterexample: a hand-edited ✅ for `estimate:price` under `engineeringLead`, or a missing `estimate:price` row, must fail the spec.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm test -- --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "Hoàn tất giá" docs/user-flow-guide.md
Exit: 0
Base: ce0c00abc1d6ee7427eb480a9c3ea38950bd5c27
Head: b303841e1fa0b2219c7b95f6a634d1e23a11b98003b507aa7c9a0d2f25ed45d3
```text
$ docker compose exec -T backend sh -c "npm run lint && npm test -- --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts" && grep -n "Hoàn tất giá" docs/user-flow-guide.md
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/kernel/core/database/seeds/role-matrix-doc.spec.ts
PASS src/kernel/core/database/seeds/role-matrix-doc.spec.ts (31.871 s)
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
VERIFY_EXIT=0
```

This run started after the last edit; 0 skipped; on the host the Command was wrapped in `timeout 900`; ANSI colour codes were stripped from the output above. Named probes: `role-matrix-doc.spec.ts` reads section 3 of `docs/permission/role-matrix.md` through the backend container's mount (else `../docs/permission`, and fails when the file is missing), parses the role columns and every `| \`scope\` |` row, and reports 0 mismatched cells against `holds(new Set(seededRolePermissions(role)), scope)`; the rows `estimate:price`, `reference_price:read` and `purchase_price:read` are present; the guide grep finds "Hoàn tất giá" at `docs/user-flow-guide.md:127`. The section-3 table was regenerated from the seed by a throwaway script outside the repo calling the same `holds()`; it keeps the existing 92 rows and adds `estimate:price` (whether the table lists every declared scope is not checked, as the task states).

Pre-change run (spec first, docs unchanged): exit 1; 2 failed (no `estimate:price` row; 30 mismatched cells, e.g. the engineer still ✅ on `reference_price:read`), 3 passed. Counterexamples (each restored, `cmp` equal): a hand-edited ✅ for `estimate:price` under `engineeringLead` fails with "estimate:price x engineeringLead: doc ✅, seed empty"; deleting the `estimate:price` row fails the row case. The run was interrupted once by a host Docker restart (all containers exited 255) and resumed on the same working tree.

Review: the controller read both doc diffs and checked the guide's claims against the code: the director writes estimates and admin only reads (`estimate-writer.ts`, `estimate.service.ts`); the pricing step, the zero-cost refusal and the chips (task-07 and task-10); director self-approval of quotation, purchase order and stocktake with admin kept on four-eyes (task-03, task-04); the approved purchase order reaches its creator, purchasing and storekeeper except the actor (`purchase-order-approval.service.ts:46,304-309`); the order update notice reaches salesManager, purchasing, storekeeper, productionManager and the sales owner except the actor (`order-follower-notifier.ts`). The notice recipients were not walked in the UI for this task.
