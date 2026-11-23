#!/usr/bin/env bash
# Starts a DISPOSABLE local MySQL 8 for the integration tests. Never point this at the shared managed database.
set -euo pipefail
NAME=${WORLDEX_TEST_DB_CONTAINER:-worldex-test-mysql}
PORT=${WORLDEX_TEST_DB_PORT:-33306}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=worldex_test -p 127.0.0.1:$PORT:3306 mysql:8.4 >/dev/null
echo "Waiting for MySQL..."
for i in $(seq 1 60); do docker exec "$NAME" mysqladmin ping -h127.0.0.1 -uroot -ptest --silent >/dev/null 2>&1 && break; sleep 2; done
docker exec "$NAME" mysqladmin ping -h127.0.0.1 -uroot -ptest --silent
echo "export WORLDEX_TEST_DATABASE_URL='mysql://root:test@127.0.0.1:$PORT/worldex_test'"
