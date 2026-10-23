# Task 02 — Frontend shell with login and user/role administration

Status: done

## Outcome
The Next.js app runs against the task-01 backend: login, profile, user and role admin pages, empty business navigation.

## Scope
- In (copy allowlist from REF `frontend/`): `src/kernel/`, `src/plugins/system/`, `src/app/{layout.tsx,page.tsx,error.tsx,not-found.tsx,globals.css,favicon.ico}`, `src/app/[locale]/{(auth),layout.tsx,page.tsx,not-found.tsx,profile,system}`, `src/test/`, `src/types/`, `src/middleware.ts`, `public/`, `scripts/`, `eslint-plugin-erp/`, configs, package files; `docker/frontend` already from task-01.
- Out: every other `src/plugins/*` and `src/app/[locale]/*` route; REF domain i18n namespaces.

## Coverage
- CP-02

## Ownership
- Create: `frontend/`
- Modify: `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, `frontend/src/kernel/langs/load-messages.ts`, `frontend/src/kernel/langs/{vi,en}/`, `frontend/src/kernel/core/api/generated/api.ts` (regenerate), `frontend/vitest.config.ts`, `backend/docs/api/openapi.json` (regenerate)
- Read: `REF/frontend/package.json` scripts

## Steps
1. Copy allowlist → `grep -rnE "@/?plugins/" frontend/src | grep -v "^frontend/src/plugins/"` hits only the two kernel catalog files and `system` imports.
2. Keep only `system` in the frontend plugin catalog; empty feature keys except system.
3. Rewrite/delete kernel tests importing removed plugins: `classification-options.test.tsx`, `file-allowlist-dots.test.ts`, `i18n-enum-conformance.test.ts`, `use-delete-failure-reason.test.tsx`, `use-toast-mutation-feedback.test.tsx`, `delete-confirmation.test.ts`, `status-messages.test.ts`, `plugin-api-routes.test.ts` (rewrite to kernel-local fixtures where they test kernel behavior).
4. Remove REF domain namespaces from `langs/{vi,en}` and `load-messages.ts`; keep common/system/auth namespaces.
5. Branding: change letterhead env in `vitest.config.ts` to panelXERP values and update `print-document.test.ts`, `print-html.test.ts` expectations accordingly.
6. `docker compose exec -T backend npm run generate:api-docs` then `docker compose exec -T frontend npm run generate:api` + prettier/eslint fix.
7. `docker compose up -d frontend`.

## Acceptance
- AC-03: lint (incl. `lint:i18n`), typecheck, vitest pass; `/login` (default locale `vi`, `localePrefix: "as-needed"`) returns 200.

## Dependencies
- task-01-backend-boot.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npm test" && curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:${FRONTEND_PORT:-3000}/login`
- Named probe: `src/kernel/platform/tests/plugin-api-routes.test.ts`, `src/kernel/core/tests/i18n-enum-conformance.test.ts` (rewritten), login page.
- Reachability: frontend port from copied `.env.example` (`FRONTEND_PORT`, confirm value at implementation; curl uses that value).
- Oracle: commands exit 0; vitest ≥ 1 passed; curl prints `200`.
- Counterexample: requesting `/vi/login` yields 307, not 200 (user-approved Command fix 2026-10-23); a remaining `@/plugins/warehouse` import fails typecheck; a vi key without en fails `lint:i18n`.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npm test" && curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:${FRONTEND_PORT:-3000}/login
Exit: 0
Base: d770f34b1cf18f5d3806fe8b897089747960fd60
Head: c218f4abf87919653ad10638688f9034d1122f0e8990da10a888c537afcfc9a0
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npm test" && curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:${FRONTEND_PORT:-3000}/login
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
      Tests  7 passed (7)
> tsc --noEmit
 ✓ src/kernel/platform/tests/plugin-api-routes.test.ts (2 tests)
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 ✓ src/kernel/core/tests/classification-options.test.tsx (7 tests)
 ↓ src/kernel/langs/tests/permission-labels.test.ts (6 tests | 6 skipped)
 Test Files  114 passed | 1 skipped (115)
      Tests  921 passed | 6 skipped (927)
200
Exit: 0
```
Notes: the 6 skipped tests need `../backend` beside the frontend, which the container does not mount (same as REF). Review (code-auditor): round 1 FAIL (High: 404/root linked `/sales`; Medium: kernel classification test deleted) → repaired → re-review PASS, Low only. Out-of-ownership edit with reason: `backend/eslint-plugin-erp/utils.js` legacy exemption emptied (same path as task-09). Follow-ups carried into task-04 Step 5.
