#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

if [ "${TASKBRIDGE_SKIP_MIGRATIONS:-0}" != "1" ]; then
  alembic upgrade head
fi

exec "$@"
