-- Fix: grant EXECUTE on program_internal.link_is_verified to authenticated
-- so that get_program_metrics (SECURITY INVOKER) can call it.
-- The verified_employment CTE inside get_program_metrics invokes
-- program_internal.link_is_verified, which is SECURITY INVOKER and
-- currently only granted to postgres. Without this grant, any
-- authenticated caller gets "permission denied for function link_is_verified".

GRANT EXECUTE ON FUNCTION program_internal.link_is_verified(uuid, uuid) TO authenticated;
