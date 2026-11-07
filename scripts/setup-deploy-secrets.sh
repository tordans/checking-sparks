#!/usr/bin/env bash
# Guided setup of the GitHub environment secrets for the deploy workflow (docs/deploy.md, 2 + 3).
# Generates family/cron/deploy keys and a VAPID key pair, asks for the FTP and database values,
# and stores everything with `gh secret set --env production`. Nothing is written to disk.
#
# Usage: [FTP_SERVER=… FTP_USERNAME=… DB_HOST=… DB_NAME=… DB_USER=…] scripts/setup-deploy-secrets.sh [owner/repo]
# Values given as environment variables are not asked for; passwords and the e-mail always are.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
ENV_NAME=production
cd "$(dirname "$0")/.."

ask() { # ask <prompt> <default>
  local answer
  read -r -p "$1${2:+ [$2]}: " answer
  printf '%s' "${answer:-$2}"
}
ask_secret() { # ask_secret <prompt>
  local answer
  read -r -s -p "$1 (Eingabe unsichtbar): " answer
  echo >&2
  [ -n "$answer" ] || { echo "Leer – abgebrochen." >&2; exit 1; }
  printf '%s' "$answer"
}
random_key() { openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n'; }
sha256() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }
put() { printf '%s' "$2" | gh secret set "$1" --env "$ENV_NAME" --repo "$REPO" >/dev/null && echo "  ✓ $1"; }

echo "Secrets für $REPO (Environment: $ENV_NAME)"
echo
echo "1/3 FTP (KAS > FTP-Nutzer)"
FTP_SERVER=${FTP_SERVER:-$(ask "  Servername" "")}
FTP_USERNAME=${FTP_USERNAME:-$(ask "  Benutzername" "")}
FTP_PASSWORD=$(ask_secret "  Passwort")
echo
echo "2/3 Datenbank (KAS > Datenbank)"
DB_HOST=${DB_HOST:-$(ask "  Host" "localhost")}
DB_NAME=${DB_NAME:-$(ask "  Datenbank" "")}
DB_USER=${DB_USER:-$(ask "  Login" "$DB_NAME")}
DB_PASSWORD=$(ask_secret "  Passwort")
echo
echo "3/3 Push"
VAPID_SUBJECT="mailto:$(ask "  Kontakt-E-Mail für Push-Dienste" "")"

echo
echo "Erzeuge Schlüssel …"
FAMILY_KEY=$(random_key)
CRON_KEY=$(random_key)
DEPLOY_KEY=$(random_key)

# VAPID key pair via the PHP test image (no local PHP needed).
docker image inspect checking-sparks-api-test >/dev/null 2>&1 \
  || docker build -q -t checking-sparks-api-test -f api/Dockerfile.test api >/dev/null
[ -d api/vendor ] || docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test composer install --no-interaction --quiet
VAPID_OUTPUT=$(docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/generate-vapid.php)
VAPID_PUBLIC_KEY=$(awk '/^public_key:/ {print $2}' <<<"$VAPID_OUTPUT")
VAPID_PRIVATE_KEY=$(awk '/^private_key:/ {print $2}' <<<"$VAPID_OUTPUT")
if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
  echo "VAPID-Schlüssel konnten nicht gelesen werden. Ausgabe von generate-vapid.php prüfen." >&2
  exit 1
fi

echo "Speichere Secrets in GitHub …"
put FTP_SERVER "$FTP_SERVER"
put FTP_USERNAME "$FTP_USERNAME"
put FTP_PASSWORD "$FTP_PASSWORD"
put DB_HOST "$DB_HOST"
put DB_NAME "$DB_NAME"
put DB_USER "$DB_USER"
put DB_PASSWORD "$DB_PASSWORD"
put FAMILY_KEY_SHA256 "$(sha256 "$FAMILY_KEY")"
put CRON_KEY_SHA256 "$(sha256 "$CRON_KEY")"
put DEPLOY_KEY "$DEPLOY_KEY"
put VAPID_PUBLIC_KEY "$VAPID_PUBLIC_KEY"
put VAPID_PRIVATE_KEY "$VAPID_PRIVATE_KEY"
put VAPID_SUBJECT "$VAPID_SUBJECT"

cat <<EOF

Fertig. Diese drei Werte jetzt in den Passwort-Manager übernehmen – sie werden nirgends gespeichert:

  Familienschlüssel:  $FAMILY_KEY
  Cron-Schlüssel:     $CRON_KEY
  Deploy-Schlüssel:   $DEPLOY_KEY

Gerät koppeln (nach dem ersten Deploy):  https://check.ingsparks.de/verbinden#key=$FAMILY_KEY
Cronjob-URL in KAS:                      check.ingsparks.de/api/push/run?key=$CRON_KEY

Danach dieses Terminal leeren (Cmd+K).
EOF
