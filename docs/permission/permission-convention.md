# Permission convention

How authorization is expressed, so every feature reads the same way and can be checked
against the customer's function list without reading each screen.

Source of truth is `docs/permission/ERP_Function List - Function List-14-09-2026.csv`, the
customer's own file; earlier dated files in this folder are history. Nothing in code may
contradict it.

`backend/src/kernel/core/database/seeds/seed-roles.function-list.spec.ts` parses that CSV and
fails when the seeded grants drift from it, so the file name above is not documentation alone —
it is what the guard test reads.

## The six layers

| Layer             | File                                                                                     | Answers                           |
| ----------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| Scope declaration | `backend/src/plugins/<plugin>/<feature>/permissions/<feature>.permissions.ts`            | Which scopes exist                |
| Route guard       | `<feature>.controller.ts` — `@RequirePermission(...)`                                    | Which scope each endpoint needs   |
| Role grant        | `backend/src/kernel/core/database/seeds/seed-roles.ts`                                   | Which role holds which scope      |
| Menu and route    | `frontend/src/kernel/platform/plugins/navigation.registry.ts` — `permissions?: string[]` | Which screens an account may open |
| Control gating    | frontend feature `permissions/` — see below                                              | Which scope shows a button        |
| Column visibility | `TableColumn.permission` → `useAccessibleColumns`                                        | Which columns an account may see  |

A scope is named `module:action`, lowercase, `_` inside a word: `surface_treatment:write`.
A field-group split adds a third segment: `product:write:general`.

The backend `<feature>.permissions.ts` exports one `SCREAMING_CASE` const per scope plus a
`<feature>Permissions` array; the array is what `<plugin>.features.ts` registers, which is
how a scope becomes seedable. A scope missing from that array is warned about at seed time.

## Two frontend gating forms

Both are in use, sometimes in the same feature, and both are accepted:

| Form                       | File                                       | Used as                                                               |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Keys object (11 features)  | `permissions/<feature>-permission.keys.ts` | `can(MaterialPermission.write)`                                       |
| Scope consts (25 features) | `permissions/<feature>.permissions.ts`     | `can(SUPPLIER_WRITE)`, `<PermissionGate permission={SUPPLIER_WRITE}>` |

The keys object is preferred for new work: it groups a feature's scopes under one name and
reads closer to the function list. The consts file exists for every feature including the
ones not yet built, so a feature can gate controls before anyone writes a keys file.

`PermissionGate` renders `fallback` when `can` fails. Its `module` + `action` mode predates
the scope convention and matches `module:view` style strings — do not use it for new gating;
pass `permission` instead.

## Rules

1. **The list decides.** A grant exists because a row in the function list marks that actor.
   Put the row number in the comment when it is not obvious.
2. **One scope per action, named after the action.** `:read`, `:write`, `:delete`, plus
   `:approve` / `:cancel` / `:export` where the list treats them as separate authority.
   Creating and updating share `:write` unless the list gives them different actors.
3. **The guard lists alternatives, not requirements.** `RolesGuard` admits an actor holding
   _any_ listed scope. `@RequirePermission(A, B)` means "A or B" — never use it to demand both.
   When an action needs the narrower of two scopes, name only that one.
4. **Never gate on a literal string in a component.** Import the named scope, in either form
   above. A rename then fails to compile instead of silently hiding a control. This is the
   rule the convention test enforces; which of the two forms you use is style.
5. **Let the helper resolve wildcards.** `can` already matches `module:*` and `*:action`;
   do not write `can(X) || can("module:*")`.
6. **Frontend scopes mirror backend scopes.** The frontend file is a copy of the backend
   declaration. Do not invent a frontend-only scope.
7. **Hidden is not denied.** Gating a control is a convenience; the route guard is the
   authorization. Every gated action has a guarded endpoint behind it.

## Column visibility

A column declares the scope needed to see it; a column without one is visible to anyone who
can read the list:

```ts
{ key: "unitPrice", label: "...", permission: "goods_receipt:read:price" }
```

`Table` filters through `useAccessibleColumns` before anything else reads the columns, so the
header, the body, the settings popup and the stored preference all work from the same list —
a column the account may not see cannot be re-added by a stored preference naming it. The
three hand-written tables (RFQ, quotation, order) call the hook directly on their own
descriptor arrays.

The hook uses `useOptionalAuth` and fails closed, so a table rendered outside an auth
provider (a picker dialog, a detail sub-table) hides guarded columns rather than leaking them.

**No column declares a `permission` today.** The mechanism is wired across all 18 lists but
carries no policy yet; field-level authority is not in the function list.

## Adding a feature

1. Declare scopes in the backend `permissions` file and add the array to `<plugin>.features.ts`.
2. Guard each route with the scope its action needs.
3. Mirror the scopes into the frontend feature's `permissions/` folder and gate controls on
   them; add the screen to `navigation.registry.ts` with its read scope.
4. Grant the scopes in `seed-roles.ts` from the function-list rows, and seed a user per new
   role in `seed-users.ts`.
5. Map the new rows in `seed-roles.function-list.spec.ts` so the matrix check covers them.

## What the tests hold

| Test                                                               | Holds                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `backend/.../seeds/seed-roles.function-list.spec.ts`               | Every seeded grant matches the list, for the 226 of 444 rows in the four built modules, across 17 actors  |
| `frontend/.../platform/tests/permission-gating-convention.test.ts` | No literal scope in a component, keys files well formed, no redundant wildcard                            |
| `frontend/.../platform/tests/navigation-permissions.test.ts`       | Menu and direct-URL access match the seeded grants                                                        |
| `frontend/.../core/tests/column-access.test.ts`                    | Column filtering, and that a stored preference cannot re-add a hidden column                              |
| `backend/.../<feature>.permissions.spec.ts`                        | Frontend scopes mirror backend scopes — exists for product, order, quotation, rfq and sales-document only |

## Known gaps

These are recorded rather than worked around; each is a decision for the customer or a
feature that does not exist yet.

- **Two gating forms.** Unifying on the keys object would touch 15 features; left as is
  because rule 4 already gives the property that matters.
- **Excel export/import** — part of the 59 covered rows with no scope to grant, together
  with PO Balance (4.1–4.3) and the inventory report (4.13–4.14). `product:export` and
  `product:import` are declared and seeded but no route guards them.
- **Price visibility** — the 08-09 list splits "Xem thông tin giá" into its own row for MRP
  (4.5), PO (5.12), subcontract PO (5.24) and the delivery note (5.41). No scope exists for
  it yet; the column-visibility mechanism below is where it would land.
- **Delivery notes (Phiếu giao hàng, 5.39–5.46)** — new in the 08-09 list, no feature built.
- **`subcontract_order:approve`** — the 08-09 list dropped the subcontract approval row, so
  the scope is declared, guarded and seeded to the purchase manager with no listed function
  behind it. Removing it is a decision for the customer, not drift.
- **Scopes coarser than the list** — 13 scope sets are shared by rows the list gives to
  different actors (for example `purchase_request:read` covers both the PR list, granted to
  all 17 actors, and the PR printout, granted to 3). The widest row wins. Narrowing one
  needs a new scope and a route change. The list is in the matrix spec.
- **Narrowed since the 08-09 list**: contact removal (2.10) moved from `company:write` to
  `company:delete`, delivery-plan removal (3.65, 3.71) to `delivery_plan:delete`, and
  sample-order cancellation (3.31) to `sample_order:cancel`. `delivery_plan:delete` is
  granted to no role — only the director reaches it, through the wildcard.
- **`quotation:approve:step2`** is declared and guards `PUT /quotations/:id/approve/step2`,
  but no role is granted it — only the director reaches it, through the wildcard.
- **`rfq:write:technical`** is held only by roles that also hold `rfq:write:general`, so the
  RFQ field-group split currently draws no distinction.
- **`file:read` / `file:write`** are seeded to six roles but no plugin declares them, so the
  seeder warns they are unrecognised. They belong to the kernel `files` module, which is not
  registered as a feature.
- **The director** is seeded `*:*` on purpose and therefore reaches rows the list leaves
  unassigned. The matrix spec exempts it.
