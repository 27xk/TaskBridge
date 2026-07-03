#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="${TASKBRIDGE_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.release.yml}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/taskbridge-mysql-$TIMESTAMP.sql.gz"
TEMP_SQL=""
TEMP_GZIP=""

cleanup() {
  if [ -n "$TEMP_SQL" ]; then
    rm -f "$TEMP_SQL"
  fi
  if [ -n "$TEMP_GZIP" ]; then
    rm -f "$TEMP_GZIP"
  fi
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
TEMP_SQL="$(mktemp "$BACKUP_DIR/.taskbridge-mysql-$TIMESTAMP.XXXXXX.sql")"
TEMP_GZIP="$(mktemp "$BACKUP_DIR/.taskbridge-mysql-$TIMESTAMP.XXXXXX.sql.gz")"

docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_SERVICE" sh -c \
  'mysqldump --single-transaction --routines --triggers --events -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > "$TEMP_SQL"
gzip -9 -c "$TEMP_SQL" > "$TEMP_GZIP"
mv "$TEMP_GZIP" "$BACKUP_FILE"

find "$BACKUP_DIR" -type f -name 'taskbridge-mysql-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete

printf '%s\n' "$BACKUP_FILE"
