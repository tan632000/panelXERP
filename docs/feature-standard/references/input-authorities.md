# Input authorities — specs, permissions, mock, data flow

Extracted from `feature-development-standard.md` §4–§7. Four of the five inputs listed in the
contract's *Start here* table are described in full below; each is authoritative on a different
thing and none may be guessed at. Read the ones your feature touches **before** writing code, and
report disagreements between them instead of silently picking one.

| Section | Input | Authority on |
|---|---|---|
| §4 | `docs/original-specs/<plugin>/<feature>/` | Field list, coding rules, badges, VI UI copy |
| §5 | `docs/permission/` | Which role gets which function |
| §6 | `docs/html-css-js-mock/Sales_Module_Demo2.html` | Layout, column set and order, filter axes, labels |
| §7 | `docs/system-data-flow/` + `docs/system-diagram/` | Field ownership, statuses, position in the 21-flow chain |

Section numbers are kept as they were in the contract so existing cross-references still resolve.

---

## 4. Specs — original and engineering

Two spec layers, read in this order.

### 4.1 `docs/original-specs/<plugin>/<feature>/`

The customer's own requirement document, in Vietnamese, versioned `-v01`, `-v02`, …
**Always use the highest version present** (`masterdata-cong-cu-dung-cu-v02.md`, not `-v01`),
and say which version you worked from.

Its sections map onto the code as follows:

| Spec section | Produces |
|---|---|
| `Data model` → `Trường dữ liệu` | Entity columns, DTO fields, validation limits |
| `Quy tắc mã hóa` | The code prefix constant and `@IsMasterDataCode` rule |
| `Trạng thái badge (list)` | The enum members and their `colorClass` in the frontend items array |
| `Actors & phân quyền` → `Ma trận chức năng` | The feature-local view of the role matrix — cross-check against §5 |
| `Requirements` | Acceptance criteria per operation (list / detail / add / edit / delete) |
| `Quy ước UI chung` | Dropdown, truncate and other shared UI behaviour |
| `UI copy (VI)` | The `langs/vi/<featureCamel>.json` values — English equivalents go in `langs/en/` |
| `Open points` | Must be resolved or escalated; never silently decided by the implementer |

### 4.2 `specs/<plugin>/<feature>/`

The engineering spec (Specs v2.1): `spec.json` is machine authority, Markdown is a human
projection. It carries scope, acceptance and the task breakdown. Work one task file at a time and
keep `task_registry` in sync — see `.claude/rules/state-sync.md`.

When the two disagree, the original spec wins on *what the business needs* and the engineering
spec wins on *how the work is cut*. A contradiction in the business requirement is escalated, not
resolved by the implementer.

---

## 5. Permissions — derived, never invented

Permission scopes have **two** authorities that must agree. An agent may not invent a scope, and
may not decide who gets it.

1. **The specs** (§4) — what the feature does.
2. **The Function List** in `docs/permission/` — the customer's matrix of 438 functions × 17
   actors, `●` = granted. This is the authority on **which role gets which function**.

The two are reconciled before any code is written. Where they disagree, the Function List wins on
the role matrix and the spec wins on behaviour; a genuine conflict is escalated, not guessed.

`docs/permission/permission-convention.md` describes the scope naming and guard conventions —
read it alongside this section.

### 5.1 Always use the newest Function List

`docs/permission/` holds the dated revisions the customer has issued (newest at time of writing:
`ERP_Function List - Function List-14-09-2026.csv`, 454 functions).

- **Pick the file with the latest date in its name** — not the one this document names, not the one
  an older task file names. Always `ls docs/permission/` first.
- The `.csv` is the customer's raw export and is what the guard test parses. Older revisions were
  also kept as an `.md` projection; the current folder carries the `.csv` alone.
- A revision may add actors, change grants on existing actors, add whole rows, or renumber the
  ones after an insertion. The 14-09 revision did all four: it filled in the three revenue modules
  Sales had left blank, added a price-visibility row to several groups, and shifted every Sales STT
  from 3.44 on.
- When you adopt a newer file, update `FUNCTION_LIST_RELATIVE_PATH` in
  `seed-roles.function-list.spec.ts`, re-check the expected counts asserted there (`allRows`
  length, covered-row length, the unscoped-row count) **and** re-check the STT → scope map: an
  inserted row renumbers everything below it in that module.
- State in your report which revision you reconciled against.

### 5.2 Actor → seeded role

The Function List is written in Vietnamese actor codes; code uses English role codes.
`backend/src/kernel/core/database/seeds/seed-roles.function-list.spec.ts` holds the mapping —
read it rather than re-deriving it.

`GĐ`→`director` · `TPS`→`sale_manager` · `NVS`→`sale_staff` · `TPKT`→`technical_manager` ·
`NVKT`→`technical_staff` · `TPKH`→`planning_manager` · `NVKH`→`planner` · `TPMH`→`purchase_manager` ·
`NVMH`→`purchase_staff` · `TPQC`→`qc_lab_manager` · `NVQC`→`qc_lab_staff` · `TK`→`warehouse_keeper` ·
`QĐCK`→`mechanical_manager` · `QĐXL`→`surface_treatment_manager` · `QĐĐG`→`packaging_manager` ·
`KTT`→`chief_accountant` · `NVKTO`→`accounting_staff`

`director` holds `["*:*"]` and is never edited per feature.

### 5.3 Function row → scope

Master-data features appear in the Function List as a fixed **six-row group**. Map them exactly:

| Function row | Scope |
|---|---|
| Xem danh sách / Xem chi tiết | `<feature_key>:read` |
| Thêm mới | `<feature_key>:write` |
| Cập nhật / Sửa | `<feature_key>:write` |
| Xóa | `<feature_key>:delete` |
| Export Excel | *(no scope yet)* |
| Import Excel | *(no scope yet)* |

Deviations that already exist and are deliberate — follow the same reasoning if your feature is
similar rather than inventing a new axis:

- **Sub-entities have no own scope.** Company/supplier contacts are guarded by the parent's
  `company:write` / `supplier:write`.
- **Split write.** `product:write:general` vs `product:write:technical` when two departments own
  different field groups. `RolesGuard` admits a user holding *any* listed scope.
- **Extra verbs** only when the Function List has a matching row: `:approve`, `:approve:step1`,
  `:cancel`, `:export`, `:import`, `:notify`, `:confirm`.
- **Delete guarded by write** where the customer treats removal as an edit (delivery plans).

### 5.4 Seeding and the guard test

Add the new scopes to the roles the **newest** Function List marks `●` in
`backend/src/kernel/core/database/seeds/seed-roles.ts`, then extend `ROW_SCOPES` in
`seed-roles.function-list.spec.ts` with the new function row numbers.

That spec parses the Function List document itself and compares it to the seeded grants — it is
the mechanism that catches drift between the customer's matrix and the code. **Do not weaken or
skip it.** A row with no endpoint yet maps to `[]` and is reported separately rather than
silently passing.

### 5.5 Frontend gating

The frontend mirrors, never re-decides. `permissions/<feature>-permission.keys.ts` restates the
backend constants; every control calls `can(<Feature>Permission.x)` or wraps in `PermissionGate`;
the nav item declares `permissions: ["<feature_key>:read", "<feature_key>:*"]`. Literal permission
strings are a lint error on both sides.

---

## 6. Mock UI — the visual contract

`docs/html-css-js-mock/Sales_Module_Demo2.html` is the **authority on layout, column set, column
order, filter axes and Vietnamese labels**. Read the feature's screen there before writing any
component. (`Sales_Module_Demo.html` is the older revision — use `Demo2`.)

### 6.1 Finding the screen

Each screen is a `<div class="view" id="view-<slug>">` where `<slug>` is the Vietnamese
abbreviation (`ccdc` = tool-equipment, `cgsx` = production-process, `cty` = company,
`bq` = quotation …). Its render logic sits in a `filter<SLUG>()` / `render<SLUG>()` function
further down the file. Locate both:

```bash
grep -n 'id="view-ccdc"' docs/html-css-js-mock/Sales_Module_Demo2.html
grep -n "ccdc-body\|filterCCDC" docs/html-css-js-mock/Sales_Module_Demo2.html
```

### 6.2 What to take from it

| Mock element | What it fixes |
|---|---|
| `<div class="tb">` toolbar | Which controls exist and their order: search box, then filter `<select>`s, then right-aligned Import/Export |
| `<select class="fb">` options | The enum's member set — each option becomes an English enum value plus a vi/en label |
| `<thead>` cells | Column set, **column order**, and the Vietnamese header labels |
| Leading `<th><input type="checkbox">` | Bulk selection is expected on that list |
| Trailing empty `<th>` | The Actions column |
| `<div class="pgn">` | The count/pagination footer |
| Side panel `id="dp-<slug>"` | The fields the detail view must show |

### 6.3 What **not** to take from it

- Vietnamese identifiers. The mock's `phanLoai` becomes `classification`; its option text becomes
  an English camelCase enum value, with the Vietnamese text moved into `langs/vi/<featureCamel>.json`.
- Inline styles and the mock's ad-hoc markup — always use the kernel components.
- Missing capabilities. The mock predates per-column filters and column show/hide; those are
  required regardless of whether the mock shows them (§3.3).
- Created-date inputs in modals. A "Ngày tạo" field in a create/edit modal is dropped — `createdAt`
  comes from `BaseEntity` (§3.6).
- The eye / view icon. Detail is reached by clicking the row; the Actions column holds only
  mutating actions (§3.3 #10).
- Text labels on detail action buttons. Detail header actions are icon-only (§3.5).
- Code-field behaviour. The mock renders codes inconsistently; the rule is always auto-suggested
  **and** editable (§3.6.1).

These three are dropped by default. Keep one only when an input explicitly requires it — name the
input and the requirement in the report.

### 6.4 Reconciliation rule

All five inputs are checked against each other **before** implementation: the original spec
supplies field semantics and validation, the engineering spec supplies scope and acceptance, the
Function List supplies the role matrix, the mock supplies columns and controls, and the flow docs
supply field ownership and statuses. Report any disagreement instead of silently picking one.

---

## 7. Data flow — where the feature sits in the chain

A CRUD screen is never standalone: its fields are produced by one department and consumed by
another. Before designing the entity, establish the feature's position in the flow chain.

### 7.1 Sources

| File | Use |
|---|---|
| `docs/system-data-flow/ERP_Hai_Phuong_Dien_Giai_Luong_Du_Lieu.md` | Index of all **21 flows** (13 main, 8 data). Each entry gives *Trigger · Data transmitted · Processing at the receiver · Output*. Start here to find which flows touch your feature |
| `docs/system-data-flow/ERP_Phan_tich_Luong_Chi_tiet.md` | Deep dive per flow: purpose, actors, what the ERP must do, the exact fields to store, the **status list**, worked examples, and which modules are involved |
| `docs/system-diagram/sơ đồ flow ERP_V<n>.jpg` | The overall diagram. **Use the highest `V<n>`** (currently `V2`); read it as an image, do not assume it matches an earlier revision |

The `.docx` siblings in `system-data-flow/` are the same content in the original format — read the
`.md` versions.

### 7.2 What to derive from them

1. **Producer and consumer of every field.** A field written by Engineering (e.g. product
   material weight, surface area, corresponding tool code) is read-only for Sales, and vice
   versa. This decides which fields are editable on which screen and whether the write scope
   needs splitting (`:write:general` vs `:write:technical`, §5.2).
2. **Statuses and transitions.** The flow analysis lists the statuses a document moves through.
   Never invent a status, and never allow a transition the flow does not describe.
3. **Trigger and output.** What creates a record, and what the record must contain before the
   next department can act on it. That is your minimum required-field set.
4. **Plugin boundaries.** If the flow crosses departments that live in different plugins, the
   read goes through a `_shared/gateways/` gateway or a domain event — never a direct
   service/entity import (§1 rule 1).
5. **Master data that must pre-exist.** If a flow says a document references a catalogue entry,
   that catalogue feature becomes a `dependsOn` entry in `*.features.ts` and a seed-order
   constraint.

### 7.3 Checklist before writing the entity

- [ ] Which of the 21 flows read or write this feature's data?
- [ ] For each field: who creates it, who updates it later, who only reads it?
- [ ] Does the flow imply a status field, and are its values exactly the listed ones?
- [ ] Does any consumer live in another plugin — and is the access routed through a gateway/event?
- [ ] Do the fields in the flow document match the field list in the original spec (§4.1)? A gap
      between them is escalated, not filled in by guessing.
