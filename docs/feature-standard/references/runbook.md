# Feature Runbook — executable procedure

Step-by-step procedure for generating one CRUD feature.

**Generate everything first, verify once at the end.** Do not run `make lint`, `make typecheck`,
`make test` or any other command between steps — each run costs minutes and tokens for a signal
you will get anyway in Step 10. Steps 1–9 are pure code generation; Step 10 is the single
verification pass, and you fix everything it reports in one batch.

The only exceptions are the two commands that *produce input you cannot invent*: reading the
timestamp for a migration filename (Step 2) and regenerating the API client (Step 5).

Each step lists a **self-check** instead of a command gate — read your own output against it and
move on. Do not reorder the steps.

Companion files: [`intake.md`](intake.md), [`codebase-map.md`](codebase-map.md),
[`backend-templates.md`](backend-templates.md),
[`frontend-templates.md`](frontend-templates.md), [`i18n-keys.md`](i18n-keys.md),
[`pitfalls.md`](pitfalls.md). Contract: [`../feature-development-standard.md`](../feature-development-standard.md).

Throughout, substitute:

| Placeholder | Example | Where it appears |
|---|---|---|
| `<plugin>` | `master-data` | directories, feature catalog |
| `<feature>` | `surface-treatment-material` | directories, file names, feature key |
| `<Feature>` | `SurfaceTreatmentMaterial` | classes, components, types |
| `<featureCamel>` | `surfaceTreatmentMaterial` | i18n namespace, exported consts |
| `<feature_key>` | `surface_treatment_material` | permission scopes, preference key |
| `<FEATURE>` | `SURFACE_TREATMENT_MATERIAL` | exported constant names |
| `<features>` | `surface-treatment-materials` | REST path (plural) |
| `<table>` | `surface_treatment_materials` | Postgres table |

---

## Step 0 — Discovery

**Precondition:** [`intake.md`](intake.md) is done — the PO/BA request has been read and
normalized, and you know which slots it left `missing`. This step fills those from the repo.

Run these; paste the findings into your plan before writing code.

```bash
cd Repos/panelxerp

# 0.1 Original spec — take the HIGHEST -v0N
ls docs/original-specs/<plugin>/<feature>/

# 0.2 Engineering spec
ls specs/<plugin>/<feature>/

# 0.3 Function List — take the NEWEST dated file
ls docs/permission/

# 0.4 Mock screen + its render function
grep -n 'id="view-<slug>"' docs/html-css-js-mock/Sales_Module_Demo2.html
grep -n '<slug>-body\|filter<SLUG>' docs/html-css-js-mock/Sales_Module_Demo2.html

# 0.5 Data flows touching this feature
grep -n '<Vietnamese feature name>' docs/system-data-flow/ERP_Hai_Phuong_Dien_Giai_Luong_Du_Lieu.md
ls docs/system-diagram/          # use the highest V<n>

# 0.6 Nearest existing feature to copy from
ls backend/src/plugins/<plugin>/
ls frontend/src/plugins/<plugin>/
```

**Deliverable — a filled table.** Do not proceed while any cell reads "unknown":

| Question | Answer |
|---|---|
| PO/BA request worked from (path or quoted text) | |
| Original spec version used | |
| Function List revision used | |
| System diagram version used | |
| Mock screen id | |
| Field list (name · type · max length · required · nullable) | |
| Business code? prefix? | |
| Enums + members + badge colours | |
| File uploads? which, max size, extensions | |
| Statuses + legal transitions (from flow docs) | |
| Which fields are written by another department (read-only here) | |
| Referenced by / references which other features | |
| Roles marked `●` per function row | |
| Function List STT range for this feature | |

**Self-check:** every disagreement between the five inputs is reported, not silently resolved.

---

## Step 1 — Backend skeleton

Open the reference feature for this shape ([`codebase-map.md`](codebase-map.md) §1) beside the
templates, and reuse the kernel modules in §3 rather than writing a twin of one.

Create, in this order (each file is in [`backend-templates.md`](backend-templates.md)):

```
backend/src/plugins/<plugin>/<feature>/
  enums/<feature>-<axis>.enum.ts
  constants/<feature>-code.constant.ts        # only if the feature has a business code
  entities/<feature>.entity.ts
  permissions/<feature>.permissions.ts
  dto/create-<feature>.dto.ts
  dto/update-<feature>.dto.ts
  dto/<feature>-filter.dto.ts
  services/<feature>.service.ts
  <feature>.controller.ts
  <feature>.module.ts
```

**Self-check:** every DTO field has both a Swagger decorator and a validator with an English
message; the entity redeclares nothing from `BaseEntity`; the controller declares `:id` last;
no permission string literals.

---

## Step 2 — Migration

```bash
node -e "console.log(Date.now())"     # 13-digit prefix, never a padded/rounded value
```

This is one of the two commands you *must* run mid-way — the timestamp cannot be invented, and a
padded or rounded value is rejected later.

Create `database/migrations/<epochMs>-init-<feature>.ts` from the template.

**Self-check:** filename is `<13-digit>-<kebab>.ts`, the class name ends with the same timestamp,
the timestamp does not end in `00000`, `down()` is real, every audit column is present.

---

## Step 3 — Seed

Create `database/seeds/seed-<feature>s.ts` with 5–10 realistic English rows. Codes follow the
prefix rule and are sequential from `0001`.

---

## Step 4 — Registration (backend)

Full list, both sides, in [`codebase-map.md`](codebase-map.md) §5.

1. `backend/src/plugins/<plugin>/<plugin>.features.ts` — add the `ErpFeature` entry. **This is
   what activates the migration glob**; a feature missing here has its migrations silently
   skipped.
2. `backend/src/kernel/core/database/seeds/seed-roles.ts` — grant the new scopes to exactly the
   roles the newest Function List marks `●`.
3. `backend/src/kernel/core/users/list-preference.constant.ts` — add `<feature_key>_list` to
   `LIST_PREFERENCE_MODULE_KEYS`.
4. `backend/src/kernel/core/database/seeds/seed-roles.function-list.spec.ts` — extend
   `ROW_SCOPES` with this feature's STT rows.

**Self-check:** the feature key appears in `<plugin>.features.ts`; the new scopes appear in
`seed-roles.ts` for exactly the roles marked `●`; `<feature_key>_list` is in
`LIST_PREFERENCE_MODULE_KEYS`; every STT row for this feature has a `ROW_SCOPES` entry.

Do **not** run `make migrate`, `make seed` or the seed-roles spec yet — Step 10 covers them.

---

## Step 5 — API contract

The second command you must run mid-way: the frontend types are generated from the backend
contract, so this has to happen before Step 6.

```bash
cd backend  && npm run generate:api-docs
cd frontend && npm run generate:api
cd frontend && npx prettier --write src/kernel/core/api/generated/api.ts \
            && npx eslint --fix src/kernel/core/api/generated/api.ts
```

The prettier + eslint pass is not optional — an unformatted generated file fails lint in Step 10.
Never hand-edit the generated file.

---

## Step 6 — Frontend skeleton

Create, in this order (templates in [`frontend-templates.md`](frontend-templates.md); the core
components, hooks and lib modules to build from are catalogued in
[`codebase-map.md`](codebase-map.md) §4):

```
frontend/src/plugins/<plugin>/<feature>/
  constants.ts
  types.ts
  permissions/<feature>.permissions.ts
  permissions/<feature>-permission.keys.ts
  <feature>.feature.ts
  services/<feature>.service.ts
  hooks/api/use<Feature>.ts
  schemas/<feature>.schema.ts
  hooks/use<Feature>FormSchema.ts
  hooks/use<Feature><Enum>s.ts
  utils/form-payload.ts
  utils/map-<feature>-api-errors.ts
  components/<Feature>FormFields.tsx
  components/Create<Feature>Modal.tsx
  components/Edit<Feature>Modal.tsx
  components/<Feature>Table.tsx
  components/<Feature>ListPage.tsx
  components/<Feature>DetailContent.tsx
  components/<Feature>DetailPage.tsx
```

**Self-check:** no permission string literals; no Vietnamese outside the i18n bundle; the table
passes `columnPreferenceKey`; every write/delete control is behind `can(...)` or `PermissionGate`;
all 12 list capabilities from contract §3.3 are wired; the API-error mapper marks the code field
with the localized `validation.codeExists` on a 409 (contract §3.6.1 — a missing rule here fails
with no toast and no field error, so nothing in the browser reveals it).

---

## Step 7 — i18n

1. `frontend/src/kernel/langs/en/<featureCamel>.json`
2. `frontend/src/kernel/langs/vi/<featureCamel>.json`
3. Register both in `frontend/src/kernel/langs/load-messages.ts` (`enMessages` **and**
   `viMessages`).
4. Add `titles.<featureCamel>` to `modal.json` in both locales.

The complete required key set is in [`i18n-keys.md`](i18n-keys.md).

**Self-check:** diff the two key sets yourself — vi and en must be identical, and every enum
*value* stays English while only the label differs. This is the single most common Step 10
failure, so check it by eye now rather than discovering it later.

---

## Step 8 — Routes

```
frontend/src/app/[locale]/<plugin>/<feature>/page.tsx
frontend/src/app/[locale]/<plugin>/<feature>/[id]/page.tsx
```

Both are three-line `"use client"` wrappers. Add the feature to
`frontend/src/plugins/<plugin>/<plugin>.features.ts` — the array order is the navigation order.

---

## Step 9 — Tests

| File | Must cover |
|---|---|
| `backend/.../services/<feature>.service.spec.ts` | create happy path · duplicate code rejected · duplicate name rejected · code immutable on update · delete blocked when referenced · list filters by `isDeleted=false` |
| `backend/.../utils/*.spec.ts` | any guard or parser with real branching |
| `frontend/.../tests/*.test.ts(x)` | render the real composition, then mutation-test the guard (flip the permission, assert the control disappears) |

`NO_TESTS` and `0 tests + exit 0` are not a pass.

---

## Step 10 — Verify (the only verification pass)

Everything is written by now. Run the five commands **once**, in this order, and collect all
failures before fixing anything — `make format` first, because a formatting fix would otherwise
re-trigger lint:

```bash
make format
make lint
make typecheck
make test
make validate-migrations
```

Then apply the database and contract checks:

```bash
make migrate && make seed      # migration applies on a clean DB, seeds are idempotent
make validate-api-docs         # only if the OpenAPI surface changed
```

Fix in one batch, then re-run only the commands that failed. If a fix touches source, re-run
`make lint && make typecheck && make test` once more — not the whole set per edit.

Then exercise the screen:

```bash
make up      # then open the list, create, edit, filter, hide a column, bulk delete
```

**Report:** which Definition-of-Done checkboxes (contract §12) are met, name the
original-spec version / Function List revision / diagram version used, and list every
disagreement found between the five inputs.
