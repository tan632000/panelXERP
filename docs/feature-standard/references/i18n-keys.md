# i18n key set

Two files per feature, identical key sets, different values:

```
frontend/src/kernel/langs/en/<featureCamel>.json
frontend/src/kernel/langs/vi/<featureCamel>.json
```

Both must be registered in `frontend/src/kernel/langs/load-messages.ts` — once in `enMessages`,
once in `viMessages`. A missing registration compiles fine and fails at runtime.

`npm run lint:i18n` enforces: identical key sets across locales, and enum **values** English while
only labels are translated.

---

## Required keys

Derived from `en/surfaceTreatmentMaterial.json`. Drop only the groups your feature genuinely does
not have (file uploads, extra field labels).

```jsonc
{
  // ── Screen chrome ────────────────────────────────────────────
  "title": "Surface treatment materials",
  "description": "Manage surface treatment material catalogue",
  "detailTitle": "Material detail",
  "detailNotFound": "Material not found",

  // ── Field labels — one per column and per form field ─────────
  "code": "Material code",
  "codeAuto": "Auto-generated",
  "name": "Material name",
  "classification": "Classification",
  "manufacturer": "Manufacturer",
  "notes": "Notes",
  "createdDate": "Created date",

  // ── Form section headings ────────────────────────────────────
  "infoBasic": "Basic information",
  "infoDocs": "Documents",

  // ── List chrome ──────────────────────────────────────────────
  "addButton": "Add material",
  "searchPlaceholder": "Search by code, name, manufacturer...",
  "filterClassification": "Classification",
  "selectPlaceholder": "Select...",
  "noItems": "No materials yet",
  "noItemsFound": "No materials match your filters",
  "paginationItem": "materials",
  "emptyValue": "—",
  "emptyNotes": "No notes",

  // ── Modals & confirmation ────────────────────────────────────
  "editModalTitle": "Edit material",
  "confirmDeleteTitle": "Delete material?",
  "confirmDeleteDescription": "This action cannot be undone.",

  // ── File upload (only for features with documents) ───────────
  "documentsHint": "PDF, DOC, DOCX, XLSX · max 20MB",
  "noFileSelected": "No file selected",
  "chooseFile": "Choose file",
  "replaceFile": "Replace file",

  // ── Enum labels — one per enum member, English VALUE as key ──
  "categories": {
    "cleaningChemical": "Cleaning chemical",
    "platingBathChemical": "Plating bath chemical",
    "other": "Other"
  },

  // ── Input placeholders — one per free-text field ─────────────
  "placeholders": {
    "code": "HC_0001",
    "name": "Enter material name",
    "manufacturer": "Enter manufacturer",
    "notes": "Enter notes"
  },

  // ── Toasts — REQUIRED, the mutation hooks read these ─────────
  "toast": {
    "createSuccess": "Material created",
    "updateSuccess": "Material updated",
    "deleteSuccess": "Material deleted",
    "deleteInUseDocument": "Cannot delete: referenced by business documents",
    "systemError": "Something went wrong. Please try again.",
    "forbidden": "You do not have permission to perform this action"
  },

  // ── Validation — REQUIRED, the zod schema reads these ────────
  "validation": {
    "codeRequired": "Material code is required",
    "codeMax": "Material code must not exceed 30 characters",
    "codePrefix": "Material code must start with HC_",
    // Required wherever a code is auto-suggested, including transaction features whose code
    // field is named differently (prId, poNo, rfqCode). Word it as the correction to make, not
    // just the fact — the reader has to bump the ordinal themselves. See §3.6.1.
    "codeExists": "Material code already exists. Please change the ordinal.",
    "nameRequired": "Material name is required",
    "nameMax": "Material name must not exceed 255 characters",
    "nameExists": "This material name already exists",
    "classificationRequired": "Classification is required",
    "manufacturerMax": "Manufacturer must not exceed 255 characters",
    "notesMax": "Notes must not exceed 2000 characters",
    "fileSize": "File must not exceed 20MB",
    "fileFormat": "Unsupported file format"
  }
}
```

---

## Keys outside the feature bundle

| File | Key | Why |
|---|---|---|
| `modal.json` (en + vi) | `titles.<featureCamel>` | The create modal title |
| `modal.json` (en + vi) | `titles.edit<Feature>` | Only if the edit modal uses a distinct title |
| `<plugin>.json` | the nav `label` from `<feature>.feature.ts` | The sidebar entry |

`common.json` and `status.json` are shared — reuse `common.save`, `common.cancel`,
`common.actions` rather than adding feature-local copies.

---

## Rules

1. **Enum keys are the English value.** `categories.cleaningChemical`, never
   `categories.hoaChatTayRua`. The stored value and the key are the same string.
2. **One `validation.*` key per schema message**, matching the `<Feature>ValidationMessages`
   interface field-for-field. A missing key surfaces as the raw key text in the form.
3. **One `toast.*` key per mutation outcome**, plus one per delete-failure reason returned by
   `resolve<Feature>DeleteToastKey`.
4. **vi is the customer-facing wording** — take it from the original spec's `UI copy (VI)`
   section and from the mock's labels, not from a machine translation of the English.
5. Never put Vietnamese anywhere else: not in code, comments, enum values, Swagger text or log
   messages. `erp/no-vietnamese-comments` fails the build.
