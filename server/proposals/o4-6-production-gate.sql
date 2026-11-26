-- Source-only proposal. Installing this gate NEVER enables live access.
begin;
create table office_private.release_gate(singleton boolean primary key check(singleton),enabled boolean not null default false);
insert into office_private.release_gate(singleton) values(true);
alter table office_private.release_gate enable row level security;
revoke all on office_private.release_gate from public,anon,authenticated;
create or replace function office_private.authorize(expected uuid, permission text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); claims jsonb:=auth.jwt(); sid uuid; cid uuid;
begin
 if uid is null or expected is distinct from uid or claims->'is_anonymous' is distinct from 'false'::jsonb or permission is null or permission not in ('app_data.read','app_data.write') then
  raise exception 'office_access_denied' using errcode='42501';
 end if;
 begin sid:=(claims->>'session_id')::uuid; cid:=(claims->>'client_id')::uuid;
 exception when invalid_text_representation then raise exception 'office_access_denied' using errcode='42501'; end;
 if sid is null or cid is null then raise exception 'office_access_denied' using errcode='42501'; end if;
 -- Fail closed before any data access. Shared row lock makes shutdown wait for in-flight RPCs.
 perform 1 from office_private.release_gate where singleton and enabled for share;
 if not found then raise exception 'office_access_denied' using errcode='42501';end if;
 -- Serialize Office RPCs for this owner, including initially absent documents.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,4002));
 -- Check current registry, session, connection and grant rather than trusting stale JWT alone.
 -- Lock matching rows so concurrent revocation waits for already authorized transaction.
 perform 1 from auth.sessions s
 join public.account_first_party_oauth_clients c on c.oauth_client_id=s.oauth_client_id
 join public.account_apps a on a.slug=c.app_slug
 join public.account_app_connections conn on conn.user_id=s.user_id and conn.app_slug=a.slug
 join public.account_app_grants g on g.user_id=s.user_id and g.app_slug=a.slug and g.permission_id=permission
 join public.account_app_permissions p on p.app_slug=g.app_slug and p.permission_id=g.permission_id
 where s.id=sid and s.user_id=uid and s.oauth_client_id=cid
 and (s.not_after is null or s.not_after>statement_timestamp())
 and c.app_slug='office' and c.active and a.active
 and c.client_uri='https://office.thiepn.dev/' and c.redirect_uri='https://office.thiepn.dev/auth/callback/'
 and conn.status in ('connected','limited') and g.status='granted' and p.active
 for share of s,c,a,conn,g,p;
 if not found or exists(select 1 from public.account_deletion_requests r where r.user_id=uid and r.status in ('pending','deleting')) then
  raise exception 'office_access_denied' using errcode='42501';
 end if;
 return uid;
end $$;
-- New deletion requests serialize with the same owner lock as Office RPCs.
-- Preserve the existing Account recent-session guard; this is an additive trigger.
create function office_private.serialize_account_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('pending','deleting') then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,4002));
 end if;
 return new;
end $$;
revoke all on function office_private.serialize_account_deletion() from public,anon,authenticated;
create trigger office_serialize_account_deletion
before insert or update of status on public.account_deletion_requests
for each row execute function office_private.serialize_account_deletion();
-- Avoid numeric casts of malformed JSON being reordered ahead of type validation.
create or replace function office_private.valid_revision(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' and v::text ~ '^(0|[1-9][0-9]{0,15})$' then (v::text)::numeric between 0 and 9007199254740991 else false end
$$;
commit;
