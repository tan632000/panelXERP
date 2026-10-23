# New Plugin Scaffold

Copy templates below when adding a business plugin. Replace `{name}` with kebab-case id (e.g. `warehouse`, `planning`).

## Checklist

1. **Backend** — copy `backend/` templates → `backend/src/plugins/{name}/`
2. Register in `backend/src/platform/plugins/enabled-plugins.ts`
3. Add permissions to `seed-roles.ts` if new roles need them
4. **Frontend** — copy `frontend/` templates → `frontend/src/plugins/{name}/`
5. Register in `frontend/src/platform/plugins/enabled-plugins.ts`
6. Create route: `frontend/src/app/[locale]/{module}/page.tsx` (see `page.stub.tsx`)
7. Run verification:

```bash
cd backend && npm run typecheck && npm run lint && npm run build
cd frontend && npm run typecheck && npm run lint && npm run build
```

## Domain events (optional)

- Add event name to `backend/src/platform/events/event-names.ts`
- Emit from service via `EventEmitter2` after persist
- Add `@OnEvent()` listener in `{name}/events/` module — import events module in `{name}.module.ts`

## Notes

- Do **not** import another plugin's service/entity directly — use events or ports.
- API routes stay flat (`/api/v1/...`), no `/api/plugins/{name}/` prefix in Phase 1.
- i18n: add `frontend/src/langs/vi/{name}.json` and `en/{name}.json` manually.
