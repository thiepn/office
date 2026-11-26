\set ON_ERROR_STOP on
set role anon;
do $$begin begin perform public.office_sync_manifest('a0000000-0000-4000-8000-000000000001');raise exception 'anonymous manifest allowed';exception when insufficient_privilege then raise notice 'PASS: manifest anonymous denied';end;end$$;
reset role;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';b uuid:='a0000000-0000-4000-8000-000000000002';d jsonb:=fixture.doc('discovery-fixture');
begin
 perform fixture.assert(public.office_sync_manifest(a)='[]','empty manifest');
 perform fixture.assert(public.office_sync_push(a,fixture.op(100,null,d))->>'status'='applied','manifest fixture committed');
 perform fixture.assert(public.office_sync_manifest(a)='[{"id":"discovery-fixture","revision":0}]','manifest minimal ID and revision only');
 perform fixture.assert(public.office_sync_push(a,fixture.op(101,0,fixture.next(d,'new')||'{"trashed":true}'))->>'status'='applied','trashed document committed');
 perform fixture.assert(public.office_sync_manifest(a)='[{"id":"discovery-fixture","revision":1}]','manifest includes trashed revision');
 begin perform public.office_sync_manifest(b);raise exception 'wrong owner allowed';exception when insufficient_privilege then raise notice 'PASS: manifest expected owner denied';end;
 perform fixture.identity(2);
 perform fixture.assert(public.office_sync_manifest(b)='[]','manifest cross-owner isolation');
 perform fixture.identity(1,2,false,3);
 begin perform public.office_sync_manifest(a);raise exception 'wrong client allowed';exception when insufficient_privilege then raise notice 'PASS: manifest wrong client denied';end;
 perform fixture.identity(1);
end$$;
reset role;
update public.account_app_grants set status='denied' where user_id='a0000000-0000-4000-8000-000000000001' and permission_id='app_data.read';
set role authenticated;
do $$begin begin perform public.office_sync_manifest('a0000000-0000-4000-8000-000000000001');raise exception 'revoked grant allowed';exception when insufficient_privilege then raise notice 'PASS: manifest revoked grant denied';end;end$$;
reset role;
update public.account_app_grants set status='granted' where permission_id='app_data.read';
insert into auth.sessions values('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001');
