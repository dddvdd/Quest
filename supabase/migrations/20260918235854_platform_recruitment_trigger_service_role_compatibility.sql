-- Trusted backend writes fire the publication trigger even when platform_status
-- remains draft. Permit the trigger's non-sensitive active-role lookup to run
-- for service_role; recruitment/matching business RPCs remain unavailable.

BEGIN;

GRANT EXECUTE ON FUNCTION public.app_current_user_role_text() TO service_role;

COMMIT;
