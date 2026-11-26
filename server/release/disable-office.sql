-- Operator-only, after explicit approval. Non-destructive rollback.
begin;
update office_private.release_gate set enabled=false where singleton;
-- Do not drop tables, receipts, OAuth registration, local data, or shared Account objects.
commit;
