-- TEST ONLY: minimal source-derived Account schema, synthetic identities.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,oauth_client_id uuid,not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
create table public.account_apps(slug text primary key,active boolean not null);
create table public.account_first_party_oauth_clients(oauth_client_id uuid primary key,app_slug text references public.account_apps,client_uri text,redirect_uri text,active boolean);
create table public.account_app_connections(user_id uuid references auth.users on delete cascade,app_slug text references public.account_apps,status text,primary key(user_id,app_slug));
create table public.account_app_permissions(app_slug text references public.account_apps,permission_id text,active boolean,primary key(app_slug,permission_id));
create table public.account_app_grants(user_id uuid,app_slug text,permission_id text,status text,primary key(user_id,app_slug,permission_id),foreign key(user_id,app_slug) references public.account_app_connections on delete cascade,foreign key(app_slug,permission_id) references public.account_app_permissions);
create table public.account_deletion_requests(user_id uuid references auth.users on delete cascade,status text);
insert into auth.users values('a0000000-0000-4000-8000-000000000001'),('a0000000-0000-4000-8000-000000000002');
insert into public.account_apps values('office',true),('hub',true);
insert into public.account_first_party_oauth_clients values
 ('c0000000-0000-4000-8000-000000000001','office','https://office.thiepn.dev/','https://office.thiepn.dev/auth/callback/',true),
 ('c0000000-0000-4000-8000-000000000002','hub','https://thiepn.dev/','https://thiepn.dev/home/auth/callback/',true);
insert into auth.sessions values
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002');
insert into public.account_app_connections select id,'office','connected' from auth.users;
insert into public.account_app_permissions values('office','app_data.read',true),('office','app_data.write',true);
insert into public.account_app_grants select u.id,p.app_slug,p.permission_id,'granted' from auth.users u cross join public.account_app_permissions p;
-- Test helper is invoker, no security elevation, never deployed.
create schema fixture;
grant usage on schema fixture to authenticated,anon;
create function fixture.identity(n integer, client integer default 1, anonymous boolean default false, sid integer default null) returns text language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','a0000000-0000-4000-8000-00000000000'||n,'session_id','b0000000-0000-4000-8000-00000000000'||coalesce(sid,n),'client_id','c0000000-0000-4000-8000-00000000000'||client,'is_anonymous',anonymous)::text,false)
$$;
create function fixture.doc(id text,body text default 'source') returns jsonb language sql immutable as $$
 select jsonb_build_object('schemaVersion',1,'id',id,'title','Title','body',body,'createdAt','2026-01-01T00:00:00Z','updatedAt','2026-01-01T00:00:00Z','revision',0,'history','[]'::jsonb,'trashed',false)
$$;
create function fixture.next(d jsonb,body text) returns jsonb language sql immutable as $$
 select d||jsonb_build_object('body',body,'revision',(d->>'revision')::bigint+1,'history',(d->'history')||jsonb_build_array(d-array['schemaVersion','id','createdAt','history']))
$$;
create function fixture.op(n integer,expected bigint,d jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('id','d0000000-0000-4000-8000-'||lpad(n::text,12,'0'),'expected',expected,'doc',d)
$$;
create function fixture.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
