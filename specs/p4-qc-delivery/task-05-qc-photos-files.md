# Task 05 — QC photos and the shared delivery file util

Status: pending

## Outcome
Photos attach to a QC round's item results under the hardened upload rules, are served only to actors who can read the unit, and every later P4 upload reuses one file util.

## Scope
- In: `backend/src/plugins/delivery/_shared/utils/delivery-file.util.ts` (D-12: `checkPhoto(file)` via production `image-type.util.ts` — `extension`/`contentType`/signature agree; `checkDocument(file)` via `ATTACHMENT_TYPES.pdf|png|jpg|jpeg` of `sales/request/utils/attachment-type.util.ts:62-91`; `objectKey(kind, ownerId, extension)` = `delivery/<kind>/<ownerId>/<uuid>.<ext>`; display name through `sanitizePhotoName`; size constants (user, Q4) `MAX_PHOTO_BYTES = 10 MB`, `MAX_DOCUMENT_BYTES = 20 MB`, counts per kind). QC photos: table `qc_photos` (round item, key, content type, display name, size, `created_by/at`); `POST /delivery/qc/round-items/:id/photos` (multipart `file`, `qc_inspection:create`, multer limit `MAX_PHOTO_BYTES + 1` as `unit-photo.controller.ts:66-67`): (R-02) visibility check (404) before storing → store → transaction `lockUnit` → scope again → count per round ≤ 30 → row, else delete the object; `GET /delivery/qc/units/:unitId` gains photo metadata; (R-03) `GET /delivery/qc/photos/:photoId/content` with `qc_inspection:read`, resolving photo → round → unit → production order → order in SQL with the D-03 condition (404 otherwise), stored content type, `X-Content-Type-Options: nosniff`, inline.
- Out: documents' upload endpoints (tasks 08, 11); installation photos (task-10); deletion ((user, Q4)).

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/delivery/_shared/utils/delivery-file.util.ts` + `delivery-file.util.spec.ts`, `backend/src/plugins/delivery/qc-inspection/` photo files (migration, `entities/qc-photo.entity.ts`, `services/qc-photo.service.ts` + `qc-photo.service.spec.ts`, `qc-photo.controller.ts` + `qc-photo.controller.spec.ts`)
- Modify: `backend/src/plugins/delivery/qc-inspection/qc-inspection.module.ts`, `services/qc-inspection.service.ts` (photo metadata in the unit read), `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/production/progress/unit-photo.controller.ts:62-67,109-111`, `progress/services/unit-photo.service.ts:128-196,263-270`, `progress/unit-photo-db.helper-spec.ts` (storage fake), `production/progress/utils/image-type.util.ts`, `photo-filename.util.ts:21`

## Steps
1. Util → `delivery-file.util.spec.ts`: PDF renamed `.png` → photo 400; PNG renamed `.pdf` → document 400; `.dwg` → document 400; key matches `^delivery/<kind>/<ownerId>/[0-9a-f-]{36}\.(png|jpg|pdf)$` and never contains the uploaded name.
2. Service → `qc-photo.service.spec.ts` (real Postgres, storage fake): 31st photo of a round → 400, also with two uploads at 29 queued (`queuedBehind`) behind the production header row → one 201, one 400; storage failure inside the transaction → object delete called, no row; (R-02) sales_b uploading is 403 by permission, and a qcInspector uploading to a round item id that does not exist → 404 with the storage fake's `upload` not called.
3. Controller → `qc-photo.controller.spec.ts`: 10 MB → 201, 10 MB + 1 byte → 413; (R-03) content: stored type, `nosniff`, no `Content-Disposition: attachment` requirement for images; sales_b → 404, sales_a (own order) → 200, a role without `qc_inspection:read` (technician) → 403; no `key`/`storageKey` in any response.
4. OpenAPI, `api.ts`.

## Acceptance
- AC-11 (photo reads and uploads); AC-12 (photo branch, util).

## Dependencies
- task-04-qc-rounds-defects.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/_shared/utils/delivery-file.util.spec.ts && test -f src/plugins/delivery/qc-inspection/services/qc-photo.service.spec.ts && test -f src/plugins/delivery/qc-inspection/qc-photo.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"`
- Named probe: `delivery-file.util.spec.ts`, `qc-photo.service.spec.ts` (count race, cleanup, not-stored-on-404), `qc-photo.controller.spec.ts` (413 edge, headers, 403/404)
- Reachability: known (storage fake as `unit-photo-db.helper-spec.ts`).
- Oracle: exit 0, 0 skipped.
- Counterexample: checking only the extension must fail the renamed-PDF case; counting before the locks must fail the 29 + 2 race; storing before the visibility check must fail the "`upload` not called" assertion.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
