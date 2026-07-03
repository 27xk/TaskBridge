#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: TASKBRIDGE_RESTORE_CONFIRM=restore ./restore-mysql.sh <backup.sql.gz>" >&2
  exit 2
fi

if [ "${TASKBRIDGE_RESTORE_CONFIRM:-}" != "restore" ]; then
  echo "Refusing to restore without TASKBRIDGE_RESTORE_CONFIRM=restore." >&2
  exit 2
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="${TASKBRIDGE_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.release.yml}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
TEMP_SQL="$(mktemp "${TMPDIR:-/tmp}/taskbridge-restore.XXXXXX.sql")"

cleanup() {
  rm -f "$TEMP_SQL"
}
trap cleanup EXIT

gzip -dc "$BACKUP_FILE" > "$TEMP_SQL"
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_SERVICE" sh -c \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < "$TEMP_SQL"
