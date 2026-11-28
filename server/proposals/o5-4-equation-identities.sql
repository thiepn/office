-- O5.4 source-only optional stable display equation identities. No authorization or release changes.
begin;
create or replace function office_private.check_node(n jsonb, depth integer)
returns void language plpgsql set search_path='' as $$
declare typ text; a jsonb; k text; v jsonb; c jsonb; m jsonb; mt text; s jsonb; f jsonb; ids text[]:=array[]::text[]; keys text[]:=array[]::text[]; bytes bigint:=0;
begin
 if depth>40 or jsonb_typeof(n) is distinct from 'object' or n- array['type','attrs','marks','content','text'] <> '{}'::jsonb then raise exception 'invalid_structured_node' using errcode='22023'; end if;
 typ:=n->>'type';
 if typ in ('researchCatalog','researchCitation') then
  a:=n->'attrs';
  if jsonb_typeof(a) is distinct from 'object' or n?'text' or n?'marks' or n?'content' then raise exception 'invalid_research_node' using errcode='22023';end if;
  if typ='researchCitation' then
   if a-'sourceId'<>'{}' or jsonb_typeof(a->'sourceId') is distinct from 'string' or (a->>'sourceId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_citation' using errcode='22023';end if;
  else
   if a-'sources'<>'{}' or jsonb_typeof(a->'sources') is distinct from 'array' then raise exception 'invalid_catalogue' using errcode='22023';end if;
   if jsonb_array_length(a->'sources')>128 then raise exception 'source_limit' using errcode='22023';end if;
   for s in select value from jsonb_array_elements(a->'sources') loop
    if jsonb_typeof(s) is distinct from 'object' or s-array['id','key','type','fields']<>'{}' or jsonb_typeof(s->'id') is distinct from 'string' or (s->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(s->'key') is distinct from 'string' or (s->>'key') !~ '^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,79}$'
     or jsonb_typeof(s->'type') is distinct from 'string' or s->>'type' not in ('article','book','inproceedings','incollection','thesis','phdthesis','mastersthesis','techreport','online','misc','unpublished','manual')
     or jsonb_typeof(s->'fields') is distinct from 'object' then raise exception 'invalid_source' using errcode='22023';end if;
    f:=s->'fields';
    if jsonb_typeof(f->'title') is distinct from 'string' or (f->>'title') !~ '[^[:space:]]' or s->>'id'=any(ids) or s->>'key'=any(keys) then raise exception 'invalid_source_title_or_duplicate' using errcode='22023';end if;
    ids:=array_append(ids,s->>'id');keys:=array_append(keys,s->>'key');bytes:=bytes+octet_length(s::text);
    if bytes>200000 then raise exception 'source_bytes_limit' using errcode='22023';end if;
    for k,v in select key,value from jsonb_each(f) loop
     if k not in ('author','editor','title','year','journal','booktitle','publisher','institution','school','volume','number','pages','edition','address','month','doi','url','note','howpublished','organization','series','isbn','issn','chapter','type') or jsonb_typeof(v) is distinct from 'string' or not office_private.valid_bib_field(v#>>'{}') then raise exception 'invalid_source_field' using errcode='22023';end if;
    end loop;
   end loop;
  end if;
  return;
 end if;
 if typ in ('academicBlock','academicReference') then
  a:=n->'attrs';
  if jsonb_typeof(a) is distinct from 'object' or n?'text' or n?'marks' then raise exception 'invalid_academic_attrs' using errcode='22023';end if;
  if typ='academicReference' then
   if n?'content' or a-'targetId'<>'{}' or jsonb_typeof(a->'targetId') is distinct from 'string' or (a->>'targetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_academic_reference' using errcode='22023';end if;
  else
   if a-array['id','kind','label']<>'{}' or jsonb_typeof(a->'id') is distinct from 'string' or (a->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(a->'kind') is distinct from 'string' or a->>'kind' not in ('definition','theorem','lemma','proposition','corollary','proof')
    or jsonb_typeof(a->'label') is distinct from 'string' or (a->>'label') !~ '^[A-Za-z][A-Za-z0-9_.:-]{0,63}$'
    or jsonb_typeof(n->'content') is distinct from 'array' then raise exception 'invalid_academic_block' using errcode='22023';end if;
   for c in select value from jsonb_array_elements(n->'content') loop perform office_private.check_node(c,depth+1);end loop;
  end if;
  return;
 end if;
 if typ in ('inlineEquation','displayEquation') then
  a:=n->'attrs';
  if n?'content' or n?'marks' or n?'text' or jsonb_typeof(a) is distinct from 'object'
   or jsonb_typeof(a->'latex') is distinct from 'string'
   or octet_length(a->>'latex') not between 1 and 2048
   or (a->>'latex') !~ '[^[:space:]]'
   or translate(a->>'latex',chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]'
   or (a->>'latex') ~ (chr(92)||chr(92)||'(href|url|includegraphics|html[A-Za-z]*|class|style|cssId|unicode|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|global|catcode|input|include|openout|write|read|usepackage|csname|expandafter|noexpand|tag|label|ref|eqref|notag|nonumber)(?![A-Za-z])')
   or (typ='inlineEquation' and (a-'latex'<>'{}' or position(chr(10) in a->>'latex')>0 or position(chr(13) in a->>'latex')>0))
   or (typ='displayEquation' and (a-array['latex','numbered','id']<>'{}' or jsonb_typeof(a->'numbered') is distinct from 'boolean' or (coalesce(a->'id','null'::jsonb)<>'null'::jsonb and (jsonb_typeof(a->'id') is distinct from 'string' or (a->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))))
  then raise exception 'invalid_equation' using errcode='22023';end if;
  return;
 end if;
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
create or replace function office_private.check_tree_shape(root jsonb)
returns void language plpgsql set search_path='' as $$
declare total_nodes bigint; total_text bigint; invalid boolean; equation_count bigint; academic_count bigint; reference_count bigint; unique_ids bigint; unique_labels bigint; catalogue_count bigint; citation_count bigint; equation_ids bigint; target_ids bigint;
begin
 with recursive walk(n,parent_type) as (
  select root,null::text
  union all
  select child.value,w.n->>'type' from walk w cross join lateral jsonb_array_elements(coalesce(w.n->'content','[]'::jsonb)) child(value)
 ), shape as (
  select n,parent_type,n->>'type' typ,coalesce(n->'content','[]'::jsonb) children from walk
 )
 select count(*),coalesce(sum(case when typ='text' then length(n->>'text') when typ in ('inlineEquation','displayEquation') then length(n->'attrs'->>'latex') else 0 end),0),
 coalesce(bool_or(
  case
  when typ='researchCatalog' then parent_type is distinct from 'doc' or jsonb_array_length(children)<>0
  when typ='researchCitation' then parent_type is null or parent_type not in ('paragraph','heading') or jsonb_array_length(children)<>0
  when typ='academicBlock' then parent_type is distinct from 'doc' or jsonb_array_length(children)=0 or children->0->>'type' is distinct from 'paragraph' or exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('paragraph','heading','blockquote','bulletList','orderedList','codeBlock','horizontalRule','table','displayEquation'))
  when typ='academicReference' then parent_type not in ('paragraph','heading') or parent_type is null or jsonb_array_length(children)<>0
  when typ in ('text','hardBreak','horizontalRule','inlineEquation','displayEquation') then jsonb_array_length(children)<>0
  when typ in ('paragraph','heading') then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('text','hardBreak','inlineEquation','academicReference','researchCitation'))
  when typ='codeBlock' then exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'text' or jsonb_array_length(coalesce(c->'marks','[]'))<>0)
  when typ in ('bulletList','orderedList') then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'listItem')
  when typ='table' then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'tableRow')
  when typ='tableRow' then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('tableCell','tableHeader'))
  when typ in ('doc','blockquote','listItem','tableCell','tableHeader') then
    jsonb_array_length(children)=0 or (typ='listItem' and children->0->>'type' is distinct from 'paragraph')
    or exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('paragraph','heading','blockquote','bulletList','orderedList','codeBlock','horizontalRule','table','displayEquation','academicBlock','researchCatalog'))
  else true end
 ),false),count(*) filter(where typ in ('inlineEquation','displayEquation')) ,count(*) filter(where typ='academicBlock'),count(*) filter(where typ='academicReference'),count(distinct n->'attrs'->>'id') filter(where typ='academicBlock'),count(distinct n->'attrs'->>'label') filter(where typ='academicBlock') ,count(*) filter(where typ='researchCatalog'),count(*) filter(where typ='researchCitation'),count(n->'attrs'->>'id') filter(where typ='displayEquation'),count(distinct n->'attrs'->>'id') filter(where typ in ('academicBlock','displayEquation')) into total_nodes,total_text,invalid,equation_count,academic_count,reference_count,unique_ids,unique_labels,catalogue_count,citation_count,equation_ids,target_ids from shape;
 if invalid or total_nodes>30000 or total_text>200000 or equation_count>128 or academic_count>256 or reference_count>1024 or academic_count<>unique_ids or academic_count+equation_ids<>target_ids or academic_count<>unique_labels or catalogue_count>1 or citation_count>1024 then raise exception 'invalid_structured_content_grammar' using errcode='22023';end if;
end $$;
revoke all on function office_private.check_tree_shape(jsonb) from public,anon,authenticated;
commit;
