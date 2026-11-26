#!/usr/bin/env bash
set -euo pipefail
# Disposable CI database only, no connection override.
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=office-test-only PGDATABASE=office_test
snapshot(){ psql -XqAt -v ON_ERROR_STOP=1 -c "select jsonb_build_array((select count(*) from office_private.documents),(select count(*) from office_private.receipts),(select count(*) from office_private.batch_receipts));"; }
before=$(snapshot)
psql -X -v ON_ERROR_STOP=1 -f server/release/disable-office.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
select fixture.identity(1);
do $$begin
 begin perform public.office_sync_manifest('a0000000-0000-4000-8000-000000000001');raise exception 'manifest remained enabled';exception when insufficient_privilege then raise notice 'PASS: actual shutdown script denies manifest';end;
 begin perform public.office_sync_import_batch('a0000000-0000-4000-8000-000000000001','{}');raise exception 'batch remained enabled';exception when insufficient_privilege then raise notice 'PASS: actual shutdown script denies import';end;
end$$;
SQL
test "$before" = "$(snapshot)"
echo 'PASS: actual shutdown preserves all record and receipt counts'
psql -X -v ON_ERROR_STOP=1 -f server/release/enable-office.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
select fixture.identity(1);
select fixture.assert(jsonb_typeof(public.office_sync_manifest('a0000000-0000-4000-8000-000000000001'))='array','actual enable script restores authorized discovery');
SQL
test "$before" = "$(snapshot)"
