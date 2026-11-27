\set ON_ERROR_STOP on
begin;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';d jsonb:=fixture.doc('academic-structure');rich jsonb;next_doc jsonb;invalid jsonb;payload jsonb;statement jsonb;reference jsonb;begin
 statement:='{"type":"academicBlock","attrs":{"id":"ab000000-0000-4000-8000-000000000001","kind":"theorem","label":"thm:one"},"content":[{"type":"paragraph"},{"type":"displayEquation","attrs":{"latex":"x=x","numbered":true}}]}'::jsonb;
 reference:='{"type":"paragraph","content":[{"type":"academicReference","attrs":{"targetId":"ab000000-0000-4000-8000-000000000001"}}]}'::jsonb;
 rich:=jsonb_build_object('version',1,'originalMarkdown','source','content',jsonb_build_object('type','doc','content',jsonb_build_array(statement,reference)));
 d:=d||jsonb_build_object('rich',rich);
 perform fixture.assert(public.office_sync_push(a,fixture.op(801,null,d))->>'status'='applied','academic structure create');
 perform fixture.assert(public.office_sync_read(a,'academic-structure')=d,'academic exact identity and reference retained');
 next_doc:=fixture.next(d,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content,0,attrs,label}','"thm:renamed"'));
 perform fixture.assert(public.office_sync_push(a,fixture.op(802,0,next_doc))->>'status'='applied','academic label rename CAS update');
 perform fixture.assert(public.office_sync_read(a,'academic-structure')=next_doc and next_doc->'history'->0->'rich'=rich,'academic reference identity and history preserved');
 for invalid in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_array(statement,statement),
 jsonb_build_array(statement,jsonb_set(statement,'{attrs,id}','"ab000000-0000-4000-8000-000000000002"')),
 jsonb_build_array(jsonb_set(statement,'{attrs,number}','1',true)),
 jsonb_build_array(jsonb_set(statement,'{content}','[]')),
 jsonb_build_array(jsonb_build_object('type','blockquote','content',jsonb_build_array(statement))),
 jsonb_build_array(reference->'content'->0),
 jsonb_build_array(jsonb_set(reference,'{content,0,attrs,targetId}','"invalid"'))
 )) loop
  payload:=fixture.doc('invalid-academic')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',invalid));
  begin perform public.office_sync_push(a,fixture.op(803,null,payload));raise exception 'invalid academic structure accepted';exception when invalid_parameter_value then raise notice 'PASS: invalid academic structure rejected';end;
 end loop;
 perform fixture.assert(public.office_sync_read(a,'invalid-academic') is null,'invalid academic structures leave no record');
 next_doc:=fixture.next(next_doc,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',jsonb_build_array(reference)));
 perform fixture.assert(public.office_sync_push(a,fixture.op(804,1,next_doc))->>'status'='applied','dangling reference preserved after target removal');
 perform fixture.assert(public.office_sync_read(a,'academic-structure')=next_doc,'dangling reference exact ID retained');
end$$;
reset role;
rollback;
