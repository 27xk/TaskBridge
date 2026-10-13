#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

if [ "${1:-}" = "uvicorn" ] && [ "${TASKBRIDGE_PROXY_HEADERS:-1}" = "1" ]; then
  forwarded_allow_ips="${FORWARDED_ALLOW_IPS:-${TRUSTED_PROXY_IPS:-127.0.0.1}}"
  set -- "$@" --proxy-headers --forwarded-allow-ips "$forwarded_allow_ips"
fi

if [ "${TASKBRIDGE_SKIP_MIGRATIONS:-0}" != "1" ]; then
  alembic upgrade head
fi

exec "$@"
