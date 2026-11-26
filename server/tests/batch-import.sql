\set ON_ERROR_STOP on
-- Synthetic tests only; leave discovery and integration fixtures unchanged.
begin;
create function fixture.batch(n integer,scope text,docs jsonb,source text default 'office') returns jsonb language sql immutable as $$
 select jsonb_build_object('id','e0000000-0000-4000-8000-'||lpad(n::text,12,'0'),'source',source,'scope',scope,'sourceDigest',repeat('a',64),'documents',docs)
$$;
set role anon;
do $$begin begin perform public.office_sync_import_batch('a0000000-0000-4000-8000-000000000001','{}');raise exception 'anonymous import allowed';exception when insufficient_privilege then raise notice 'PASS: batch anonymous denied';end;end$$;
reset role;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';b uuid:='a0000000-0000-4000-8000-000000000002';scope text:='user:'||a;d jsonb:=fixture.next(fixture.doc('batch-one'),'revised');e jsonb:=fixture.doc('batch-two');batch jsonb;res jsonb;bad jsonb;
begin
 begin perform 1 from office_private.batch_receipts;raise exception 'direct receipt access';exception when insufficient_privilege then raise notice 'PASS: batch receipts private';end;
 batch:=fixture.batch(1,scope,jsonb_build_array(d,e));
 res:=public.office_sync_import_batch(a,batch);
 perform fixture.assert(res->>'status'='applied' and jsonb_array_length(res->'documents')=2,'batch atomic create receipt');
 perform fixture.assert(public.office_sync_read(a,'batch-one')=d and public.office_sync_read(a,'batch-two')=e,'batch exact IDs and revision history');
 perform fixture.assert(public.office_sync_import_batch(a,batch)=res,'batch replay identical receipt');
 begin perform public.office_sync_import_batch(a,batch||jsonb_build_object('sourceDigest',repeat('b',64)));raise exception 'changed replay allowed';exception when invalid_parameter_value then raise notice 'PASS: changed batch reuse denied';end;
 bad:=fixture.batch(2,scope,jsonb_build_array(fixture.doc('batch-new'),d));
 res:=public.office_sync_import_batch(a,bad);
 perform fixture.assert(res->>'status'='blocked' and res->'collisions'='["batch-one"]','batch collision blocked');
 perform fixture.assert(public.office_sync_read(a,'batch-new') is null and public.office_sync_read(a,'batch-one')=d,'collision no partial write');
 perform fixture.assert(public.office_sync_import_batch(a,bad)=res,'blocked receipt replay stable');
 begin perform public.office_sync_import_batch(a,fixture.batch(3,scope,jsonb_build_array(fixture.doc('batch-invalid-first'),fixture.doc('batch-invalid-second')||'{"body":null}')));raise exception 'invalid second allowed';exception when invalid_parameter_value then raise notice 'PASS: invalid later document rejected';end;
 perform fixture.assert(public.office_sync_read(a,'batch-invalid-first') is null,'invalid batch rolls back entire import');
 begin perform public.office_sync_import_batch(a,fixture.batch(4,scope,jsonb_build_array(e,e)));raise exception 'duplicate IDs allowed';exception when invalid_parameter_value then raise notice 'PASS: duplicate batch IDs denied';end;
 begin perform public.office_sync_import_batch(a,fixture.batch(5,'user:'||b,jsonb_build_array(e)));raise exception 'foreign source allowed';exception when invalid_parameter_value then raise notice 'PASS: source scope mismatch denied';end;
 begin perform public.office_sync_import_batch(b,batch);raise exception 'foreign target allowed';exception when insufficient_privilege then raise notice 'PASS: expected target owner mismatch denied';end;
 perform fixture.assert(public.office_sync_import_batch(a,fixture.batch(6,'guest',jsonb_build_array(fixture.doc('batch-guest')),'hub'))->>'status'='applied','attested Hub guest scope accepted');
 perform fixture.identity(2);
 perform fixture.assert(public.office_sync_read(b,'batch-one') is null,'batch owner isolation');
 perform fixture.assert(public.office_sync_import_batch(b,fixture.batch(1,'user:'||b,jsonb_build_array(e)))->>'status'='applied','batch ID scoped by owner');
 perform fixture.identity(1,2,false,3);
 begin perform public.office_sync_import_batch(a,batch);raise exception 'Hub client allowed';exception when insufficient_privilege then raise notice 'PASS: batch wrong client denied';end;
 perform fixture.identity(1);
end$$;
reset role;
update public.account_app_grants set status='denied' where user_id='a0000000-0000-4000-8000-000000000001' and permission_id='app_data.write';
set role authenticated;
do $$begin begin perform public.office_sync_import_batch('a0000000-0000-4000-8000-000000000001',fixture.batch(1,'user:a0000000-0000-4000-8000-000000000001',jsonb_build_array(fixture.next(fixture.doc('batch-one'),'revised'),fixture.doc('batch-two'))));raise exception 'revoked replay allowed';exception when insufficient_privilege then raise notice 'PASS: batch replay reauthorizes grant';end;end$$;
reset role;
delete from auth.users where id='a0000000-0000-4000-8000-000000000002';
select fixture.assert(not exists(select 1 from office_private.batch_receipts where owner_id='a0000000-0000-4000-8000-000000000002'),'batch receipt deletion cascade');
rollback;
