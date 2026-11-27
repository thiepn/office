\set ON_ERROR_STOP on
begin;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';d jsonb:=fixture.doc('equation-identities');rich jsonb;next_doc jsonb;eq jsonb;ref jsonb;invalid jsonb;payload jsonb;begin
 eq:='{"type":"displayEquation","attrs":{"latex":"x=1","numbered":true,"id":"ab000000-0000-4000-8000-000000000006"}}';
 ref:='{"type":"paragraph","content":[{"type":"academicReference","attrs":{"targetId":"ab000000-0000-4000-8000-000000000006"}}]}';
 rich:=jsonb_build_object('version',1,'originalMarkdown','source','content',jsonb_build_object('type','doc','content',jsonb_build_array(ref,eq)));
 d:=d||jsonb_build_object('rich',rich);
 perform fixture.assert(public.office_sync_push(a,fixture.op(951,null,d))->>'status'='applied','stable equation reference create');
 perform fixture.assert(public.office_sync_read(a,'equation-identities')=d,'stable equation ID and reference exact roundtrip');
 next_doc:=fixture.next(d,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content,1,attrs,numbered}','false'));
 perform fixture.assert(public.office_sync_push(a,fixture.op(952,0,next_doc))->>'status'='applied','unnumbered equation retains identity');
 perform fixture.assert(public.office_sync_read(a,'equation-identities')=next_doc,'equation identity and history retained');
 for invalid in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_array(ref,eq,eq),
 jsonb_build_array(ref,jsonb_set(eq,'{attrs,id}','"invalid"')),
 jsonb_build_array(ref,eq,jsonb_build_object('type','academicBlock','attrs',jsonb_build_object('id',eq->'attrs'->>'id','kind','theorem','label','same'),'content',jsonb_build_array(jsonb_build_object('type','paragraph'))))
 )) loop
  payload:=fixture.doc('invalid-equation-identities')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',invalid));
  begin perform public.office_sync_push(a,fixture.op(953,null,payload));raise exception 'invalid identity accepted';exception when invalid_parameter_value then raise notice 'PASS: invalid equation identity rejected';end;
 end loop;
 perform fixture.assert(public.office_sync_read(a,'invalid-equation-identities') is null,'invalid equation identities leave no record');
end$$;
reset role;
rollback;
