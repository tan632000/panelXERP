# Task 11 — Docs

Status: pending

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
