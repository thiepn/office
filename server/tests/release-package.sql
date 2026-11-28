\set ON_ERROR_STOP on
begin;
select fixture.assert((select not enabled from office_private.release_gate where singleton),'O6 complete install remains disabled');
select fixture.assert(to_regprocedure('public.office_sync_import_batch(uuid,jsonb)') is not null,'O6 batch RPC installed');
set role authenticated;
select fixture.identity(1);
do $$begin
 begin perform public.office_sync_read('a0000000-0000-4000-8000-000000000001','test');raise exception 'disabled read allowed';exception when insufficient_privilege then raise notice 'PASS: O6 full install denies read';end;
 begin perform public.office_sync_import_batch('a0000000-0000-4000-8000-000000000001','{}');raise exception 'disabled import allowed';exception when insufficient_privilege then raise notice 'PASS: O6 full install denies import';end;
end$$;
reset role;
rollback;
