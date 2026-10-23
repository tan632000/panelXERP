#!/usr/bin/env bash
# Usage: ./docs/scaffold/new-plugin/create-plugin.sh warehouse Warehouse
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <kebab-name> <PascalName>"
  echo "Example: $0 warehouse Warehouse"
  exit 1
fi

NAME="$1"
PASCAL="$2"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

BE_DEST="$ROOT/backend/src/plugins/$NAME"
FE_DEST="$ROOT/frontend/src/plugins/$NAME"
SCAFFOLD="$(dirname "$0")"

mkdir -p "$BE_DEST/database/seeds" "$BE_DEST/database/migrations"

render() {
  sed "s/{name}/$NAME/g; s/{NamePascal}/$PASCAL/g" "$1" > "$2"
}

render "$SCAFFOLD/backend/{name}.plugin.ts" "$BE_DEST/$NAME.plugin.ts"
render "$SCAFFOLD/backend/{name}.module.ts" "$BE_DEST/$NAME.module.ts"
render "$SCAFFOLD/backend/{name}.permissions.ts" "$BE_DEST/$NAME.permissions.ts"
render "$SCAFFOLD/backend/database/seeds/index.ts" "$BE_DEST/database/seeds/index.ts"

mkdir -p "$FE_DEST"
render "$SCAFFOLD/frontend/plugin.ts" "$FE_DEST/plugin.ts"
render "$SCAFFOLD/frontend/navigation.ts" "$FE_DEST/navigation.ts"

mkdir -p "$ROOT/frontend/src/app/[locale]/$NAME"
render "$SCAFFOLD/frontend/page.stub.tsx" "$ROOT/frontend/src/app/[locale]/$NAME/page.tsx"

echo "Created plugin skeleton at:"
echo "  $BE_DEST"
echo "  $FE_DEST"
echo "  frontend/src/app/[locale]/$NAME/page.tsx"
echo ""
echo "Next: register in enabled-plugins.ts (BE + FE), add migration, permissions to seed-roles."
