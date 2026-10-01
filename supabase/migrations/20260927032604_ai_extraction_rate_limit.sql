-- ============================================================
-- Migration: AI Extraction Rate Limit
-- ============================================================
-- The extract-employment Edge Function spends money per call, so one account
-- must not be able to generate unbounded provider cost. Supabase's built-in
-- rate limits do not cover Edge Function invocations keyed by user, so the
-- limit is enforced here.
--
-- Design notes:
--   - Keyed by auth.uid(), never by a caller-supplied id. An authenticated
--     user therefore cannot spend another account's quota or lift their own
--     limit by passing different arguments.
--   - The limit and window are hardcoded rather than parameters. If they were
--     parameters, any authenticated user could call this RPC directly with
--     p_limit => 1000000 and bypass the cap entirely.
--   - The counter is advanced with INSERT ... ON CONFLICT DO UPDATE, which
--     takes a row-level lock. Concurrent invocations serialize on that lock,
--     so the check is race-safe without advisory locks.
--   - Denied attempts do not advance the counter past the cap, so the row
--     cannot grow without bound under abuse.
--
-- Policy: 20 requests per user per hour. Extraction is a back-office
-- data-entry operation, so 20/hour is generous for a staff member registering
-- jobseekers while still bounding worst-case spend. Raise it in this file
-- (never per-request) if legitimate throughput requires more.
--
-- ponytail: global and per-IP throttling are deliberately omitted. This bounds
-- per-account cost, which is the stated objective. Add an IP dimension only if
-- distributed single-account abuse is actually observed.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_extraction_rate_limit (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.ai_extraction_rate_limit ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: this table is reached only through the
-- SECURITY DEFINER RPC below. Direct reads would expose per-user usage.
REVOKE ALL ON public.ai_extraction_rate_limit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_extraction_rate_limit_allow()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_limit constant integer := 20;
  v_window constant interval := interval '1 hour';
  v_count integer;
BEGIN
  -- Fail closed for anonymous or otherwise unidentified callers.
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_extraction_rate_limit AS t (user_id, window_started_at, request_count)
  VALUES (v_user, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET request_count = CASE
          WHEN t.window_started_at < now() - v_window THEN 1
          ELSE t.request_count + 1
        END,
        window_started_at = CASE
          WHEN t.window_started_at < now() - v_window THEN now()
          ELSE t.window_started_at
        END
    -- Once the cap is reached the row is left untouched and no row is
    -- returned, which the caller maps to "denied".
    WHERE t.window_started_at >= now() - v_window
      AND t.request_count < v_limit
  RETURNING request_count INTO v_count;

  RETURN v_count IS NOT NULL;
END;
$function$;

-- Functions in public are executable by PUBLIC by default; close that off and
-- grant only to signed-in users.
REVOKE ALL ON FUNCTION public.ai_extraction_rate_limit_allow() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ai_extraction_rate_limit_allow() TO authenticated;

COMMIT;
