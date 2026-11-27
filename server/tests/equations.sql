\set ON_ERROR_STOP on
begin;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';d jsonb:=fixture.doc('academic-math');rich jsonb;next_doc jsonb;invalid jsonb;payload jsonb;begin
 rich:=jsonb_build_object('version',1,'originalMarkdown','source','content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"inlineEquation","attrs":{"latex":"x^2"}}]},{"type":"displayEquation","attrs":{"latex":"\\frac{1}{2}","numbered":true}}]}'::jsonb);
 d:=d||jsonb_build_object('rich',rich);
 perform fixture.assert(public.office_sync_push(a,fixture.op(701,null,d))->>'status'='applied','equation structured create');
 perform fixture.assert(public.office_sync_read(a,'academic-math')=d,'equation exact source and numbering mode retained');
 next_doc:=fixture.next(d,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content,1,attrs,numbered}','false'));
 perform fixture.assert(public.office_sync_push(a,fixture.op(702,0,next_doc))->>'status'='applied','equation revision CAS update');
 perform fixture.assert(public.office_sync_read(a,'academic-math')=next_doc and next_doc->'history'->0->'rich'=rich,'equation history preserves previous formula');
 for invalid in select value from jsonb_array_elements('[{"type":"inlineEquation","attrs":{"latex":"x"}},{"type":"displayEquation","attrs":{"latex":"x","numbered":"yes"}},{"type":"displayEquation","attrs":{"latex":"x","numbered":true,"number":99}},{"type":"displayEquation","attrs":{"latex":"\\includegraphics{https://example.com/a}","numbered":true}},{"type":"displayEquation","attrs":{"latex":"x","numbered":true},"content":[]}]'::jsonb) loop
  payload:=fixture.doc('invalid-equation')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',jsonb_build_array(invalid)));
  begin perform public.office_sync_push(a,fixture.op(703,null,payload));raise exception 'invalid equation accepted';exception when invalid_parameter_value then raise notice 'PASS: invalid equation rejected';end;
 end loop;
 perform fixture.assert(public.office_sync_read(a,'invalid-equation') is null,'invalid equations leave no record');
end$$;
reset role;
rollback;
