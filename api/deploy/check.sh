#!/usr/bin/env bash
# Post-deploy check of https://check.ingsparks.de (also runnable by hand):
#   api/deploy/check.sh https://check.ingsparks.de [expected-commit]
# Verifies what api/deploy/htaccess promises (routing, 404 for missing assets, SPA fallback, auth)
# and that /api/health reports the commit that was just deployed. Exit code 1 if anything is off.
set -uo pipefail

base="${1:?usage: check.sh <base-url> [expected-commit]}"
base="${base%/}"
expected="${2:-}"
failures=0
warnings=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }
warn() { printf 'warn  %s\n' "$1"; warnings=$((warnings + 1)); }

# fetch <path> [curl args...] -> sets $status, $headers (lowercased), $body
fetch() {
  local path="$1"
  shift
  local out
  out="$(curl -sS --max-time 30 -D - -w '\n__STATUS__%{http_code}' "$@" "$base$path")" || { status=000; headers=''; body=''; return; }
  status="${out##*__STATUS__}"
  out="${out%$'\n'__STATUS__*}"
  headers="$(printf '%s' "$out" | sed -n '1,/^\r\{0,1\}$/p' | tr 'A-Z' 'a-z')"
  body="${out#*$'\r\n\r\n'}"
}

expect_status() { # path expected [label]
  fetch "$1"
  if [ "$status" = "$2" ]; then pass "${3:-$1} -> $2"; else fail "${3:-$1} -> $status (expected $2)"; fi
}

# 1. the shell
fetch /
if [ "$status" = 200 ] && printf '%s' "$headers" | grep -q 'content-type: text/html'; then pass "/ is the HTML shell"; else fail "/ -> $status"; fi
if printf '%s' "$headers" | grep -q 'cache-control:.*no-cache'; then pass "/ is no-cache"; else warn "/ has no no-cache header (mod_headers missing?)"; fi
asset="$(printf '%s' "$body" | grep -o '/assets/[^"]*\.js' | head -1 || true)"

# 2. hashed assets: served, immutable; missing ones are a real 404
if [ -n "$asset" ]; then
  fetch "$asset"
  if [ "$status" = 200 ]; then pass "$asset -> 200"; else fail "$asset -> $status"; fi
  if printf '%s' "$headers" | grep -q 'cache-control:.*immutable'; then pass "assets are immutable"; else warn "assets are not immutable (mod_headers missing?)"; fi
else
  fail "no /assets/*.js reference found in /"
fi
expect_status /assets/does-not-exist.js 404

# 3. SPA fallback, deep links
expect_status /einstellungen 200
expect_status '/person/p1/vorsorge/c1?action=done' 200 '/person/<id>/vorsorge/<id>?action=done'

# 4. PWA files
fetch /sw.js
if [ "$status" = 200 ] && printf '%s' "$headers" | grep -Eq 'content-type: (text|application)/javascript'; then pass "/sw.js is JavaScript"; else fail "/sw.js -> $status"; fi
fetch /manifest.webmanifest
if [ "$status" = 200 ] && printf '%s' "$body" | grep -q '"Checking Sparks"'; then pass "/manifest.webmanifest"; else fail "/manifest.webmanifest -> $status"; fi
expect_status /icons/icon-192.png 200
expect_status /icons/icon-512.png 200

# 5. API: health shows the deployed commit, everything else needs a key
for attempt in 1 2 3 4 5; do
  fetch /api/health
  commit="$(printf '%s' "$body" | sed -n 's/.*"commit" *: *"\([^"]*\)".*/\1/p')"
  if [ "$status" = 200 ] && { [ -z "$expected" ] || [ "$commit" = "$expected" ]; }; then break; fi
  sleep 5
done
if [ "$status" != 200 ]; then
  fail "/api/health -> $status"
elif [ -n "$expected" ] && [ "$commit" != "$expected" ]; then
  fail "/api/health reports commit '${commit:-none}', expected '$expected'"
else
  pass "/api/health -> 200, commit ${commit:-?}"
fi
expect_status /api/doc 401 '/api/doc without key'
expect_status /api/push/run 401 '/api/push/run without key'
expect_status /api/push/vapid-public-key 401 '/api/push/vapid-public-key without key'

# 6. nothing hidden is served
fetch /.htaccess
case "$status" in 403 | 404) pass "/.htaccess -> $status" ;; *) fail "/.htaccess -> $status (must not be served)" ;; esac
fetch /.ftp-deploy-sync-state.json
case "$status" in 403 | 404) pass "/.ftp-deploy-sync-state.json -> $status" ;; *) fail "/.ftp-deploy-sync-state.json -> $status (must not be served)" ;; esac

printf '\n%d failure(s), %d warning(s)\n' "$failures" "$warnings"
[ "$failures" -eq 0 ]
