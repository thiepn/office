#!/usr/bin/env bash
set -euo pipefail
# CI-only connection fixed to the disposable service, never accepts a hosted URL.
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=office-test-only PGDATABASE=office_test
psql -X -v ON_ERROR_STOP=1 -f server/tests/account-fixture.sql
psql -X -v ON_ERROR_STOP=1 -f server/proposals/o4-2-office-sync.sql
psql -X -v ON_ERROR_STOP=1 -f server/proposals/o4-6-production-gate.sql
psql -X -v ON_ERROR_STOP=1 -f server/proposals/o5-1-equations.sql
psql -X -v ON_ERROR_STOP=1 -f server/proposals/o5-2-academic-structure.sql
psql -X -v ON_ERROR_STOP=1 -f server/proposals/o5-3-research.sql
psql -X -v ON_ERROR_STOP=1 -f server/release/enable-office.sql
psql -X -v ON_ERROR_STOP=1 -f server/tests/office-sync.sql
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for i in 21 22; do
 (
 psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
set role authenticated;
select fixture.identity(1);
select public.office_sync_push('a0000000-0000-4000-8000-000000000001',fixture.op($i,1,fixture.next(fixture.next(fixture.doc('doc'),'second'),'writer-$i')))->>'status';
SQL
 ) >"$tmp/$i" &
done
wait
cat "$tmp/21" "$tmp/22"
test "$(grep -hxc applied "$tmp/21" "$tmp/22" | awk '{s+=$1}END{print s}')" = 1
test "$(grep -hxc conflict "$tmp/21" "$tmp/22" | awk '{s+=$1}END{print s}')" = 1
echo 'PASS: concurrent CAS commits exactly one winner'
psql -X -v ON_ERROR_STOP=1 <<'SQL'
select fixture.assert((select revision=2 from office_private.documents where owner_id='a0000000-0000-4000-8000-000000000001' and document_id='doc'),'race revision exactly 2');
delete from auth.users where id='a0000000-0000-4000-8000-000000000002';
select fixture.assert(not exists(select 1 from office_private.documents where owner_id='a0000000-0000-4000-8000-000000000002') and not exists(select 1 from office_private.receipts where owner_id='a0000000-0000-4000-8000-000000000002'),'user deletion cascades Office records and receipts');
SQL
