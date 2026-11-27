\set ON_ERROR_STOP on
begin;
set role authenticated;
select fixture.identity(1);
do $$declare a uuid:='a0000000-0000-4000-8000-000000000001';d jsonb:=fixture.doc('research-citations');rich jsonb;next_doc jsonb;invalid jsonb;payload jsonb;src jsonb;cat jsonb;cit jsonb;begin
 src:='{"id":"ab000000-0000-4000-8000-000000000001","key":"ada","type":"article","fields":{"title":"First {Paper}","author":"Ada Lovelace","year":"1843"}}'::jsonb;
 cat:=jsonb_build_object('type','researchCatalog','attrs',jsonb_build_object('sources',jsonb_build_array(src)));
 cit:='{"type":"paragraph","content":[{"type":"researchCitation","attrs":{"sourceId":"ab000000-0000-4000-8000-000000000001"}}]}'::jsonb;
 rich:=jsonb_build_object('version',1,'originalMarkdown','source','content',jsonb_build_object('type','doc','content',jsonb_build_array(cit,cat)));
 d:=d||jsonb_build_object('rich',rich);
 perform fixture.assert(public.office_sync_push(a,fixture.op(901,null,d))->>'status'='applied','research catalogue create');
 perform fixture.assert(public.office_sync_read(a,'research-citations')=d,'research exact source and citation retained');
 next_doc:=fixture.next(d,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content,1,attrs,sources,0,key}','"renamed"'));
 perform fixture.assert(public.office_sync_push(a,fixture.op(902,0,next_doc))->>'status'='applied','source key rename CAS update');
 perform fixture.assert(public.office_sync_read(a,'research-citations')=next_doc and next_doc->'history'->0->'rich'=rich,'citation identity and history preserved');
 for invalid in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_array(cit,cat,cat),
 jsonb_build_array(cit,jsonb_set(cat,'{attrs,sources}',jsonb_build_array(src,src))),
 jsonb_build_array(cit,jsonb_set(cat,'{attrs,sources}',jsonb_build_array(src,jsonb_set(src,'{id}','"ab000000-0000-4000-8000-000000000002"')))),
 jsonb_build_array(cit,jsonb_set(cat,'{attrs,sources,0,fields,title}','"{unbalanced"')),
 jsonb_build_array(cit,jsonb_set(cat,'{attrs,sources,0,fields,unknown}','"x"',true)),
 jsonb_build_array(cit->'content'->0,cat),
 jsonb_build_array(jsonb_set(cit,'{content,0,attrs,number}','1',true),cat)
 )) loop
  payload:=fixture.doc('invalid-research')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',invalid));
  begin perform public.office_sync_push(a,fixture.op(903,null,payload));raise exception 'invalid research accepted';exception when invalid_parameter_value then raise notice 'PASS: invalid research rejected';end;
 end loop;
 perform fixture.assert(public.office_sync_read(a,'invalid-research') is null,'invalid research leaves no record');
 next_doc:=fixture.next(next_doc,'source')||jsonb_build_object('rich',jsonb_set(rich,'{content,content}',jsonb_build_array(cit,jsonb_set(cat,'{attrs,sources}','[]'))));
 perform fixture.assert(public.office_sync_push(a,fixture.op(904,1,next_doc))->>'status'='applied','missing source citation preserved');
 perform fixture.assert(public.office_sync_read(a,'research-citations')=next_doc,'missing source exact identity retained');
end$$;
reset role;
rollback;
