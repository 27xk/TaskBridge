#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' "Docker Engine with Docker Compose is required." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.local.example .env
fi

docker compose -f docker-compose.release.yml up -d

ready_url="http://127.0.0.1:8080/ready"
attempt=0
while :; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 "$ready_url" >/dev/null 2>&1 && break
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 2 -O /dev/null "$ready_url" >/dev/null 2>&1 && break
  elif docker compose -f docker-compose.release.yml exec -T web wget -q -T 2 -O /dev/null http://127.0.0.1/ready >/dev/null 2>&1; then
    break
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf '%s\n' "TaskBridge did not become ready within 120 seconds." >&2
    printf '%s\n' "Review logs with: docker compose -f docker-compose.release.yml logs" >&2
    exit 1
  fi
  sleep 2
done

printf '%s\n' "TaskBridge is ready at http://127.0.0.1:8080"
