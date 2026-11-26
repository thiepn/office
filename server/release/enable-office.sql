-- Operator-only, after all release gates and explicit approval.
-- Require expected disabled singleton; never enable via browser or URL.
begin;
do $$begin
 update office_private.release_gate set enabled=true where singleton and not enabled;
 if not found then raise exception 'Office gate missing or already enabled';end if;
end$$;
commit;
