-- Operator review only. Never applies SQL proposals, creates clients or enables gates.
begin read only;
select current_setting('server_version') as postgres_version,pg_database_size(current_database()) as database_bytes;
select nspname from pg_namespace where nspname='office_private';
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'office_%';
select table_schema,table_name,column_name,data_type,is_nullable
from information_schema.columns
where (table_schema='auth' and table_name='sessions' and column_name in ('id','user_id','oauth_client_id','not_after'))
or (table_schema='public' and table_name in ('account_apps','account_app_manifests','account_first_party_oauth_clients','account_app_connections','account_app_permissions','account_app_grants','account_deletion_requests'))
order by table_schema,table_name,ordinal_position;
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.account_deletion_requests'::regclass and not tgisinternal;
select slug,active from public.account_apps where slug='office';
select app_slug,client_uri,redirect_uri,active from public.account_first_party_oauth_clients
where app_slug='office' or client_uri='https://office.thiepn.dev/' or redirect_uri='https://office.thiepn.dev/auth/callback/';
rollback;
