-- Source-only proposal; isolated PostgreSQL qualification only.
begin;
create table office_private.batch_receipts(
 owner_id uuid not null references auth.users(id) on delete cascade,
 batch_id uuid not null,
 request_hash bytea not null check(octet_length(request_hash)=32),
 response jsonb not null,
 primary key(owner_id,batch_id)
);
alter table office_private.batch_receipts enable row level security;
revoke all on office_private.batch_receipts from public,anon,authenticated;
create function office_private.import_batch(expected_owner uuid,batch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; bid uuid; h bytea; prior office_private.batch_receipts%rowtype;
 d jsonb; docs jsonb; ids text[]:='{}'; collisions jsonb; result jsonb; total_bytes bigint;
begin
 uid:=office_private.authorize(expected_owner,'app_data.write');
 perform office_private.authorize(expected_owner,'app_data.read');
 if jsonb_typeof(batch) is distinct from 'object' or not(batch?&array['id','source','scope','sourceDigest','documents']) or batch-array['id','source','scope','sourceDigest','documents']<>'{}'
 or jsonb_typeof(batch->'id') is distinct from 'string' or (batch->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or coalesce(batch->>'source','') not in ('hub','office') or jsonb_typeof(batch->'scope') is distinct from 'string'
 or not (batch->>'scope'='user:'||uid::text or (batch->>'source'='hub' and batch->>'scope'='guest'))
 or jsonb_typeof(batch->'sourceDigest') is distinct from 'string' or (batch->>'sourceDigest') !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(batch->'documents') is distinct from 'array' or octet_length(batch::text)>20000000 then raise exception 'invalid_import_batch' using errcode='22023';end if;
 docs:=batch->'documents';bid:=(batch->>'id')::uuid;
 if jsonb_array_length(docs) not between 1 and 100 then raise exception 'invalid_batch_count' using errcode='22023';end if;
 h:=pg_catalog.sha256(pg_catalog.convert_to(batch::text,'UTF8'));
 select * into prior from office_private.batch_receipts where owner_id=uid and batch_id=bid;
 if found then
  if prior.request_hash<>h then raise exception 'batch_id_reused' using errcode='22023';end if;
  return prior.response;
 end if;
 for d in select value from jsonb_array_elements(docs) loop
  perform office_private.check_document(d);
  if d->>'id'=any(ids) then raise exception 'duplicate_batch_document' using errcode='22023';end if;
  ids:=array_append(ids,d->>'id');
 end loop;
 -- authorize() holds the same per-owner transaction lock as ordinary CAS pushes.
 select coalesce(jsonb_agg(document_id order by document_id),'[]') into collisions from office_private.documents where owner_id=uid and document_id=any(ids);
 if jsonb_array_length(collisions)>0 then
  result:=jsonb_build_object('status','blocked','batchId',bid,'collisions',collisions);
 else
  if (select count(*) from office_private.documents where owner_id=uid)+cardinality(ids)>100 then raise exception 'document_quota_exceeded' using errcode='54000';end if;
  select coalesce(sum(octet_length(document::text)),0) into total_bytes from office_private.documents where owner_id=uid;
  if total_bytes+(select sum(octet_length(value::text)) from jsonb_array_elements(docs))>67108864 then raise exception 'document_quota_exceeded' using errcode='54000';end if;
  insert into office_private.documents(owner_id,document_id,revision,document)
  select uid,value->>'id',(value->>'revision')::bigint,value from jsonb_array_elements(docs);
  result:=jsonb_build_object('status','applied','batchId',bid,'documents',(select jsonb_agg(jsonb_build_object('id',value->>'id','revision',value->'revision') order by ord) from jsonb_array_elements(docs) with ordinality q(value,ord)));
 end if;
 if (select count(*) from office_private.batch_receipts where owner_id=uid)>=1000 then raise exception 'batch_receipt_quota_exceeded' using errcode='54000';end if;
 insert into office_private.batch_receipts values(uid,bid,h,result);
 return result;
end $$;
revoke all on function office_private.import_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function office_private.import_batch(uuid,jsonb) to authenticated;
create function public.office_sync_import_batch(p_expected_owner uuid,p_batch jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select office_private.import_batch(p_expected_owner,p_batch) $$;
revoke all on function public.office_sync_import_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_sync_import_batch(uuid,jsonb) to authenticated;
commit;
