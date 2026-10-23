# Pitfalls

Failure modes seen in this codebase, what they look like, and the fix. Scan this list before
Step 10 — most of these cost a whole verification cycle.

---

## Registration

| Symptom | Cause | Fix |
|---|---|---|
| Migration never runs; table missing after `make migrate` | Feature not in `<plugin>.features.ts`. The migration glob is built from the feature catalog (`getFeatureMigrationGlobs`), so an unregistered feature is invisible | Add the `ErpFeature` entry first, then migrate |
| Column show/hide silently resets on reload | `<feature_key>_list` missing from `LIST_PREFERENCE_MODULE_KEYS` — a closed registry; unknown keys are dropped | Add the key |
| Screen 404s but the code exists | Missing `app/[locale]/<plugin>/<feature>/page.tsx`, or the feature not in the frontend `<plugin>.features.ts` | Add both |
| Nav item missing for a role that should see it | The `permissions` array on the feature item does not include the read scope | Use `["<feature_key>:read", "<feature_key>:*"]` |
| Feature works locally, absent after deploy | `ENABLED_FEATURES` / `NEXT_PUBLIC_ENABLED_FEATURES` pins an explicit list that omits it | Add the key, or leave the env unset to default to all |

---

## Migrations

| Symptom | Cause | Fix |
|---|---|---|
| `make validate-migrations` rejects the filename | Timestamp is padded (`...00000`) or the shape is not `<13-digit>-<kebab>.ts` | Regenerate with `node -e "console.log(Date.now())"` |
| Duplicate-key error after soft-deleting and re-creating a row | Plain `UNIQUE` index counts soft-deleted rows | Use a partial index: `... WHERE is_deleted = false` |
| 500 on create after a delete, and the old index is still there | A retiring `DO` block selected on `indpred IS NULL`, so an index partial on another column (`WHERE customer_code IS NOT NULL`) survived it | Retire by predicate, not by partiality: `dropUniqueNotFreedOnDelete(table, column)` |
| A repair only runs on some databases | The narrowing sits inside a conditional branch (e.g. "only if table `suppliers` exists") | Put schema repairs in the migration's unconditional path |
| `down()` leaves the DB dirty | `DROP TABLE` without `CASCADE`, or no `down()` at all | Always write a real, reversible `down()` |
| Entity and migration disagree on a column length | The entity was edited without a follow-up migration | Add an `alter` migration; never edit an applied one |

---

## Permissions

| Symptom | Cause | Fix |
|---|---|---|
| `erp/no-permission-literal` lint error | A raw `"feature:read"` string in a guard or a `can()` call | Import the constant from `permissions/` |
| `seed-roles.function-list.spec.ts` fails on row count | Adopted a newer Function List without updating the asserted `allRows` / covered-row counts | Update the counts together with `FUNCTION_LIST_RELATIVE_PATH` |
| Spec fails with "unmapped row" | New STT rows exist in the Function List with no `ROW_SCOPES` entry | Add the entry; a row with no endpoint yet maps to `[]` |
| A role sees a screen it should not | Scope granted in `seed-roles.ts` beyond what the newest Function List marks `●` | Re-read the newest revision, not the one the task file names |
| Two departments need different write rights on one screen | Modelled as a single `:write` | Split into `:write:general` / `:write:technical`; `RolesGuard` admits any listed scope |

---

## Backend behaviour

| Symptom | Cause | Fix |
|---|---|---|
| Soft-deleted rows appear in the list | A query path missing `isDeleted: false` | Every read starts from `{ isDeleted: false }`; use `findActiveByIdOrThrow` for detail |
| Duplicate code accepted after a delete | Code uniqueness checked among active rows only | Code is unique across **all** rows; name is unique among **active** rows |
| Code changes on edit | `dto.code` assigned in `update()` | Code is immutable after create — never assign it |
| 500 instead of 409 on a race | Unique-violation not translated | Wrap the save in `rethrowUniqueViolation` |
| `/next-code` consumes a sequence | Used the allocation helper instead of the preview one | Use `previewMaxBasedCode`; allocation happens on create |
| `GET /next-code` returns 404 | Declared after `@Get(':id')`, so Nest routes it into `findOne` | Declare every literal-path GET before `:id` |
| Empty string stored instead of `null` | `dto.field?.trim()` without the `|| null` fallback | `dto.field?.trim() \|\| null` |
| Cross-plugin import lint error | Direct import of another plugin's service or entity | Route through `_shared/gateways/` or a domain event |
| A large quantity is refused ("must not exceed 999,999") | An upper bound copied from a spec table onto a quantity/price DTO field (`@Max`) | Never cap a quantity, price or amount — the customer rule (feedback 2026-09-28) overrides any spec ceiling. `@Max` only for a real domain bound: VAT ≤ 100, week ≤ 53, a score scale, a page size |

---

## Frontend

| Symptom | Cause | Fix |
|---|---|---|
| Column filter dropdown is empty | The column is `filterable` in the table but absent from the service's `ColumnFilterMap` | Keep the two in sync; the controller derives its allowed columns from the same map |
| Lint fails right after `npm run generate:api` | The generated client is unformatted | Run `prettier --write` **and** `eslint --fix` on `src/kernel/core/api/generated/api.ts` |
| Form shows raw keys like `validation.nameMax` | Missing key in the feature bundle | Add it to both locales |
| Save fails with **nothing on screen** — no toast, no field error — when two people create at once | The mapper has no `isDuplicateConflictError` rule for the code field, and `shouldSuppressInlineFormErrorToast` already withheld the toast for the "already exists" message on the assumption the form would show it inline | Add the branch pointing at the code field (`code`, `prId`, `poNo`, `rfqCode`…) and cover it with a mapper test (§3.6.1) |
| "Tên đã tồn tại" shown when the **code** collided | The duplicate branch routes every 409 to `name` | Split on the message: `lower.includes("code") ? "code" : "name"` |
| An English sentence appears under a Vietnamese label | The duplicate branch passed `apiMessage` straight through | Pass `messages.codeExists`; the server wording is for the log |
| Today's date is refused as "in the future", but only in the small hours | `new Date().toISOString().slice(0, 10)` is the **UTC** date, still yesterday for the first 7 hours of a Hanoi day | `appToday()` — `@/kernel/core/lib/app-today` on the frontend, `@shared/utils/document-validity.util` on the backend (§3.6.3) |
| A future date reaches the DB despite the picker | The `max` on the input is the only guard; a hand-crafted request bypasses it | Also `assertBusinessDateNotFuture` in the service and a zod `refine` in the schema |
| A bounded date pair can be broken one field at a time | The cross-field check is gated on the *other* field being submitted | Compare the values that will be stored, and run the check when either side is submitted |
| Clearing a text field does not persist | Update payload used `optionalTrimmedField` (omits empty) instead of `trimFormField` (sends `""`) | Create omits empties; **update sends them explicitly** |
| Filters do not reset pagination | `setCurrentPage(1)` missing from the filter's `onChange` / `onDebounced` / `onCommit` | Every filter change resets to page 1 |
| Search fires on every keystroke | Used raw state instead of `useCommittedSearch` | Search commits on Enter; other filters debounce |
| Stale list after create | Mutation invalidated only the detail key | Invalidate `queryKeys.all`, plus `queryKeys.detail(id)` on update |
| Delete shows a generic error when the row is referenced | Skipped the `can-delete` pre-check | Call `canDelete<Feature>` first and surface the mapped reason |
| Disabled buttons visible to read-only users | Rendered then disabled | Gate with `PermissionGate` / `can()` so the control is absent |
| `lint:i18n` fails | vi and en key sets differ, or an enum value was translated | Diff the key sets; enum values stay English |
| Editing record 0089 shows code 0090 in the modal | The `/next-code` query is `enabled: !isEdit`, but a disabled query still returns the value cached by an earlier create, and the effect copying it into the code field has no `isEdit` guard | Every effect that writes a next-code preview into the form starts with `if (isEdit \|\| !preview) return;` — or derive `code = isEdit ? record.code : preview` instead of writing it. Cover it with a test that seeds the cache (`plans/mrp/tests/mrp-modal-code.test.tsx`) |
| A number field stops at N digits | `max` on the `NumberInput` or `.max()` on the zod number, copied from a spec | Same rule as the backend: no upper bound on quantity, price or amount inputs |

---

## Process

| Symptom | Cause | Fix |
|---|---|---|
| Generated the wrong field set | Read `-v01` when `-v02` exists | Always `ls docs/original-specs/<plugin>/<feature>/` and take the highest version |
| Grants do not match what the customer expects | Used an older dated Function List | Always `ls docs/permission/` and take the newest |
| Invented a status value | Statuses taken from the mock or guessed | Statuses come from the flow analysis (`ERP_Phan_tich_Luong_Chi_tiet.md`) only |
| Created-date input in the create/edit modal | The mock's modal has a "Ngày tạo" field and it was ported verbatim | Drop it — `createdAt` comes from `BaseEntity` and the server; it belongs on the detail view, not in the schema, `FormFields` or payload |
| Eye icon in the Actions column | Copied from the mock | Remove it — the row click opens the detail; Actions holds only mutating actions |
| Detail action buttons with a text label | Copied from the mock | Icon-only; the label goes in `aria-label`/tooltip via i18n, unless an input explicitly requires visible text |
| Raw `<input>` / `<select>` / `<textarea>` in a feature component | Markup ported straight from the mock | Use the core UI component (`FormInput`, `FormSelect`, `FormTextArea`, `DateInput`, `NumberInput`, `FileInput`, …); the mock supplies layout and labels, never markup |
| A generic input built inside the feature folder | Core had no such component | Add it to `kernel/core/components/ui/` as a feature-agnostic component so the next feature reuses it |
| Core component edited to satisfy one feature | A feature needed different behaviour | Extend via props or wrap it in a feature component; change core only when the new behaviour is right for every existing caller |
| Code field rendered read-only or disabled | The mock shows the code as static text | The code is auto-suggested on create and stays editable; the client always submits it |
| "Code already exists" after deleting the record | Uniqueness checked without `isDeleted = false`, or a plain `UNIQUE` constraint instead of a partial index | Filter `isDeleted = false` in every uniqueness check and use `UNIQUE … WHERE is_deleted = false`; a deleted record must be re-creatable with identical values |
| Field editable on the wrong screen | Ignored who produces the field in the flow chain | Derive producer/consumer from the flow docs before designing the entity |
| Verification churns for many cycles | Ran `make lint` / `make test` after every step | Generate everything, verify once (runbook Step 10), fix in one batch |
| "Build passes" reported as done | Build success is not behaviour proof | `NO_TESTS` and `0 tests + exit 0` do not pass; exercise the screen |
