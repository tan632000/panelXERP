# Intake — from a PO/BA request to a build-ready brief

Every feature task starts the same way, whatever form the request arrives in:

1. **Load the contract first.** Read
   [`../feature-development-standard.md`](../feature-development-standard.md) before reading the
   request. It decides what a complete answer looks like; the request only supplies the content.
2. **Capture the request as the primary input.** It is a PO/BA artifact: pasted text, a chat
   message, a `.md` / `.docx` / `.xlsx` file, a screenshot, or a ticket.
3. **Normalize it** into the discovery table in [`runbook.md`](runbook.md) Step 0.
4. **Fill the gaps from the four repo authorities**, and only what none of them answers goes back
   to the PO/BA as a question.

Never start generating from the request alone. A PO/BA request describes the business need; it
almost never carries the column order, the role matrix, the status set or the field ownership —
those live in the repo.

---

## 1. Where the request goes

| Situation | Action |
|---|---|
| The request is a spec document | Save it under `docs/original-specs/<plugin>/<feature>/` using the existing naming shape (`<module>-<vietnamese-slug>-v01.md`). If a version already exists, add `-v02`; never overwrite |
| A newer version of an existing spec arrives | Add it as the next `-v0N` and state in your report which version you built from |
| The request is informal text or a chat message | Do not invent a spec file. Quote it verbatim in your plan, then work it through §2 below |
| The request is `.docx` / `.xlsx` / a screenshot | Extract to text first, keep the original next to it, and work from the extraction |

---

## 2. Normalizing the request

Map whatever the PO/BA wrote onto these slots. Mark each one **`stated`** (they said it),
**`derived`** (you got it from a repo authority — name which), or **`missing`**.

| Slot | Usually stated by | Otherwise derive from |
|---|---|---|
| Plugin + feature name | PO/BA | the nearest existing feature |
| Purpose / business need | PO/BA | — |
| Field list, types, required, max length | PO/BA | original spec `Trường dữ liệu`; mock `<thead>` |
| Business code + prefix | PO/BA | original spec `Quy tắc mã hóa`; existing prefixes |
| Enum axes and their members | PO/BA | mock `<select>` options; original spec badge table |
| Which roles can read / add / edit / delete | rarely | **the newest Function List** — authoritative even when the PO/BA states something |
| Column set and order on the list | rarely | the mock screen |
| Statuses and legal transitions | sometimes | `ERP_Phan_tich_Luong_Chi_tiet.md` |
| Which fields another department owns | almost never | the flow docs |
| File uploads, sizes, extensions | sometimes | original spec; the nearest feature with uploads |
| Relationships to other features | sometimes | flow docs; existing entities |

**Precedence when the request and the repo disagree:**

| Topic | Winner |
|---|---|
| Role matrix / who can do what | Function List (newest revision) |
| Column set, order, labels | Mock UI |
| Statuses, transitions, field ownership | Flow docs |
| Field semantics, validation, coding rule | Original spec at its highest version |
| Business intent, priority, scope | The PO/BA request |

A conflict on anything other than the last row is **reported, not resolved**. Quote both sides.

---

## 3. Questions to send back

Ask only what no authority answers. Batch them — one round, not a drip.

**Data**
- Which fields are required, and what is the max length of each free-text field?
- Is there a business code? What prefix, and is it user-editable on create?
- For each dropdown: the full closed list of options, and the Vietnamese label for each.
- Any field a user must be able to clear back to empty after saving?

**Behaviour**
- Can a row be deleted once referenced elsewhere, or must it be blocked?
- Is the code reusable after a row is deleted?
- Any uniqueness rule beyond code and name?
- Does the record carry a status? If yes, the full list and who may move it between them.

**Permissions**
- Confirm the roles that may add / edit / delete — quote the Function List rows back and ask for
  confirmation rather than asking open-ended.

**UI**
- Is there a mock screen for this, or should the nearest existing screen be the model?
- Which columns appear on the list by default, and in what order?
- Any Excel import/export in this phase?

**Files**
- Which documents attach to the record, what formats, and what size limit?

---

## 4. The build-ready brief

Intake is finished when you can fill the Step 0 table with no `missing` rows, and you have stated:

- the PO/BA request you worked from (file path or quoted text);
- the original-spec version, Function List revision and system-diagram version used;
- every slot marked `derived`, with its source;
- every conflict found, with both sides quoted;
- every question sent back, and the answer received.

Only then start [`runbook.md`](runbook.md) Step 1. If a question is still open and the answer
would change the schema, stop and say so — do not build on a guess and patch it later.
