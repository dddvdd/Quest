-- Remove the obsolete unledgered p_platform_only overload. Its defaulted
-- arguments collide with the canonical two-argument batch profile RPC.

BEGIN;

DROP FUNCTION IF EXISTS public.get_vacancies_match_profiles(uuid[], uuid, boolean);

COMMIT;
