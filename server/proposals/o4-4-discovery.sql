-- Additive proposal; never automatically applied to hosted Supabase.
begin;
create function office_private.document_manifest(expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
begin
 uid:=office_private.authorize(expected_owner,'app_data.read');
 select coalesce(jsonb_agg(jsonb_build_object('id',d.document_id,'revision',d.revision) order by d.document_id),'[]'::jsonb)
 into result from office_private.documents d where d.owner_id=uid;
 return result;
end $$;
revoke all on function office_private.document_manifest(uuid) from public,anon,authenticated;
grant execute on function office_private.document_manifest(uuid) to authenticated;
create function public.office_sync_manifest(p_expected_owner uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select office_private.document_manifest(p_expected_owner)
$$;
revoke all on function public.office_sync_manifest(uuid) from public,anon,authenticated;
grant execute on function public.office_sync_manifest(uuid) to authenticated;
commit;
