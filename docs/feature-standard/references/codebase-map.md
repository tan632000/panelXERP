# Codebase Map — what already exists before you write a line

The templates say what a file looks like. This file says **what you must not write yourself**,
because the repo already has it, and **where the feature has to be registered** to become visible.

Read this after the contract and before Step 1 of [`runbook.md`](runbook.md). Every path and
every usage count below was taken from the repository, not from a design intent.

Companion files: [`backend-templates.md`](backend-templates.md),
[`frontend-templates.md`](frontend-templates.md), [`pitfalls.md`](pitfalls.md).
Contract: [`../feature-development-standard.md`](../feature-development-standard.md).

---

## 1. Copy from a real feature, not from a blank page

| Shape | Reference feature | Why this one |
|---|---|---|
| Master-data CRUD with a business code, a classification enum and a picker | `master-data/other-material` | Newest complete CRUD; has the code service, the constraint service, the API-error mapper and a picker field exported for other plugins |
| The same, **with file uploads** | `master-data/surface-treatment-material` | The contract's reference implementation — adds `pipes/parse-*-body.pipe.ts`, `utils/*-multipart.util.ts` and `utils/*-doc.util.ts` on the backend, the stored-file-name utils and `FormFileNameField` on the frontend |
| Master-data CRUD without a code | `master-data/company` | Simplest complete slice |
| Warehouse document (header + lines, source traceability, notifications) | `warehouse/tool-equipment-warehouse-issue` | Lines, lot pool, PO balance, notification service, SQL helpers |
| Computed list with no table of its own (stock balances) | `warehouse/tool-equipment-warehouse-stock` | In-memory sort/filter path, `types/*-view.types.ts` |
| One feature, several variants (OK / NG / TS / Mold) | `warehouse/raw-material-warehouse-receipt` | Per-variant controller + module over a shared `_shared/` service set |

Open the reference feature side by side with the templates. Where the two disagree, the code in
the reference feature is the current shape.

### Path aliases

| Side | Aliases |
|---|---|
| Backend (`backend/tsconfig.json`) | `@shared/*` → `src/kernel/shared/*` · `@kernel/*` · `@plugins/*` · `@src/*` |
| Frontend (`frontend/tsconfig.json`) | `@/*` → `./src/*` · `@kernel/*` · `@plugins/*` |

Relative imports across directories are not the house style; use the alias.

---

## 2. On-disk layout as the repo actually has it

Migrations and seeds live **inside the feature directory**, not in a central folder:

```
backend/src/plugins/<plugin>/<feature>/
  constants/<feature>-code.constant.ts      # only with a business code
  database/migrations/<epochMs>-init-<feature>.ts
  database/seeds/seed-<feature>s.ts
  dto/create-<feature>.dto.ts
  dto/update-<feature>.dto.ts
  dto/<feature>-filter.dto.ts
  entities/<feature>.entity.ts
  enums/<feature>-<axis>.enum.ts
  permissions/<feature>.permissions.ts
  services/<feature>.service.ts
  services/<feature>-code.service.ts        # only with a business code
  services/<feature>-constraint.service.ts  # only when deletion or update is guarded
  pipes/parse-<feature>-body.pipe.ts        # only with file uploads (multipart)
  utils/<feature>-multipart.util.ts         # only with file uploads
  utils/<feature>-doc.util.ts               # only with file uploads
  <feature>.controller.ts
  <feature>.module.ts
```

A feature with variants adds `ok/`, `ng/`, … each holding its own controller + module, over a
sibling `_shared/` holding the services both variants call.

Frontend, from `master-data/other-material`:

```
frontend/src/plugins/<plugin>/<feature>/
  constants.ts            types.ts
  permissions/<feature>.permissions.ts
  permissions/<feature>-permission.keys.ts
  <feature>.feature.ts
  services/<feature>.service.ts
  schemas/<feature>.schema.ts
  hooks/api/use<Feature>.ts
  hooks/use<Feature>FormSchema.ts
  hooks/use<Feature><Enum>s.ts
  utils/form-payload.ts
  utils/map-<feature>-api-errors.ts
  components/<Feature>{ListPage,Table,FormFields,DetailPage,DetailContent}.tsx
  components/{Create,Edit}<Feature>Modal.tsx
  components/<Feature>PickerField.tsx        # only when other features select this record
```

### Do not use `make gen-module` / `make gen-feature`

Both scaffolders (`backend/scripts/generate-module.ts`,
`frontend/scripts/generate-feature.ts`) still emit the **pre-standard** layout: permissions at the
module root instead of `permissions/`, no filter DTO, no `services/` directory, no migration, and
on the frontend a `mock/` directory and a single `<Feature>Modal.tsx`. Their output has to be
rewritten to match §2, which costs more than starting from the reference feature. Use them only to
read how `<plugin>.features.ts` is patched.

---

## 3. Backend building blocks — reuse, never re-implement

`backend/src/kernel/shared/`. The count is how many plugin files import it today; a high count is
the house pattern, not an option.

### List/query plumbing — required by every list endpoint

| Module | Gives you | Used by |
|---|---|---|
| `utils/column-filter.util.ts` | `ColumnFilterDefinition` / `ColumnFilterMap`, per-column filtering and the `column-values` enumeration, including relation and computed columns | 209 |
| `utils/pagination.util.ts` + `dto/pagination.dto.ts` | `resolvePagination`, `resolveSortOrder`, `paginate`, `PaginatedResult` | 86 |
| `utils/column-sort.util.ts` | `applyColumnSort` over the same `ColumnFilterMap` — numeric-aware, empties last | 74 |
| `utils/typeorm-search.util.ts` | keyword search, `escapeLikePattern` | 81 |
| `utils/repository.util.ts` | repository helpers shared by the service template | 72 |
| `utils/soft-delete.util.ts` | the `isDeleted = false` predicate every read must carry | 71 |
| `utils/computed-sort.util.ts` | the in-memory twin of `applyColumnSort`, for stock/balance lists with no table to order by | 12 |
| `utils/list-query.util.ts`, `dto/list-filter.dto.ts`, `dto/column-filter.dto.ts`, `dto/date-range-filter.dto.ts` | the filter DTO bases | — |

### Writes, codes and deletion

| Module | Gives you | Used by |
|---|---|---|
| `utils/db-error.util.ts` | maps a Postgres violation to the right HTTP error — this is what turns a duplicate code into the 409 the form shows inline | 80 |
| `utils/bulk-delete.util.ts` + `dto/bulk-delete.dto.ts` + `decorators/bulk-delete-endpoint.decorator.ts` | the whole bulk-delete contract, including the per-row result the dialog renders | 71 |
| `utils/unique-field.util.ts` | uniqueness checks that already exclude soft-deleted rows | 29 |
| `utils/master-data-code.util.ts` + `decorators/is-master-data-code.decorator.ts` | the `XXX_0001` master-data code shape and its validator | 10 |
| `document-code/document-code.service.ts` | year-scoped **document** codes (`R_2026_0049`): ordinal derived from the documents themselves, deleted numbers stay reserved. Do not write a sequence table | 10 |
| `utils/reference-count.util.ts` | "cannot delete, still referenced" counting | 2 |

Master-data codes and document codes are different rules. A catalogue row uses
`master-data-code.util`; a business document uses `DocumentCodeService`.

### Dates — the single most-used rule in the repo

| Module | Gives you | Used by |
|---|---|---|
| `validators/is-date-only.validator.ts` | `@IsDateOnly()` — the only accepted date field shape (paired with the `erp/no-iso8601-date-field` lint rule) | 151 |
| `utils/business-date.util.ts` | `assertBusinessDateNotFuture(date, label)`, compared against the **application** today, not UTC | 46 |
| `utils/iso-week.util.ts` | ISO week for week-numbered columns | 34 |
| `utils/document-validity.util.ts` + `.sql.ts` | `appToday()`, effective/expired document windows | 9 |

### Files, numbers, context

| Module | Gives you | Used by |
|---|---|---|
| `services/s3-storage.service.ts` | every upload/download; never talk to S3 directly | 29 |
| `utils/multipart-body.util.ts` | parsing a multipart create/update payload | 7 |
| `utils/content-disposition.util.ts` | download filenames, including Vietnamese ones | 5 |
| `utils/numeric-column.transformer.ts` | the TypeORM transformer every `decimal` column needs so it arrives as a number | 5 |
| `utils/typeorm-filter.util.ts` | filter fragment builders | 3 |
| `context/request-context.store.ts` + `middleware/request-context.middleware.ts` | the current actor inside a service, without threading it through | — |
| `entities/base.entity.ts` | id + all audit columns + `isDeleted` — redeclare none of them | — |
| `decorators/column-values-endpoint.decorator.ts` | the `GET /<features>/column-values` Swagger + wiring | — |
| `audit/audit-trail.service.ts`, `activities/activity-log.service.ts` | audit trail and activity feed entries | 2 / 3 |
| `logger/logger.service.ts` | structured logging; never `console` | — |
| `filters/http-exception.filter.ts` | the global error envelope the frontend mapper parses | — |

Auth: guards and decorators are in `backend/src/kernel/core/auth/`
(`guards/jwt-auth.guard.ts`, `guards/roles.guard.ts`, `decorators/auth.decorators.ts`,
`utils/permission-match.util.ts`). A controller declares scopes through those decorators and the
imported permission constants — never a string literal (`erp/no-permission-literal`).

### Crossing a plugin boundary

`erp/no-cross-plugin-import` blocks a direct import. The two sanctioned routes:

1. **Gateway** — `backend/src/plugins/<plugin>/_shared/gateways/`. Each gateway is an injectable
   the consuming plugin registers through the plugin's `gateway.module.ts`. The warehouse plugin
   has ~20 (`stock-lot-gateway.ts`, `warehouse-receipt-po-source-gateway.ts`,
   `finished-product-stock-out-gateway.ts`, …); sales and plans have one each. Every gateway in
   the repo ships a `.spec.ts` next to it.
2. **Domain event** — `backend/src/kernel/platform/events/` (`domain-event.ts`,
   `event-schemas.ts`, `events.module.ts`). Use when the producer must not know the consumer.

Read the existing gateways before adding one: the source you need is often already exposed.

---

## 4. Frontend core — the component and hook inventory

`frontend/src/kernel/core/`. Contract §3.0 says every input comes from core UI; this is the
catalogue. Counts are plugin files using each one.

### Page and list scaffolding

| Component | Role | Used by |
|---|---|---|
| `ListPageLayout` | the list page frame — header, toolbar slot, body | 100 |
| `ListQueryBody` | loading / empty / paginated body around a table; owns the min-height so the page does not jump | 77 |
| `PageToolbarActions` | the create + secondary action cluster | 70 |
| `BulkDeleteAction` + `BulkDeleteResultDialog` + `TableSelectionBar` | the whole bulk-delete interaction | 66 |
| `Table` | the list table; per-column filters, sorting, column show/hide, frozen columns | — |
| `TableColumnFilter`, `TableColumnSettings`, `TableSortControl` | the three controls `Table` exposes — wire them, do not rebuild them | — |
| `Pagination`, `SearchInput`, `ListFilterToolbar`, `DateRangeFilter`, `DateFilterInput` | filter axes | — |
| `EmptyState`, `ErrorState`, `LoadingState`, `LoadingSpinner` | the three list states | — |

### Detail page

| Component | Role | Used by |
|---|---|---|
| `DetailPageLayout` | detail frame + back behaviour | 77 |
| `DetailSection`, `DetailFieldGrid`, `DetailField` | the field grid — a detail page is built from these, never from raw `div`s | 77 / 74 / 74 |
| `DetailNoteBox`, `DetailTextBlock`, `DetailDocRow`, `DetailLinkRow` | notes, free text, attachments, links to other documents | 23 / 6 / 2 |
| `DetailReferenceTable` | "documents referencing this one" | 18 |
| `DetailTotalsSummary` | footer totals under a line table | 13 |
| `DetailPanel`, `DetailPanelActions`, `DetailPanelActionButton` | icon-only action bar (contract §6.3: no text labels) | — |

### Inputs — the list `erp/no-native-number-input` and §3.0 are about

| Component | Use for | Used by |
|---|---|---|
| `DropdownSelect` | every select, including searchable and multi | 115 |
| `DateInput` | every date; never `<input type="date">` | 75 |
| `NumberInput` (or `FormInput type="number"`, which renders it) | every quantity, price, discount, fee | 59 |
| `FormInput`, `FormTextArea`, `FormSelect`, `FormCheckbox`, `FormField`, `FormControl`, `FormSection` | the rest of the form | — |
| `FileInput` | uploads | 5 |
| `RecordPickerField` / `RecordPickerDialog` / `RecordPickerSourceField` | picking another record | 5 |
| `Modal`, `ConfirmDialog`, `CancelReasonModal` | dialogs — `ConfirmDialog` is the most-reused component in the repo | 170 |

### Cells and badges

`ClassificationBadge` (78) · `DateWeekCell` (78) · `StatusBadge` (23) · `ProgressBar` (12) ·
`LineTableShell` (9) · `ToneTabs` (8) · `OverviewStat` (8) · `SegmentedTabs` (6) ·
`QuantityWeightCell` (5) · `DocumentValidityBadge` (4) · `CodeListPopoverCell` (2) ·
`SharedIdentityNotice` (2) · `Breadcrumb`, `PageHeader`, `Tabs`, `Icon`, `Button`, `Toaster`.

`Icon` is the icon registry — the `icon` string in `<feature>.feature.ts` resolves through it.

### Hooks — `frontend/src/kernel/core/hooks/`

| Hook | Role | Used by |
|---|---|---|
| `useDeleteConfirmation` | the delete dialog + its mutation, including the blocked-by-reference reason | 96 |
| `useListViewState` | filters/sort/page persisted per list scope for the browser tab, cleared on sign-in/sign-out | 89 |
| `useTableSort` | sort state matching the backend `ColumnSortQuery` | 84 |
| `useCommittedSearch` | search that commits on submit rather than per keystroke | 78 |
| `useBulkSelection` | row selection feeding `BulkDeleteAction` | 71 |
| `useFormApiErrorReporter` | places an API rejection on a form field, and toasts it when no field owns it — **the mechanism contract §3.6.1 relies on**; skipping it is the silent failure | 68 |
| `useRecordPickerQuery` | the infinite, debounced query behind every picker | 52 |
| `useNextCodeErrorToast` | announces a failed `next-code` preview so the actor does not submit an empty code | 41 |
| `useScrollToFirstInvalid` | jumps to the first invalid field on submit | 24 |
| `useMutationFeedback` / `useToastMutationFeedback` / `useQueryErrorToast` | the toast policy (it deliberately suppresses toasts a form is expected to show inline) | — |
| `useValidationMessages`, `useDeleteFailureReason`, `useRowLabels`, `useClassificationOptions` | localized message helpers | — |
| `useAccessibleColumns`, `useFrozenColumns`, `useTableColumnFilters`, `useTableControls` | table wiring | — |
| `useEntityIdParam`, `useDetailOrigin`, `useDebouncedValue`, `usePortalContainer`, `usePausableTimeout` | misc | — |
| `hooks/api/` | `useBulkDeleteMutation`, `useColumnFilterValues`, `useListColumnPreferences`, `useCountries`, `useNotifications` — the feature hook composes these, it does not re-query those endpoints | — |

### Lib — `frontend/src/kernel/core/lib/`

| Module | Role | Used by |
|---|---|---|
| `formatters.ts` | every number, date, quantity and currency rendered in a cell | 125 |
| `api-error-mapping.ts` | the shared side of `utils/map-<feature>-api-errors.ts`, including the 409 → `validation.codeExists` path | 116 |
| `export-rows-to-csv.ts` | list export | 17 |
| `list-page-order.ts` | list ordering helpers | 12 |
| `record-label.ts` | how a picked record is labelled | 8 |
| `table-column-filter.ts`, `table-sort.ts`, `list-view-state.ts`, `list-params.ts`, `pagination.ts` | the client half of the list contract | — |
| `master-data-code.ts`, `document-code-year.ts` | code shapes, mirroring the backend utils | — |
| `form-payload.ts`, `form-field-path.ts`, `multipart.ts`, `files.ts` | payload assembly | — |
| `column-access.ts` | hides a column the actor has no scope for | — |
| `validators.ts`, `errors.ts`, `toast.ts`, `app-today.ts`, `iso-week.ts`, `document-validity.ts`, `navigation-history.ts`, `detail-origin.ts`, `query-keys.ts`, `cn.ts` | — | — |

Constants: `constants/list-ui.ts` (page sizes, debounce, min-heights — do not hard-code these),
`constants/apiRoutes.ts`, `constants/unit-of-measure.ts`, `constants/country-dial-codes.ts`,
`constants/file-size.ts`, `constants/queryKeys.ts`.
Permissions: `permissions/PermissionGate.tsx`, `permissions/route-permissions.ts`.

---

## 5. Registration — the complete list

Contract §9 has seven entries. These are all of them, including the four the checklist omits;
each of the last four is enforced by a test that fails after the fact.

**Backend**

1. `backend/src/plugins/<plugin>/<plugin>.features.ts` — the `ErpFeature` entry
   (`key`, `plugin`, `module`, `permissions`, `seed`, optional `dependsOn`). This one entry wires
   the Nest module, the permission catalog, the seed order **and the migration glob**.
2. `backend/src/kernel/core/database/seeds/seed-roles.ts` — the new scopes, for exactly the roles
   the newest Function List marks `●`.
3. `backend/src/kernel/core/users/list-preference.constant.ts` — the list-preference key. **The
   current suffix is `_v2`**: `other_material_list_v2`, `product_list_v2`. Only a handful of
   warehouse keys still use the bare `_list` form. Match the neighbouring keys of your plugin, and
   use the identical string in the frontend `<FEATURE>_LIST_PREFERENCE_KEY`.
4. `backend/src/kernel/core/database/seeds/seed-roles.function-list.spec.ts` — a `ROW_SCOPES`
   entry per Function List STT row of this feature.
5. `backend/src/kernel/core/database/validate-migration-filenames.util.ts` — **only** if you are
   inheriting an already-merged rounded timestamp; new migrations must never be added to
   `LEGACY_PADDED_MIGRATION_FILENAMES`.

**Frontend**

6. `frontend/src/plugins/<plugin>/<plugin>.features.ts` — array order is navigation order.
7. `<feature>.feature.ts` — `key`, `plugin`, `sectionTitle`, and an item with `featureKey`,
   `href`, `icon`, `label`, `permissions: ["<feature_key>:read", "<feature_key>:*"]`. The sidebar
   is derived from this through `kernel/platform/plugins/navigation.registry.ts`; there is no
   separate menu file to edit. If the feature had a stub entry in
   `kernel/platform/plugins/future-navigation.ts`, remove it.
8. `frontend/src/kernel/langs/load-messages.ts` — both locale bundles.
9. `frontend/src/app/[locale]/<plugin>/<feature>/{page.tsx,[id]/page.tsx}`.
10. `frontend/src/kernel/langs/{vi,en}/<plugin>.json` — the **nav label** under the plugin bundle
    (e.g. `masterData.json` → `"otherMaterial": "Vật tư khác"`), which is what `label` in
    `<feature>.feature.ts` resolves to.
11. `frontend/src/kernel/langs/{vi,en}/modal.json` — `titles.<featureCamel>`.
12. `frontend/src/kernel/platform/tests/plugin-api-routes.test.ts` — import and assert this
    feature's `<feature>PageRoutes` / api routes.

`kernel/platform/tests/navigation-permissions.test.ts` needs no edit, but it reads the real
`seed-roles.ts`: a nav item whose `permissions` no role holds fails there.

### `constants.ts` is a fixed shape

From `other-material`, in this order: `<FEATURE>_CODE_PREFIX` · `<feature>PageRoutes`
(`list`, `detail(id)`) · `<feature>ApiRoutes` (`list`, `detail(id)`, `bulkDelete`, `columnValues`,
`nextCode`) · `<FEATURE>_LIST_PREFERENCE_KEY` · `<feature>QueryKeys`
(`all`, `list(filters)`, `detail(id)`, `nextCode()`, `pickerRecords(search)`) · the enum item
table `<FEATURE>_<ENUM>_ITEMS` carrying `value` + `colorClass`, with the derived
`…_BY_VALUE` map and the `readonly [T, ...T[]]` tuple Zod needs.

---

## 6. Commands that exist

| Command | Notes |
|---|---|
| `make format` / `lint` / `typecheck` / `test` | each runs backend + frontend in the container; `-be` / `-fe` variants exist |
| `make validate-migrations` | filename + class-name timestamp; `validate-migrations-strict` additionally rejects legacy padded values |
| `make gen-api-docs` → `make gen-api-client` | the OpenAPI → frontend types chain; `make validate-api-docs` runs Redocly |
| `make migrate` / `make seed` / `make db-setup` | `make bootstrap` is the first-time build + up + migrate + seed |
| `make up` / `down` / `logs-be` / `logs-fe` / `ps` | the dev stack |
| `npm run lint:i18n` (frontend) | runs `src/kernel/core/tests/i18n-enum-conformance.test.ts` — enum values English in code, labels only in the JSON bundles. Chained from `npm run lint` |

Tests: backend is **Jest** (`npm test`, e2e config in `backend/test/jest-e2e.json`); frontend is
**Vitest** with Testing Library. Shared frontend test helpers are in
`frontend/src/kernel/core/tests/`.

Lint rules enforcing the contract — backend `backend/eslint-plugin-erp/rules/`:
`no-cross-plugin-import`, `no-permission-literal`, `no-vietnamese-comments`,
`no-iso8601-date-field`. Frontend `frontend/eslint-plugin-erp/rules/`: the first three plus
`no-native-number-input`.

A brand-new **plugin** (not a feature) follows `docs/scaffold/new-plugin/README.md` and
`create-plugin.sh`, then registers in `enabled-plugins.ts` on both sides.
