# eslint-plugin-erp sync

Canonical rule sources live here. Runtime copies for Docker (per-service mount) are:

- `backend/eslint-plugin-erp/`
- `frontend/eslint-plugin-erp/`

After editing rules or `utils.js`, sync both copies:

```bash
cp -r tools/eslint-plugin-erp/index.js tools/eslint-plugin-erp/utils.js tools/eslint-plugin-erp/rules backend/eslint-plugin-erp/
cp -r tools/eslint-plugin-erp/index.js tools/eslint-plugin-erp/utils.js tools/eslint-plugin-erp/rules frontend/eslint-plugin-erp/
```

Maintenance scripts stay under `tools/eslint-plugin-erp/scripts/`.
