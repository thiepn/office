\set ON_ERROR_STOP on
-- Verify disabled default and non-destructive rollback; rollback all test data.
begin;
select fixture.assert((select not enabled from office_private.release_gate where singleton),'release disabled by default');
set role authenticated;
select fixture.identity(1);
do $$begin
 begin perform public.office_sync_read('a0000000-0000-4000-8000-000000000001','release-test');raise exception 'disabled gate allowed';exception when insufficient_privilege then raise notice 'PASS: disabled gate denies read';end;
 begin update office_private.release_gate set enabled=true;raise exception 'client enabled gate';exception when insufficient_privilege then raise notice 'PASS: client cannot enable gate';end;
end$$;
reset role;
update office_private.release_gate set enabled=true where singleton;
set role authenticated;
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';begin
 perform fixture.assert(public.office_sync_push(a,fixture.op(501,null,fixture.doc('release-test')))->>'status'='applied','enabled gate permits authorized write');
end$$;
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='b0000000-0000-4000-8000-000000000001';
set role authenticated;
do $$begin begin perform public.office_sync_read('a0000000-0000-4000-8000-000000000001','release-test');raise exception 'expired session allowed';exception when insufficient_privilege then raise notice 'PASS: expired session denied';end;end$$;
reset role;
update auth.sessions set not_after=null where id='b0000000-0000-4000-8000-000000000001';
insert into public.account_deletion_requests values('a0000000-0000-4000-8000-000000000001','pending');
set role authenticated;
do $$begin begin perform public.office_sync_push('a0000000-0000-4000-8000-000000000001',fixture.op(501,null,fixture.doc('release-test')));raise exception 'pending deletion replay allowed';exception when insufficient_privilege then raise notice 'PASS: pending deletion denies receipt replay';end;end$$;
reset role;
delete from public.account_deletion_requests where user_id='a0000000-0000-4000-8000-000000000001';
update office_private.release_gate set enabled=false where singleton;
set role authenticated;
do $$begin begin perform public.office_sync_push('a0000000-0000-4000-8000-000000000001',fixture.op(501,null,fixture.doc('release-test')));raise exception 'rollback replay allowed';exception when insufficient_privilege then raise notice 'PASS: rollback denies replay';end;end$$;
reset role;
select fixture.assert(exists(select 1 from office_private.documents where document_id='release-test') and exists(select 1 from office_private.receipts where operation_id='d0000000-0000-4000-8000-000000000501'),'rollback preserves document and receipt');
update office_private.release_gate set enabled=true where singleton;
set role authenticated;
select fixture.assert(public.office_sync_push('a0000000-0000-4000-8000-000000000001',fixture.op(501,null,fixture.doc('release-test')))->>'status'='applied','re-enable replays original receipt');
reset role;
select fixture.assert(not office_private.valid_revision('"not numeric"') and not office_private.valid_revision('null') and office_private.valid_revision('0'),'malformed revisions fail closed');
rollback;
