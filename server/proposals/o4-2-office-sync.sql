-- O4.2 PROPOSAL. Not a hosted migration. Apply only to isolated test database.
begin;
create schema office_private;
revoke all on schema office_private from public, anon, authenticated;
grant usage on schema office_private to authenticated;
create table office_private.documents (
 owner_id uuid not null references auth.users(id) on delete cascade,
 document_id text not null check(document_id ~ '^[A-Za-z0-9-]{1,80}$'),
 revision bigint not null check(revision between 0 and 9007199254740991),
 document jsonb not null,
 primary key(owner_id,document_id),
 check(document->>'id'=document_id and (document->>'revision')::bigint=revision)
);
create table office_private.receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 request_hash bytea not null check(octet_length(request_hash)=32),
 response jsonb not null,
 primary key(owner_id,operation_id)
);
alter table office_private.documents enable row level security;
alter table office_private.receipts enable row level security;
revoke all on all tables in schema office_private from public, anon, authenticated;
-- No policies or client table grants: only narrow RPCs below.
create function office_private.authorize(expected uuid, permission text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); claims jsonb:=auth.jwt(); sid uuid; cid uuid;
begin
 if uid is null or expected is distinct from uid or claims->>'is_anonymous' is distinct from 'false' or permission not in ('app_data.read','app_data.write') then
  raise exception 'office_access_denied' using errcode='42501';
 end if;
 begin sid:=(claims->>'session_id')::uuid; cid:=(claims->>'client_id')::uuid;
 exception when invalid_text_representation then raise exception 'office_access_denied' using errcode='42501'; end;
 if sid is null or cid is null then raise exception 'office_access_denied' using errcode='42501'; end if;
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
 and c.app_slug='office' and c.active and a.active
 and c.client_uri='https://office.thiepn.dev/' and c.redirect_uri='https://office.thiepn.dev/auth/callback/'
 and conn.status in ('connected','limited') and g.status='granted' and p.active
 for share of s,c,a,conn,g,p;
 if not found or exists(select 1 from public.account_deletion_requests r where r.user_id=uid and r.status in ('pending','deleting')) then
  raise exception 'office_access_denied' using errcode='42501';
 end if;
 return uid;
end $$;
create function office_private.valid_revision(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='number' and v::text ~ '^(0|[1-9][0-9]{0,15})$' and (v::text)::numeric between 0 and 9007199254740991,false)
$$;
create function office_private.check_stamp(v jsonb)
returns void language plpgsql set search_path='' as $$
declare x timestamptz;
begin
 if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>40 or (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'invalid_timestamp' using errcode='22023'; end if;
 x:=(v#>>'{}')::timestamptz;
 if not isfinite(x) then raise exception 'invalid_timestamp' using errcode='22023'; end if;
end $$;
create function office_private.check_node(n jsonb, depth integer)
returns void language plpgsql set search_path='' as $$
declare typ text; a jsonb; k text; v jsonb; c jsonb; m jsonb; mt text;
begin
 if depth>40 or jsonb_typeof(n) is distinct from 'object' or n- array['type','attrs','marks','content','text'] <> '{}'::jsonb then raise exception 'invalid_structured_node' using errcode='22023'; end if;
 typ:=n->>'type';
 if typ is null or typ not in ('doc','paragraph','text','heading','blockquote','bulletList','orderedList','listItem','codeBlock','hardBreak','horizontalRule','table','tableRow','tableHeader','tableCell') then raise exception 'invalid_node_type' using errcode='22023'; end if;
 if typ='text' then
  if jsonb_typeof(n->'text') is distinct from 'string' or length(n->>'text')=0 or n?'content' then raise exception 'invalid_text_node' using errcode='22023'; end if;
 elsif n?'text' or n?'marks' then raise exception 'invalid_node_payload' using errcode='22023'; end if;
 if n?'attrs' then
  if jsonb_typeof(n->'attrs') is distinct from 'object' then raise exception 'invalid_attrs' using errcode='22023'; end if;
  for k,v in select key,value from jsonb_each(n->'attrs') loop
   if typ in ('paragraph','heading') and k='officeAlign' and v in ('null','"left"','"center"','"right"','"justify"') then continue; end if;
   if typ in ('paragraph','heading') and k='officeSpacing' and v in ('null','1','1.25','1.5','1.75','2') then continue; end if;
   if typ='heading' and k='level' and v in ('1','2','3') then continue; end if;
   if typ='orderedList' and k='start' and office_private.valid_revision(v) and (v::text)::numeric between 1 and 100000 then continue; end if;
   if typ='orderedList' and k='type' and v='null' then continue; end if;
   if typ='codeBlock' and k='language' and (v='null' or (jsonb_typeof(v)='string' and (v#>>'{}') ~ '^[a-zA-Z0-9_+-]{0,40}$')) then continue; end if;
   if typ in ('tableCell','tableHeader') and k in ('colspan','rowspan') and office_private.valid_revision(v) and (v::text)::numeric between 1 and 100 then continue; end if;
   if typ in ('tableCell','tableHeader') and k='align' and v in ('null','"left"','"center"','"right"') then continue; end if;
   if typ in ('tableCell','tableHeader') and k='colwidth' then
    if v='null' then continue; end if;
    if jsonb_typeof(v)='array' then
     if jsonb_array_length(v)<=100 and not exists(select 1 from jsonb_array_elements(v) e where not office_private.valid_revision(e) or (e::text)::numeric>5000) then continue; end if;
    end if;
   end if;
   raise exception 'invalid_node_attribute' using errcode='22023';
  end loop;
 end if;
 if n?'marks' then
  if jsonb_typeof(n->'marks') is distinct from 'array' then raise exception 'invalid_marks' using errcode='22023'; end if;
  if jsonb_array_length(n->'marks')>7 then raise exception 'invalid_marks' using errcode='22023'; end if;
  for m in select value from jsonb_array_elements(n->'marks') loop
   mt:=m->>'type';a:=m->'attrs';
   if jsonb_typeof(m) is distinct from 'object' or m-array['type','attrs']<>'{}' or mt is null or mt not in ('bold','italic','code','strike','underline','link','typography') then raise exception 'invalid_mark' using errcode='22023'; end if;
   if mt='typography' then
    if jsonb_typeof(a) is distinct from 'object' or a-array['font','size','color']<>'{}' or coalesce(a->'font','null') not in ('null','"serif"','"sans"','"mono"') or coalesce(a->'size','null') not in ('null','10','12','14','16','18','20','24','28','32') or coalesce(a->'color','null') not in ('null','"ink"','"blue"','"red"','"green"','"purple"') then raise exception 'invalid_typography' using errcode='22023'; end if;
   elsif mt='link' then
    if jsonb_typeof(a) is distinct from 'object' or a-array['href','target','rel','class','title']<>'{}' or jsonb_typeof(a->'href') is distinct from 'string' or length(a->>'href')>2048 or (a->>'href') ~ '[[:space:][:cntrl:]]' or (a->>'href') !~* '^(https?://[^/?#@]+([/?#].*)?|mailto:[^[:space:]]+)$' or coalesce(a->'target','null') not in ('null','"_blank"') or coalesce(a->'rel','null') not in ('null','"noopener noreferrer"','"noopener noreferrer nofollow"') or coalesce(a->'class','null')<>'null' or coalesce(a->'title','null')<>'null' then raise exception 'unsafe_link' using errcode='22023'; end if;
   elsif a is not null and a<>'{}' then raise exception 'invalid_mark_attributes' using errcode='22023';
   end if;
  end loop;
 end if;
 if n?'content' then
  if jsonb_typeof(n->'content') is distinct from 'array' then raise exception 'invalid_content' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(n->'content') loop perform office_private.check_node(c,depth+1); end loop;
 end if;
end $$;
create function office_private.check_snapshot(d jsonb)
returns void language plpgsql set search_path='' as $$
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
 end if;
end $$;
create function office_private.check_document(d jsonb)
returns void language plpgsql set search_path='' as $$
declare h jsonb; prev bigint:=-1; r bigint;
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>60000000 or d-array['schemaVersion','id','title','body','createdAt','updatedAt','revision','history','trashed','rich']<>'{}' or d->'schemaVersion' is distinct from '1'::jsonb or jsonb_typeof(d->'id') is distinct from 'string' or (d->>'id') !~ '^[A-Za-z0-9-]{1,80}$' or jsonb_typeof(d->'history') is distinct from 'array' then raise exception 'invalid_document' using errcode='22023'; end if;
 if jsonb_array_length(d->'history')>12 then raise exception 'invalid_history' using errcode='22023'; end if;
 perform office_private.check_stamp(d->'createdAt');perform office_private.check_snapshot(d);
 for h in select value from jsonb_array_elements(d->'history') loop
  perform office_private.check_snapshot(h);
  if h-array['revision','title','body','updatedAt','trashed','rich']<>'{}' then raise exception 'invalid_history' using errcode='22023'; end if;
  r:=(h->>'revision')::bigint;
  if r<=prev or r>=(d->>'revision')::bigint then raise exception 'invalid_history_order' using errcode='22023'; end if;
  prev:=r;
 end loop;
end $$;
create function office_private.read_document(expected_owner uuid, doc_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
begin
 uid:=office_private.authorize(expected_owner,'app_data.read');
 if doc_id is null or doc_id !~ '^[A-Za-z0-9-]{1,80}$' then raise exception 'invalid_document_id' using errcode='22023'; end if;
 select d.document into result from office_private.documents d where d.owner_id=uid and d.document_id=doc_id;
 return result;
end $$;
create function office_private.push_document(expected_owner uuid, op jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; oid uuid; h bytea; prior office_private.receipts%rowtype; current_doc jsonb; d jsonb; expected bigint; next_rev bigint; result jsonb; next_history jsonb; doc_bytes bigint; receipt_bytes bigint;
begin
 uid:=office_private.authorize(expected_owner,'app_data.write');
 -- Conflict responses include the remote snapshot; require read permission too.
 perform office_private.authorize(expected_owner,'app_data.read');
 if jsonb_typeof(op) is distinct from 'object' or not(op?&array['id','expected','doc']) or op-array['id','expected','doc']<>'{}' or jsonb_typeof(op->'id') is distinct from 'string' or (op->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_operation' using errcode='22023'; end if;
 oid:=(op->>'id')::uuid;d:=op->'doc';perform office_private.check_document(d);
 next_rev:=(d->>'revision')::bigint;
 if op->'expected'<>'null'::jsonb then
  if not office_private.valid_revision(op->'expected') then raise exception 'invalid_expected_revision' using errcode='22023'; end if;
  expected:=(op->>'expected')::bigint;
  if next_rev<>expected+1 then raise exception 'invalid_cas_transition' using errcode='22023'; end if;
 end if;
 h:=pg_catalog.sha256(pg_catalog.convert_to(op::text,'UTF8'));
 select * into prior from office_private.receipts where owner_id=uid and operation_id=oid;
 if found then
  if prior.request_hash<>h then raise exception 'operation_id_reused' using errcode='22023'; end if;
  return prior.response;
 end if;
 select document into current_doc from office_private.documents where owner_id=uid and document_id=d->>'id';
 if (current_doc is null and expected is not null) or (current_doc is not null and (expected is null or (current_doc->>'revision')::bigint<>expected)) then
  result:=jsonb_build_object('status','conflict','operationId',oid,'document',current_doc);
 else
  if current_doc is not null then
   if d->'createdAt' is distinct from current_doc->'createdAt' or (current_doc?'rich' and (not(d?'rich') or d->'body' is distinct from current_doc->'body')) then raise exception 'immutable_source_changed' using errcode='22023'; end if;
   select coalesce(jsonb_agg(v order by ord),'[]'::jsonb) into next_history from jsonb_array_elements((current_doc->'history')||jsonb_build_array(current_doc-array['schemaVersion','id','createdAt','history'])) with ordinality q(v,ord) where ord>greatest(0,jsonb_array_length(current_doc->'history')+1-12);
   if d->'history' is distinct from next_history then raise exception 'history_chain_changed' using errcode='22023'; end if;
  elsif (select count(*) from office_private.documents where owner_id=uid)>=100 then raise exception 'document_quota_exceeded' using errcode='54000'; end if;
  select coalesce(sum(octet_length(document::text)),0) into doc_bytes from office_private.documents where owner_id=uid and document_id<>d->>'id';
  if doc_bytes+octet_length(d::text)>67108864 then raise exception 'document_quota_exceeded' using errcode='54000'; end if;
  insert into office_private.documents(owner_id,document_id,revision,document) values(uid,d->>'id',next_rev,d)
   on conflict(owner_id,document_id) do update set revision=excluded.revision,document=excluded.document;
  result:=jsonb_build_object('status','applied','operationId',oid,'revision',next_rev);
 end if;
 select coalesce(sum(octet_length(response::text)),0) into receipt_bytes from office_private.receipts where owner_id=uid;
 if (select count(*) from office_private.receipts where owner_id=uid)>=10000 or receipt_bytes+octet_length(result::text)>67108864 then raise exception 'receipt_quota_exceeded' using errcode='54000'; end if;
 insert into office_private.receipts(owner_id,operation_id,request_hash,response) values(uid,oid,h,result);
 return result;
end $$;
-- Private definer implementations retain explicit owner/session checks.
-- Public RPCs are invoker wrappers; only authenticated gets execution.
revoke all on all functions in schema office_private from public, anon, authenticated;
grant execute on function office_private.read_document(uuid,text),office_private.push_document(uuid,jsonb) to authenticated;
create function public.office_sync_read(p_expected_owner uuid,p_document_id text)
returns jsonb language sql security invoker set search_path='' as $$ select office_private.read_document(p_expected_owner,p_document_id) $$;
create function public.office_sync_push(p_expected_owner uuid,p_operation jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select office_private.push_document(p_expected_owner,p_operation) $$;
revoke all on function public.office_sync_read(uuid,text),public.office_sync_push(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_sync_read(uuid,text),public.office_sync_push(uuid,jsonb) to authenticated;
commit;
