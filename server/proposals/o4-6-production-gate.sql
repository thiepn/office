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
-- Enforce core ProseMirror child grammar in addition to the existing node/attribute allowlist.
-- This is not a replacement for full editor-schema compatibility qualification.
create function office_private.check_tree_shape(root jsonb)
returns void language plpgsql set search_path='' as $
declare total_nodes bigint; total_text bigint; invalid boolean;
begin
 with recursive walk(n) as (
  select root
  union all
  select child.value from walk w cross join lateral jsonb_array_elements(coalesce(w.n->'content','[]'::jsonb)) child(value)
 ), shape as (
  select n,n->>'type' typ,coalesce(n->'content','[]'::jsonb) children from walk
 )
 select count(*),coalesce(sum(case when typ='text' then length(n->>'text') else 0 end),0),
 coalesce(bool_or(
  case
  when typ in ('text','hardBreak','horizontalRule') then jsonb_array_length(children)<>0
  when typ in ('paragraph','heading') then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('text','hardBreak'))
  when typ='codeBlock' then exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'text' or jsonb_array_length(coalesce(c->'marks','[]'))<>0)
  when typ in ('bulletList','orderedList') then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'listItem')
  when typ='table' then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'tableRow')
  when typ='tableRow' then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('tableCell','tableHeader'))
  when typ in ('doc','blockquote','listItem','tableCell','tableHeader') then
    jsonb_array_length(children)=0 or (typ='listItem' and children->0->>'type' is distinct from 'paragraph')
    or exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('paragraph','heading','blockquote','bulletList','orderedList','codeBlock','horizontalRule','table'))
  else true end
 ),false) into total_nodes,total_text,invalid from shape;
 if invalid or total_nodes>30000 or total_text>200000 then raise exception 'invalid_structured_content_grammar' using errcode='22023';end if;
end $;
revoke all on function office_private.check_tree_shape(jsonb) from public,anon,authenticated;
create or replace function office_private.check_snapshot(d jsonb)
returns void language plpgsql set search_path='' as $
declare rich jsonb:=d->'rich'; lay jsonb;
begin
 if jsonb_typeof(d) is distinct from 'object' or not office_private.valid_revision(d->'revision') or jsonb_typeof(d->'title') is distinct from 'string' or length(d->>'title') not between 1 and 120 or btrim(d->>'title')='' or jsonb_typeof(d->'body') is distinct from 'string' or length(d->>'body')>200000 or jsonb_typeof(d->'trashed') is distinct from 'boolean' then raise exception 'invalid_document_snapshot' using errcode='22023'; end if;
 perform office_private.check_stamp(d->'updatedAt');
 if rich is not null then
  if jsonb_typeof(rich) is distinct from 'object' or rich-array['version','originalMarkdown','content','layout']<>'{}' or rich->'version' is distinct from '1'::jsonb or rich->'originalMarkdown' is distinct from d->'body' or rich->'content'->>'type' is distinct from 'doc' or octet_length(rich::text)>4000000 then raise exception 'invalid_rich_envelope' using errcode='22023'; end if;
  if rich?'layout' then
   lay:=rich->'layout';
   if jsonb_typeof(lay) is distinct from 'object' or lay-array['paper','orientation','margin']<>'{}' or not (lay?&array['paper','orientation','margin']) or lay->'paper' not in ('"A4"','"Letter"') or lay->'orientation' not in ('"portrait"','"landscape"') or lay->'margin' not in ('12','20','25','30') then raise exception 'invalid_page_layout' using errcode='22023'; end if;
  end if;
  perform office_private.check_node(rich->'content',0);
  perform office_private.check_tree_shape(rich->'content');
 end if;
end $;
commit;
