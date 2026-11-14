#!/usr/bin/env bash
# Post-deploy check of https://check.ingsparks.de (also runnable by hand):
#   api/deploy/check.sh https://check.ingsparks.de [expected-commit]
# Verifies that the new commit is live and that api/deploy/htaccess does its job (HTML shell with
# CSP, real 404 for missing assets, API auth, hidden files). Exit code 1 if anything is off.
set -uo pipefail

base="${1:?usage: check.sh <base-url> [expected-commit]}"
base="${base%/}"
expected="${2:-}"
failures=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# fetch <path> -> sets $status, $headers (lowercased), $body
fetch() {
  local out
  out="$(curl -sS --max-time 30 -D - -w '\n__STATUS__%{http_code}' "$base$1")" || { status=000; headers=''; body=''; return; }
  status="${out##*__STATUS__}"
  out="${out%$'\n'__STATUS__*}"
  headers="$(printf '%s' "$out" | sed -n '1,/^\r\{0,1\}$/p' | tr 'A-Z' 'a-z')"
  body="${out#*$'\r\n\r\n'}"
}

expect_status() { # path expected... (any of the given statuses is fine)
  local path="$1"
  shift
  fetch "$path"
  for want in "$@"; do
    if [ "$status" = "$want" ]; then pass "$path -> $status"; return; fi
  done
  fail "$path -> $status (expected $*)"
}

# The new commit is live (the upload may need a moment to settle).
for _ in 1 2 3 4 5; do
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

# The shell: HTML with a Content-Security-Policy (fails without mod_headers).
fetch /
if [ "$status" = 200 ] && printf '%s' "$headers" | grep -q 'content-type: text/html'; then pass "/ is the HTML shell"; else fail "/ -> $status"; fi
if printf '%s' "$headers" | grep -q "content-security-policy:.*default-src 'self'"; then pass "/ sends a Content-Security-Policy"; else fail "/ has no Content-Security-Policy header (mod_headers missing?)"; fi

expect_status /assets/does-not-exist.js 404
expect_status /api/doc 401
expect_status /api/push/run 401
expect_status /.htaccess 403 404

printf '\n%d failure(s)\n' "$failures"
[ "$failures" -eq 0 ]
