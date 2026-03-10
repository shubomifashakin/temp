#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  CREATE ROLE postgres_exporter WITH LOGIN PASSWORD '$POSTGRES_EXPORTER_PASSWORD';
  GRANT pg_monitor TO postgres_exporter;
  GRANT EXECUTE ON FUNCTION pg_stat_statements_reset() TO postgres_exporter;
  GRANT SELECT ON pg_stat_statements TO postgres_exporter;
EOSQL