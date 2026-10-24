# Feature Development Standard

Canonical recipe for adding **one CRUD feature** (a "screen" backed by one aggregate) to this
codebase — handed verbatim to an AI agent as the base contract, read by humans as the review
checklist.

Reference implementation throughout: **`surface-treatment-material`** (master-data) — the most
complete example (code sequence, enum classification, file uploads, column filters, bulk delete,
delete guard). Copy its shape; drop what your feature does not need. Also useful: `tool-equipment`
and `commercial-goods` (uploads + product reference), `production-process` (minimal, no files),
`mold` (multipart + relations).

**Five inputs, five authorities.** Read all of them before writing code — each is authoritative
on a different thing, and none of them may be guessed at:

| Input | Authority on | § |
|---|---|---|
| `docs/original-specs/<plugin>/<feature>/*-v0N.md` | The customer's raw requirement: field list, coding rules, badge classes, VI UI copy, open points | §4 |
| `specs/<plugin>/<feature>/` | The engineering spec derived from it: scope, acceptance, task breakdown | §4 |
| `docs/permission/ERP_Function_List_<date>.md` | Which role gets which function | §5 |
| `docs/html-css-js-mock/Sales_Module_Demo2.html` | Layout, column set and order, filter axes, labels | §6 |
| `docs/system-data-flow/*.md` + `docs/system-diagram/*_V<n>.jpg` | Where the feature sits in the 21-flow chain: who produces each field, who consumes it, which statuses exist | §7 |

---

**How to use this document.** In Claude Code, invoke `/erp:feature <plugin>/<feature>` — the skill
at `.claude/skills/erp-feature/SKILL.md` runs this document as its procedure. Otherwise read §0–§2
for the shape and work the runbook by hand. These sections are the *contract* (what must be true);
the reference files are the *procedure and the code* (how to produce it):

| File | Use it for |
|---|---|
| [`references/intake.md`](references/intake.md) | Turning a PO/BA request into a build-ready brief — start every task here |
| [`references/runbook.md`](references/runbook.md) | The 11-step procedure, with the discovery commands and the single verification pass |
| [`references/codebase-map.md`](references/codebase-map.md) | What already exists: the reference feature per shape, the kernel modules to reuse, the full registration list |
| [`references/backend-templates.md`](references/backend-templates.md) | Copy-paste skeleton for every backend file |
| [`references/frontend-templates.md`](references/frontend-templates.md) | Copy-paste skeleton for every frontend file |
| [`references/i18n-keys.md`](references/i18n-keys.md) | The complete required key set for both locales |
| [`references/input-authorities.md`](references/input-authorities.md) | §4–§7 in full — the original/engineering specs, the Function List, the mock screen and the data-flow docs |
| [`references/pitfalls.md`](references/pitfalls.md) | Known failure modes, their symptom and their fix — scan before verifying |

---

## Start here

**Every feature task begins by loading this document, before reading the request itself.** It
defines what "done" means; the request only supplies the content.

The task input is whatever the PO or BA hands over — text, a chat message, a `.md`/`.docx`/`.xlsx`
spec, a screenshot, a ticket. Treat it as **one input among five**, authoritative on business
intent and scope only: it rarely carries the role matrix, column order, status set or field
ownership, and those come from the repo (§4–§7).

The opening moves are always:

1. Read this contract.
2. Read the PO/BA request and normalize it — [`references/intake.md`](references/intake.md).
3. Fill the gaps from the four repo authorities; send back only what none of them answers.
4. Read [`references/codebase-map.md`](references/codebase-map.md) — the reference feature to copy
   from, the kernel modules to reuse instead of writing, and the full registration list.
5. Start [`references/runbook.md`](references/runbook.md) Step 1 once no slot is `missing`.

Never generate from the request alone; never fill a gap by guessing.

---

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **plugin** | Business module: `master-data`, `sales`, `procurement`, `other-revenue` |
| **feature** | One aggregate inside a plugin: `surface-treatment-material`, `rfq`, `purchase-order` |
| **kernel** | Shared, plugin-agnostic code. `kernel/core` (infra), `kernel/shared` (BE utils), `kernel/platform` (plugin/feature registries) |
| `<feature>` | kebab-case key: `surface-treatment-material` |
| `<Feature>` | PascalCase: `SurfaceTreatmentMaterial` |
| `<feature_key>` | snake_case permission scope: `surface_treatment_material` |
| `<featureCamel>` | camelCase i18n namespace: `surfaceTreatmentMaterial` |

A feature is **self-contained**: entity, DTOs, service, controller, permissions, migrations and
seeds all live under its own directory. Nothing about it is spread into the kernel except the
handful of registry entries listed in §8.

---

## 1. Non-negotiable rules

1. **No cross-plugin imports.** Enforced by `erp/no-cross-plugin-import`. Cross-plugin reads go
   through `_shared/gateways/` (see `master-data/_shared/gateways/master-data-gateway.ts`) or
   domain events — never a direct service/entity import.
2. **No permission string literals.** Enforced by `erp/no-permission-literal`. Import the
   constant from the feature's `permissions/` file.
3. **Everything in code is English — every comment included.** Identifiers, enum values, string
   constants, comments, JSDoc, Swagger `summary`/`description`, validator messages, log messages,
   commit messages, seed data. Enforced by `erp/no-vietnamese-comments`; a single Vietnamese
   comment fails the build.

   ```ts
   // ✅  /** Business code — UI column "Material code" (e.g. HC_0007) */
   // ❌  /** Mã vật tư — cột "Mã vật tư" trên UI */
   ```

4. **Values English, labels multilingual.** This is the single rule most often broken, so it is
   worth stating precisely:

   | Layer | Language | Example |
   |---|---|---|
   | Enum member + stored DB value | **English camelCase, always** | `cleaningChemical` |
   | TypeScript type / constant name | **English** | `SurfaceTreatmentMaterialClassification` |
   | i18n **key** | **English — identical to the value** | `categories.cleaningChemical` |
   | i18n **value** (what the user reads) | **Both locales, every string** | vi: `"Hóa chất tẩy rửa"` · en: `"Cleaning chemical"` |

   ```ts
   // ✅ enum Classification { CLEANING_CHEMICAL = 'cleaningChemical' }   label via t('categories.cleaningChemical')
   // ❌ enum Classification { CLEANING_CHEMICAL = 'hoaChatTayRua' }      Vietnamese leaked into the value
   // ❌ <span>Hóa chất tẩy rửa</span>                                     hard-coded label
   ```

   No user-visible string is hard-coded in a component — not a column header, button, placeholder,
   toast, validation message, empty state, badge or modal title. Every one resolves through
   `useTranslations`, with the key present in **both** `langs/vi/` and `langs/en/`. Enforced by
   `npm run lint:i18n`; full key set in [`references/i18n-keys.md`](references/i18n-keys.md).
5. **Soft delete everywhere.** Rows are never hard-deleted. `is_deleted`, `deleted_at`,
   `deleted_by` come from `BaseEntity`; all reads filter `isDeleted = false`.
6. **No dates as ISO-8601 strings on date-only fields.** Enforced by `erp/no-iso8601-date-field`;
   use `@IsDateOnly`.
7. **Code format:** master data uses `_` (`HC_0001`, `CCDC_0007`); documents use `-`
   (`RFQ-2508-0001`). Master-data codes are editable on create, derived from existing rows,
   and freed when a row is deleted.
8. **Never hand-edit generated artifacts.** `frontend/src/kernel/core/api/generated/api.ts` is
   produced by `npm run generate:api`, then formatted (`prettier` + `eslint --fix`) or lint fails.
9. **Migrations must pass the validator.** The filename is `<13-digit epoch ms>-<kebab-name>.ts`,
   the class name carries the same timestamp, and the timestamp is a real `Date.now()` value —
   a rounded one ending in `00000` is rejected. Every table carries the full audit column set,
   `down()` is real and reversible, and a unique index that must tolerate soft-deleted rows is
   partial (`WHERE is_deleted = false`). Checked by `make validate-migrations`; details in §2.6.

---

## 2. Backend layout

A feature directory holds, in order of creation: `enums/`, `constants/`, `entities/`,
`permissions/`, `dto/` (create · update · filter), `services/`, the controller, the module, and
`database/{migrations,seeds}/`. Features with multipart uploads add `pipes/` and `utils/`.
File-by-file listing and skeletons: [`references/backend-templates.md`](references/backend-templates.md).


### 2.1 Entity

Extend `BaseEntity` (`@shared/entities/base.entity`) — it supplies `id`, `createdAt`,
`updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`, `isDeleted`.

Template: [`references/backend-templates.md`](references/backend-templates.md#entitiesfeatureentityts).

Rules: camelCase property → explicit `name:` when the snake_case column differs. Enums are
stored as `varchar`, never a Postgres enum type. Optional columns are `?: T | null`.

### 2.2 Permissions

Three scopes by default — `read`, `write`, `delete` — exported individually and as an
array for the feature catalog. Template:
[`references/backend-templates.md`](references/backend-templates.md#permissionsfeaturepermissionsts).

Scope shape is `<feature_key>:<action>`. Split `write` further only when the domain really
needs it (`product:write:general` / `product:write:technical`).

### 2.3 DTOs

- `Create<Feature>Dto` — every field carries `@ApiProperty`/`@ApiPropertyOptional` **and** a
  validator with an explicit English `message`. Codes use
  `@IsMasterDataCode(<PREFIX>, { label, maxLength })`. The code is **always sent by the client** —
  it is suggested by the UI, not generated by the server — so it stays a required, validated field
  on the create DTO (§3.6.1).
- `Update<Feature>Dto extends PartialType(Create<Feature>Dto)` plus `remove<File>?: boolean`
  flags for multipart file removal (`@Transform` string→boolean, because multipart sends text).
- `<Feature>FilterDto extends SortableListFilterQueryDto` (`@shared/dto/list-filter.dto`) — it
  already provides `page`, `limit`, `search`, `sortBy`, `sortOrder`, `columnFilters`. Add only
  feature-specific filters.

### 2.4 Service

Compose kernel utilities instead of re-writing them:

| Concern | Utility |
|---|---|
| Pagination | `resolvePagination`, `paginate`, `DEFAULT_LIST_PAGE_SIZE` |
| Free-text search | `buildIlikeOrWhere(baseConditions, ['code','name',…], query.search)` |
| Sorting | `resolveListSort(query, allowedFields)` + `toListOrder` |
| Column filters | `mergeColumnFilterConditions`, `findColumnValues`, `columnFilterKeys` |
| Uniqueness | `assertCaseInsensitiveUnique`, `rethrowUniqueViolation` |
| Fetch-or-404 | `findActiveByIdOrThrow(repo, id, 'Surface treatment material')` |
| Soft delete | `softDeleteWithAudit`, `bulkSoftDelete` |
| Next code preview | `previewMaxBasedCode` |
| Files | `S3StorageService`, `buildAttachmentContentDisposition` |

Export the filterable column map from the service — the controller reuses it, so backend map and
frontend `filterable` columns stay in sync:

```ts
/** Columns the list table filters and enumerates values for. Text and enum columns only. */
export const SURFACE_TREATMENT_MATERIAL_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  classification: { field: 'classification' },
};
```

Service invariants:
- Trim strings; store `null` for empty optionals (`dto.origin?.trim() || null`).
- Stamp `createdBy` / `updatedBy` from `AuthUserPayload`.
- `code` is **immutable** after create.
- `name` unique among active rows (case-insensitive); `code` unique across all rows.
- Every list query starts from `{ isDeleted: false }`.

### 2.5 Controller

```ts
@ApiTags('<plugin>/<features>')   // flat, plural, kebab-case — no /plugins prefix
@ApiBearerAuth()
@Controller('<features>')
```

Standard endpoint set, **declared in this order** (specific paths before `:id`, or Nest routes
`next-code` into `findOne`):

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/` | read | paginated list |
| GET | `/column-values` | read | via `@ColumnValuesEndpoint({ permission, columns })` |
| GET | `/next-code` | write | preview next code, does **not** consume a sequence |
| GET | `/:id/can-delete` | delete | `{ canDelete: boolean }` |
| GET | `/:id/documents/:kind/download` | read | signed S3 URL (file features only) |
| GET | `/:id` | read | detail |
| POST | `/` | write | create |
| PATCH | `/:id` | write | update |
| DELETE | `/:id` | delete | soft delete |
| POST | `/bulk-delete` | delete | via `@BulkDeleteEndpoint({ permission, subject })` |

Every handler carries `@RequirePermission(...)`, `@ApiOperation`, and `@ApiResponse` for the
non-200 outcomes it can actually produce. `@Param('id', ParseIntPipe)`. Controllers contain no
business logic — they parse, delegate, and return.

### 2.6 Migrations

- File: `database/migrations/<13-digit epoch ms>-<kebab-name>.ts`. Get the prefix from
  `node -e "console.log(Date.now())"`. Padded timestamps ending in `00000` are rejected by
  `make validate-migrations`.
- Class name: `<PascalName><timestamp>`, with a matching `name` property.
- Raw SQL, `IF NOT EXISTS` on create, `DROP … CASCADE` in `down`. Always write a real `down`.
- Audit columns are part of every table:
  `created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_by/updated_by/deleted_by
  INT REFERENCES users(id)`, `deleted_at TIMESTAMPTZ`, `is_deleted BOOLEAN NOT NULL DEFAULT false`.
- Unique indexes that must tolerate soft-deleted rows are partial
  (`WHERE is_deleted = false`) — `soft-delete-unique-index.spec.ts` checks this. This is what makes
  a deleted record fully re-creatable: after a soft delete, the same code and the same field values
  must be accepted again as a brand-new record (§3.6.2). A plain `UNIQUE` constraint would block
  that and is a defect. The one exception is a document number (e.g. `YC_2027_0001`):
  a generated document code stays unique across soft-deleted rows so a number is never issued
  twice; such an index is listed in `DOCUMENT_NUMBER_INDEXES` of `soft-delete-unique-index.spec.ts`
  and its creator retries on a lost race (`createWithDocumentCode`).
- Migrations are discovered per feature by glob (`getFeatureMigrationGlobs`), so a migration is
  only picked up once the feature is registered in the plugin's `*.features.ts` (§9).

### 2.7 Seeds

`database/seeds/seed-<feature>s.ts` exports `seed<Feature>s(ds: DataSource)`, idempotent, using a
`SEED_ITEMS: Array<Partial<Entity>>` list with realistic English demo data. Seeds run through
`runFeatureSeeds` in dependency order.

### 2.8 Backend tests

`services/<feature>.service.spec.ts` at minimum. Cover: create happy path, duplicate
code/name rejection, code immutability on update, delete blocked when referenced, list filtering.
Guards and utils with real branching (delete guards, code services, multipart parsers) get their
own spec. `NO_TESTS` or `0 tests + exit 0` is not a pass.

---

## 3. Frontend layout

A feature directory holds `constants.ts`, `types.ts`, `permissions/` (constants + typed keys),
`<feature>.feature.ts`, `schemas/`, `services/`, `hooks/` (`api/` + form-schema + enum options),
`utils/` (form payload + API error mapping), `components/` (ListPage · Table · DetailPage ·
DetailContent · FormFields · Create/Edit modals) and `tests/`. File-by-file listing and
skeletons: [`references/frontend-templates.md`](references/frontend-templates.md).


Route files stay thin — they only mount the component:

```
frontend/src/app/[locale]/<plugin>/<feature>/page.tsx        → <Feature>ListPage
frontend/src/app/[locale]/<plugin>/<feature>/[id]/page.tsx   → <Feature>DetailPage
```

```tsx
"use client";
import { SurfaceTreatmentMaterialListPage } from "@/plugins/master-data/surface-treatment-material/components/SurfaceTreatmentMaterialListPage";

export default function SurfaceTreatmentMaterialPage() {
  return <SurfaceTreatmentMaterialListPage />;
}
```

### 3.0 Every input comes from core UI

Porting a screen from the mock never means porting its markup. **Every input, control and layout
piece that already exists in `frontend/src/kernel/core/components/ui/` must be used as-is** — the
mock's raw `<input>`, `<select>`, `<textarea>` and hand-rolled widgets are translated to the core
component, not reproduced. What core provides today:

| Mock element | Core component |
|---|---|
| text / code input | `FormInput` (inside `FormField` + `FormControl`) |
| number input | `NumberInput` |
| date input | `DateInput` (filters: `DateFilterInput`, `DateRangeFilter`) |
| `<select>` | `FormSelect` in a form, `DropdownSelect` in a toolbar |
| `<textarea>` | `FormTextArea` |
| file / attachment | `FileInput` |
| pick another record | `RecordPickerField` / `RecordPickerDialog` |
| section grouping in a form | `FormSection` |
| search box | `SearchInput` |
| everything else | `Button`, `Modal`, `Table`, `Tabs`, `StatusBadge`, `ClassificationBadge`, `Pagination`, `EmptyState`, `ErrorState`, `LoadingState`, `ConfirmDialog`, `PageHeader`, `DetailPanel*`, `Detail*` |

Read the directory before writing a component — the list above ages, the directory does not.

**When core has no component for it**, the input is added to
`frontend/src/kernel/core/components/ui/` as a generic, feature-agnostic component and used from
there. Do not build it inside the feature folder: the next feature must be able to reuse it. A new
core component carries no feature-specific labels, enum values or business rules — those arrive as
props and i18n keys.

**When a feature genuinely needs different behaviour from core**, override locally rather than
bending core for everyone: extend the core component through its props, or wrap it in a feature
component that renders it. Change core itself only when the new behaviour is right for every
existing caller; otherwise the deviation stays in the feature and the report says which core
component was overridden and why.

The rule is one-way: core first, extend core when it is missing, override per feature when it
differs. A feature never ships a private copy of something core already does.

### 3.1 `constants.ts`

Holds everything a screen would otherwise hard-code:

It holds the code prefix, `<featureCamel>PageRoutes`, `<featureCamel>ApiRoutes`,
`<FEATURE>_LIST_PREFERENCE_KEY`, `<featureCamel>QueryKeys`, the enum items array and any upload
limits. Template:
[`references/frontend-templates.md`](references/frontend-templates.md#constantsts).

Enums are declared as an **items array** carrying the value and its badge colour; the value union
type, the value list and a by-value lookup are derived from it. Labels never live here — they come
from i18n.

### 3.2 Service + hooks

`services/` exports one plain async function per endpoint using `api` from
`@/kernel/core/api/api`. Multipart is built with `buildJsonMultipart` +
`multipartRequestConfig()`, and is used **only** when a file or a `remove*` flag is present.

`hooks/api/use<Feature>.ts` wraps them in react-query:
- queries use `staleTime: DEFAULT_LIST_STALE_MS`;
- mutations use `useMutationFeedback` + `useToastMutationFeedback("<featureCamel>.toast")` and
  invalidate `queryKeys.all` (plus `queryKeys.detail(id)` on update);
- bulk delete uses `useBulkDeleteMutation`.

### 3.3 List screen — mandatory capabilities

Every list screen ships **all** of the following. A list missing one of them is not done, even if
the spec does not restate it — the spec describes what is specific to the feature, this document
describes what every list has.

| # | Capability | Implementation |
|---|---|---|
| 1 | Free-text search | `SearchInput` + `useCommittedSearch` (commit on Enter). Backend searches the fields listed in `buildIlikeOrWhere` |
| 2 | Toolbar filters | One `DropdownSelect` per filter axis in the mock, `"all"` sentinel = no filter, debounced via `useDebouncedValue` |
| 3 | Per-column filters | `useTableColumnFilters` + the `/column-values` endpoint. A column is `filterable` **only** if the service's `ColumnFilterMap` exposes it |
| 4 | Show/hide columns | `columnPreferenceKey={<FEATURE>_LIST_PREFERENCE_KEY}` on `Table`; the key must be registered in `LIST_PREFERENCE_MODULE_KEYS` (§9) or the choice is silently dropped |
| 5 | Row selection + bulk delete | `useBulkSelection` + `BulkDeleteAction`, wired to `useBulkDeleteMutation` and the backend `@BulkDeleteEndpoint` |
| 6 | Single-row delete with guard | Call `can-delete` first; on `false` surface the reason via `useDeleteFailureReason`; confirm through `useDeleteConfirmation` / `ConfirmDialog` |
| 7 | Pagination | `DEFAULT_LIST_PAGE_SIZE` + `computePaginationMeta`; every filter or search change resets to page 1 |
| 8 | Sorting | Only over the fields whitelisted in the service's `resolveListSort` |
| 9 | Create / Edit | Modals, gated by `PermissionGate` / `can(...write)` |
| 10 | Row click → detail | The whole row navigates. **No eye icon** — the Actions column holds only mutating actions |
| 11 | Empty + error states | `EmptyState` with `resolveListEmptyMessage` (distinguishes "no data" from "no match"); `useQueryErrorToast` for load failures |
| 12 | Import / Export Excel | Only when the mock and the Function List show them for this feature. If not implemented yet, leave the row out rather than shipping a dead button |

Compose these from the kernel — do not re-implement: `ListPageLayout`, `ListToolbar`,
`ListQueryBody`, `PageHeader`, `PageToolbarActions`, `SearchInput`, `DropdownSelect`,
`EmptyState`, `ConfirmDialog`, `BulkDeleteAction`, `PermissionGate`.

Everything write-related is permission-gated: the create button, the row edit action, the row
delete action and the bulk-delete bar each check `can(<Feature>Permission.write | .delete)`.
A user with read-only access sees a clean list with no disabled-but-visible controls.

### 3.4 Table

`<Feature>Table` renders the kernel `Table` with `columns`,
`columnPreferenceKey={…_LIST_PREFERENCE_KEY}` and the column-filter host props
(`TableColumnFilterHostProps`). Rules:

- Column set, order and labels come from the mock (§6); labels resolve through i18n.
- Leading checkbox column for selection, trailing Actions column for edit/delete only.
- Enum cells render `ClassificationBadge` using the `colorClass` from the enum items array.
- Every column visible in a picker popup must be searchable from that popup.

### 3.5 Detail page

`<Feature>DetailPage` reads the id from the route, fetches via the detail hook, renders
`<Feature>DetailContent`. **No back button** — the breadcrumb returns to the list, and the header
holds only mutating actions.

Detail header actions are **icon-only** — no text label next to the icon, even when the mock draws
one. The label lives in the `aria-label` / tooltip and resolves through i18n. Add a visible text
label only when an input explicitly requires it (original spec `UI copy (VI)` or the Function List
naming the button text); state which input required it in the report.

### 3.6 Modals

Create/Edit modals share `<Feature>FormFields` and the zod schema from
`use<Feature>FormSchema` (localized messages). Modals read their input from `modalPayload`;
screens never mount their own copy of a modal.

#### 3.6.1 Code fields — auto-suggested, still editable

Every `code` field is **auto-generated and editable**. The modal pre-fills the next code from the
feature's prefix when it opens for create, and the user may overwrite it; whatever is in the input
is what gets submitted and stored. Do not render it read-only, disabled or as static text, and do
not drop it from the payload. The mock does not show this behaviour correctly — the mock is not the
authority here (§6.3).

- Create: pre-fill the suggestion, leave the field enabled.
- Edit: the existing code is loaded and remains editable unless an input explicitly forbids it.
- Validation is unchanged either way — `@IsMasterDataCode(<PREFIX>, …)` on the DTO and
  `masterDataCodeSchema` in the zod schema, so a hand-typed code is checked like any other.
- Uniqueness is enforced by the backend against non-deleted rows only; a collision surfaces as a
  field error through `map-<feature>-api-errors.ts`, never as a silent rename.

**The collision path is a required, tested behaviour — not a nicety.** Because the code is
suggested from the highest one in use, two actors filling the form at the same time are handed
the same ordinal and the second save loses the race. That must land on the code input, in
Vietnamese, telling the user to bump the number. The failure mode is invisible if you skip it:
`shouldSuppressInlineFormErrorToast` withholds the toast for any message naming a taken value,
expecting the form to show it inline, so a mapper with no rule for the code shows **nothing at
all** — Save fails and the user has no idea why. Three concrete requirements:

- The mapper has an `isDuplicateConflictError` branch pointing at the field that holds the code,
  whatever it is named (`code`, `prId`, `poNo`, `rfqCode`). Routing every conflict to `name`
  marks the wrong input and hides the one the user must correct.
- The message comes from `validation.codeExists` in **both** locales, never from the raw
  `apiMessage` — that is the server's English log wording.
- The backend translates the race, not just the pre-check: wrap the insert in
  `rethrowUniqueViolation` (or `saveWithGeneratedCode` when it should retry) so the loser gets a
  409 instead of a 500.

A mapper unit test asserting the code field receives `codeExists` is part of §3.7.

#### 3.6.2 A deleted record can be created again, identically

Deletion is soft, but it must be invisible to the user creating the next record. After a record is
deleted, creating a new one with **exactly the same code and the same field values must succeed**
and produce a fresh row. No "code already exists" error, no revival of the old row, no forced
suffix. This depends on the partial unique index (`WHERE is_deleted = false`, §2.6) and on every
uniqueness check in the service filtering `isDeleted = false`. Cover it with a backend service test
that deletes and then re-creates the identical payload.

#### 3.6.3 Fields that never enter the modal

**No created-date input — on a master-data catalogue.** When the mock's modal has a "Ngày tạo" /
created-date field, drop it on the way into the repo — `createdAt` is owned by `BaseEntity` and set
by the server, so it is never part of the create/edit payload, the DTO or the zod schema. The same
applies to any other audit column the mock exposes as an input (`updatedAt`, creator). They may
still be **displayed** on the detail page.

The mock says which of the two a screen is, and it is consistent about it: a master-data form
carries the date as `<input type="hidden" class="auto-today">`, while a transaction form draws a
visible `<input type="date">` — compare `modalForms.cty` with `modalForms.rfq` in
`Sales_Module_Demo2.html`. Read the mock's own markup rather than the label; both say "Ngày tạo".

**A transaction document's date is a real field.** Outside the catalogues the date is the business
day the document was raised, and it has its own column — `rfq.created_date`,
`purchase_requests.request_date`, `purchase_orders.order_date`, `orders.order_date`,
`quotation_versions.version_date`, `*_documents.doc_date`. It is a user-entered field:
pre-filled with today, editable, back-datable, and **never later than today**. That rule belongs
in three places at once, and all three must agree:

- the DTO declares it with `@IsDateOnly()` (never `@IsDateString()`, which also accepts a
  timestamp), required on create and optional on update;
- the service calls `assertBusinessDateNotFuture(date, '<Label>')` on create *and* on update, so a
  hand-crafted request cannot post a future date;
- the form defaults the picker to `appToday()` and caps it with `max={appToday()}`, and the zod
  schema refines on `value <= appToday()` with a localized message.

Use `appToday()` on both sides — `@shared/utils/document-validity.util` on the backend,
`@/kernel/core/lib/app-today` on the frontend — never `new Date().toISOString().slice(0, 10)`.
That is the **UTC** date, which is still yesterday for the first seven hours of every Hanoi day: a
picker capped at it refuses the day the actor is working on, and a default taken from it back-dates
the record by one day without saying so.

Where a second date is bounded by this one (`quoteDueDate >= createdDate`, `eta >= orderDate`),
compare the values that will end up **stored**, not only the submitted ones, and run the check
whenever *either* side is submitted. Gating it on one field lets the pair be broken by editing them
one at a time.

### 3.7 Frontend tests

`tests/*.test.ts(x)` with vitest. Tests must exercise real wiring — render the actual composition
and mutation-test the guard, rather than asserting on a hand-built stub. Two are always present:

- a list/permission wiring test that renders the real screen;
- `tests/map-<feature>-api-errors.test.ts`, asserting that a 409 naming a taken code sets
  `validation.codeExists` on the code field (§3.6.1). This one exists because that path fails
  silently in the browser — there is no visible symptom to notice it by.

---

## 4–7. The input authorities

Four of the five inputs have their own reference:
[`references/input-authorities.md`](references/input-authorities.md).

| § | Input | Authority on |
|---|---|---|
| §4 | Original + engineering specs (`docs/original-specs/…`) | Field list, coding rules, badge set, VI UI copy — **use the highest version** |
| §5 | Function List (`docs/permission/`) | The role × function matrix — **use the newest dated revision** |
| §6 | Mock UI (`docs/html-css-js-mock/Sales_Module_Demo2.html`) | Layout, column set and order, filter axes, labels — screen `id="view-<slug>"` |
| §7 | Data flow (`docs/system-data-flow/`, `docs/system-diagram/`) | Field ownership, statuses, where the feature sits in the 21-flow chain |

Read the sections your feature touches before writing code. All five inputs are reconciled against
each other **first**; report any disagreement instead of resolving it silently (§6.4).

Three rules from there are quoted here because they are violated most often:

- The mock is not authoritative on capabilities. Per-column filters, show/hide columns and bulk
  delete ship regardless of whether the mock draws them (§3.3).
- The mock is not authoritative on code fields, the eye icon, detail-action labels, or created-date
  inputs (§6.3, §3.5, §3.6).
- Statuses and field ownership come from the flow docs only — never from the mock, never invented
  (§7).

---

## 8. i18n

- One namespace per feature: `frontend/src/kernel/langs/{vi,en}/<featureCamel>.json`.
- Register both files in `frontend/src/kernel/langs/load-messages.ts` (`enMessages` and
  `viMessages`).
- Add `titles.<featureCamel>` to `modal.json` in both locales for the create-modal title.
- Required groups: field labels · list chrome (`addButton`, `searchPlaceholder`, `noItems`,
  `noItemsFound`, `emptyValue`) · `categories.*` (one per enum member, keyed by the **English
  value**) · `placeholders.*` · `toast.*` (`createSuccess`, `updateSuccess`, `deleteSuccess`,
  `systemError`, one per delete-failure reason) · `validation.*` (one per schema message).
  The complete set: [`references/i18n-keys.md`](references/i18n-keys.md).
- vi and en must have identical key sets, and enum **values** stay English while only the label
  differs (§1 rule 4). `npm run lint:i18n` fails otherwise — it is the most common late failure,
  so diff the two key sets by eye before the verification pass.
- vi wording comes from the original spec's `UI copy (VI)` section and the mock's labels, not
  from a translation of the English.

---

## 9. Registration checklist

A feature is invisible until every one of these is done. The complete list — including the
Function List spec rows, the plugin nav-label bundle, `modal.json` and `plugin-api-routes.test.ts`,
each enforced by a test rather than at write time — is
[`references/codebase-map.md`](references/codebase-map.md) §5.

**Backend**

1. `backend/src/plugins/<plugin>/<plugin>.features.ts` — add the `ErpFeature` entry:
   ```ts
   {
     key: 'surface-treatment-material',
     plugin: 'master-data',
     // dependsOn: ['product'],         // only when it truly depends on another feature
     module: SurfaceTreatmentMaterialModule,
     permissions: surfaceTreatmentMaterialPermissions,
     seed: seedSurfaceTreatmentMaterials,
   }
   ```
   This single entry wires the Nest module, the permission catalog, the seed order **and** the
   migration glob. A feature missing here has its migrations silently skipped.
2. `backend/src/kernel/core/database/seeds/seed-roles.ts` — grant the new scopes to the roles
   that need them (`director` already has `*:*`).
3. `backend/src/kernel/core/users/list-preference.constant.ts` — add
   `<feature_key>_list` to `LIST_PREFERENCE_MODULE_KEYS` (closed registry; an unknown key
   silently loses the user's column choice).

**Frontend**

4. `frontend/src/plugins/<plugin>/<plugin>.features.ts` — add the feature to the array (order
   here is the navigation order).
5. `<feature>.feature.ts` — nav item: `href`, `icon`, `label` (i18n key), and
   `permissions: ["<feature_key>:read", "<feature_key>:*"]`.
6. `frontend/src/kernel/langs/load-messages.ts` — register both locale bundles.
7. `frontend/src/app/[locale]/<plugin>/<feature>/{page.tsx,[id]/page.tsx}`.

**Optional**

8. New plugin (not just a new feature): follow `docs/scaffold/new-plugin/README.md` and register
   in `enabled-plugins.ts` on both sides.
9. Feature toggling is by env: `ENABLED_FEATURES` (backend) /
   `NEXT_PUBLIC_ENABLED_FEATURES` (frontend). Declared `dependsOn` is validated at boot.

---

## 10. Build order

Work in this sequence — each step is verifiable before the next begins.

1. Read and reconcile all five inputs: the original spec at its highest version and the
   engineering spec (§4), the **newest** Function List rows for this feature (§5), the mock screen
   (§6), and the flows that touch this data (§7). Report disagreements before coding.
2. Backend: enum → entity → migration → permissions → DTOs → service → controller → module.
3. Register the feature (§9 steps 1–3), then `make migrate && make seed`.
4. Regenerate the API contract: `npm run generate:api-docs` (backend), then
   `npm run generate:api` (frontend) followed by `prettier` + `eslint --fix` on the generated file.
5. Frontend: constants → types → permissions → service → hooks → schema → table → list page →
   modals → detail page.
6. i18n bundles + registration (§8), routes (§9 step 7).
7. Tests: backend service spec, frontend wiring test.
8. Verify — one pass, at the end (§11).

---

## 11. Verification

**Verify once, at the end.** Generate the whole feature first — backend, registration, frontend,
i18n, routes, tests — and only then run the suite. Running `make lint` or `make test` between
steps burns minutes and tokens for a signal the final pass gives you anyway.

The two exceptions are commands producing input you cannot invent: `node -e "Date.now()"` for the
migration timestamp, and `generate:api-docs` → `generate:api` for the frontend client.

Run from the repo root, `format` first so a formatting fix cannot re-trigger lint:

```bash
make format
make lint
make typecheck
make test
make validate-migrations
```

Then the database and contract checks:

```bash
make migrate && make seed      # applies on a clean DB; seeds are idempotent
make validate-api-docs         # only when the OpenAPI surface changed
```

Collect every failure, fix in one batch, then re-run only what failed. Scan
[`references/pitfalls.md`](references/pitfalls.md) first — most failures are on that list.

A change is not done until all five pass on the current run. A green build is not evidence of a
working feature — exercise the screen (`make up`) or write the test that proves the behaviour.

---

## 12. Definition of done

- [ ] Entity, migration and seed exist; `make migrate && make seed` succeed on a clean DB.
- [ ] All ten standard endpoints present (or the omission is deliberate and stated).
- [ ] Every endpoint gated by a permission **constant**.
- [ ] Scopes seeded to exactly the roles the **newest** Function List marks `●`; `ROW_SCOPES` in
      `seed-roles.function-list.spec.ts` extended and the spec passing; the revision used is named
      in the report.
- [ ] Columns, order, labels and filter axes match the `Demo2` mock screen.
- [ ] Fields, coding rule, badge set and UI copy match the highest-version original spec (§4.1);
      its `Open points` are resolved or escalated, not silently decided.
- [ ] Field producers/consumers, statuses and cross-plugin access match the flow docs and the
      newest system diagram (§7); no invented status or transition.
- [ ] Column filter map exported by the service and matched by the table's `filterable` columns.
- [ ] Soft delete honoured on every read path; delete blocked when referenced.
- [ ] Feature registered in both `*.features.ts` catalogs and in `LIST_PREFERENCE_MODULE_KEYS`.
- [ ] vi + en bundles complete and registered; no Vietnamese outside the vi bundle.
- [ ] Enum values English; labels only from i18n.
- [ ] List screen has all 12 mandatory capabilities (§3.3): search, toolbar filters, per-column
      filters, show/hide columns, bulk delete, guarded single delete, pagination, sorting,
      create/edit modals, row-click detail, empty/error states, import/export where specified.
- [ ] `<feature_key>_list` registered in `LIST_PREFERENCE_MODULE_KEYS` so column choices persist.
- [ ] Read-only users see no write/delete controls at all (not disabled ones).
- [ ] List, detail and both modals reachable and permission-gated.
- [ ] No created-date input in either modal; no eye/view icon in the Actions column; detail header
      actions icon-only — unless an input explicitly required it and the report says which.
- [ ] Every input uses a core UI component; anything genuinely missing was added to
      `kernel/core/components/ui/` as a reusable component, and any per-feature deviation from core
      is named in the report (§3.0).
- [ ] Code field auto-suggested on create and editable in both modals; a hand-typed code passes the
      same validation.
- [ ] A duplicate code answers 409 (not 500) and shows `validation.codeExists` under the code
      input — whatever that field is named — proven by a mapper unit test. Never a bare toast, an
      English server sentence, an error on the name field, or a silent failed save (§3.6.1).
- [ ] Deleting a record and re-creating it with the identical code and values succeeds, proven by a
      backend test.
- [ ] Backend service spec + frontend wiring test added and passing.
- [ ] `format`, `lint`, `typecheck`, `test`, `validate-migrations` all green.

---

## 13. Prompt template for AI agents

```
Implement feature <feature> in plugin <plugin>.

FIRST: read docs/feature-standard/feature-development-standard.md and follow it exactly.
Then read docs/feature-standard/references/intake.md and normalize the request below.

PO/BA request (the business input — text or file):
<<<
  <paste the PO/BA text here, or give the file path>
>>>
Reference implementation: backend/src/plugins/master-data/surface-treatment-material/
                          frontend/src/plugins/master-data/surface-treatment-material/

Inputs (read and reconcile ALL of these before coding):
- Original spec: docs/original-specs/<plugin>/<feature>/  — use the highest -v0N file
- Engineering spec: specs/<plugin>/<feature>/
- Permissions:   docs/permission/  — `ls` it and use the NEWEST dated Function List;
                 rows <STT range>. Also read permission-convention.md
- Mock UI:       docs/html-css-js-mock/Sales_Module_Demo2.html — screen id="view-<slug>"
- Data flow:     docs/system-data-flow/ERP_Hai_Phuong_Dien_Giai_Luong_Du_Lieu.md (flow index)
                 docs/system-data-flow/ERP_Phan_tich_Luong_Chi_tiet.md (flow <n> detail)
                 docs/system-diagram/  — use the highest V<n> image

Fields: <list>
Code prefix: <PREFIX_>  (or: no business code)
Permissions: <feature_key>:read | :write | :delete
Enums: <name> = <english camelCase values>
Files/uploads: <none | list>

Procedure: docs/feature-standard/references/runbook.md — follow its steps in order.
Templates: docs/feature-standard/references/{backend,frontend}-templates.md
i18n keys: docs/feature-standard/references/i18n-keys.md

Language rules (non-negotiable):
- Enum members, stored values, identifiers, comments, Swagger text, validator
  messages and seed data are ENGLISH. A Vietnamese comment fails the build.
- Every user-visible string resolves through useTranslations and exists in BOTH
  langs/vi and langs/en. Nothing user-visible is hard-coded in a component.
- The i18n key equals the English enum value; only the translated label differs.

Migrations: filename `<Date.now()>-<kebab>.ts`, class name carries the same
timestamp, no rounded/padded value, full audit columns, real down(), partial
unique index (WHERE is_deleted = false) where soft delete applies.

Verification: generate EVERYTHING first, then run make format / lint / typecheck /
test / validate-migrations ONCE and fix in one batch. Do not run them between steps.

The list screen must have all 12 capabilities in §3.3 — including per-column filters,
show/hide column settings and bulk delete — even if the mock does not show them.
Derive the role matrix from the newest Function List (§5) and extend
seed-roles.function-list.spec.ts; do not invent scopes or grants.
Take columns, column order, filter axes and labels from the mock screen (§6).
Take field ownership, statuses and cross-plugin boundaries from the flow docs (§7);
do not invent a status or a transition.

Do not skip the registration checklist (§9) or the verification commands (§11).
Report which of the §12 checkboxes are met and which are not; name the original-spec
version, Function List revision and system-diagram version you used; and list any
disagreement found between original spec, engineering spec, Function List, mock and
flow docs.
```
