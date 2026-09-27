-- Remove the obsolete unledgered overload whose default second argument makes
-- PostgREST one-argument publish calls ambiguous with the canonical RPC.

BEGIN;

DROP FUNCTION IF EXISTS public.publish_vacancy(uuid, timestamptz);

COMMIT;
