-- Additive source-only proposal after O4.6; preserves the disabled release gate and all RPC authorization.
begin;
create or replace function office_private.check_node(n jsonb, depth integer)
returns void language plpgsql set search_path='' as $$
declare typ text; a jsonb; k text; v jsonb; c jsonb; m jsonb; mt text;
begin
 if depth>40 or jsonb_typeof(n) is distinct from 'object' or n- array['type','attrs','marks','content','text'] <> '{}'::jsonb then raise exception 'invalid_structured_node' using errcode='22023'; end if;
 typ:=n->>'type';
 if typ in ('inlineEquation','displayEquation') then
  a:=n->'attrs';
  if n?'content' or n?'marks' or n?'text' or jsonb_typeof(a) is distinct from 'object'
   or jsonb_typeof(a->'latex') is distinct from 'string'
   or octet_length(a->>'latex') not between 1 and 2048
   or (a->>'latex') !~ '[^[:space:]]'
   or translate(a->>'latex',chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]'
   or (a->>'latex') ~ (chr(92)||chr(92)||'(href|url|includegraphics|html[A-Za-z]*|class|style|cssId|unicode|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|global|catcode|input|include|openout|write|read|usepackage|csname|expandafter|noexpand|tag|label|ref|eqref|notag|nonumber)(?![A-Za-z])')
   or (typ='inlineEquation' and (a-'latex'<>'{}' or position(chr(10) in a->>'latex')>0 or position(chr(13) in a->>'latex')>0))
   or (typ='displayEquation' and (a-array['latex','numbered']<>'{}' or jsonb_typeof(a->'numbered') is distinct from 'boolean'))
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
declare total_nodes bigint; total_text bigint; invalid boolean; equation_count bigint;
begin
 with recursive walk(n) as (
  select root
  union all
  select child.value from walk w cross join lateral jsonb_array_elements(coalesce(w.n->'content','[]'::jsonb)) child(value)
 ), shape as (
  select n,n->>'type' typ,coalesce(n->'content','[]'::jsonb) children from walk
 )
 select count(*),coalesce(sum(case when typ='text' then length(n->>'text') when typ in ('inlineEquation','displayEquation') then length(n->'attrs'->>'latex') else 0 end),0),
 coalesce(bool_or(
  case
  when typ in ('text','hardBreak','horizontalRule','inlineEquation','displayEquation') then jsonb_array_length(children)<>0
  when typ in ('paragraph','heading') then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('text','hardBreak','inlineEquation'))
  when typ='codeBlock' then exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'text' or jsonb_array_length(coalesce(c->'marks','[]'))<>0)
  when typ in ('bulletList','orderedList') then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'listItem')
  when typ='table' then jsonb_array_length(children)=0 or exists(select 1 from jsonb_array_elements(children) c where c->>'type'<>'tableRow')
  when typ='tableRow' then exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('tableCell','tableHeader'))
  when typ in ('doc','blockquote','listItem','tableCell','tableHeader') then
    jsonb_array_length(children)=0 or (typ='listItem' and children->0->>'type' is distinct from 'paragraph')
    or exists(select 1 from jsonb_array_elements(children) c where c->>'type' not in ('paragraph','heading','blockquote','bulletList','orderedList','codeBlock','horizontalRule','table','displayEquation'))
  else true end
 ),false),count(*) filter(where typ in ('inlineEquation','displayEquation')) into total_nodes,total_text,invalid,equation_count from shape;
 if invalid or total_nodes>30000 or total_text>200000 or equation_count>128 then raise exception 'invalid_structured_content_grammar' using errcode='22023';end if;
end $$;
revoke all on function office_private.check_tree_shape(jsonb) from public,anon,authenticated;
commit;
