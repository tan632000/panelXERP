#!/bin/sh
set -e

APP_HOST="${APP_HOST:-erp.example.com}"
CERT="/etc/letsencrypt/live/${APP_HOST}/fullchain.pem"
SRC_HTTP="/etc/nginx/templates/http.conf"
SRC_HTTPS="/etc/nginx/templates/https.conf"
DEST="/etc/nginx/conf.d/default.conf"
AUTH_SNIPPET="/etc/nginx/snippets/basic-auth.conf"

if [ -n "${BASIC_AUTH_USER:-}" ] && [ -n "${BASIC_AUTH_PASSWORD:-}" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASSWORD"
  cat > "$AUTH_SNIPPET" <<'EOF'
auth_basic "Restricted";
auth_basic_user_file /etc/nginx/.htpasswd;
EOF
else
  : > "$AUTH_SNIPPET"
fi

render() {
  src=$1
  sed "s/__APP_HOST__/${APP_HOST}/g" "$src" > "$DEST"
}

if [ -f "$CERT" ]; then
  render "$SRC_HTTPS"
else
  render "$SRC_HTTP"
fi

# Reload periodically so renewed Let's Encrypt certs are picked up.
(
  while true; do
    sleep 21600
    if [ -f "$CERT" ]; then
      render "$SRC_HTTPS"
    else
      render "$SRC_HTTP"
    fi
    nginx -s reload 2>/dev/null || true
  done
) &

exec nginx -g "daemon off;"
