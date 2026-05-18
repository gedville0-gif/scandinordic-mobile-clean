-- ============================================================================
-- 20261101000002_rate_limit_log.sql
-- Per-user, per-endpoint rate-limit ledger used by Supabase edge functions.
-- ============================================================================
--
-- WHY THIS EXISTS
--   Audit issue #8 — edge functions had no rate limiting, leaving them
--   vulnerable to quota burn (Google Vision API) and abuse of destructive
--   endpoints (delete-account). The supabase/functions/_shared/rateLimit.ts
--   helper writes/reads this table to enforce per-user limits.
--
-- ACCESS MODEL
--   - service_role: full access (bypasses RLS automatically); used by edge
--     functions to count and insert.
--   - anon, authenticated: no access. RLS is enabled with no policies, and
--     SELECT/INSERT/UPDATE/DELETE are explicitly revoked. This table is
--     operational metadata, not user-facing data.
--
-- RETENTION
--   Rows older than ~7 days are useless for rate limiting. There is no
--   automatic cleanup yet — wire `DELETE FROM public.rate_limit_log WHERE
--   hit_at < NOW() - INTERVAL '7 days';` to pg_cron or a scheduled edge
--   function before this table grows unbounded.
--
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id       BIGSERIAL    PRIMARY KEY,
  user_id  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT         NOT NULL,
  hit_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Composite index supports the hot query:
--   SELECT count(*) FROM rate_limit_log
--     WHERE user_id = $1 AND endpoint = $2 AND hit_at >= $3
CREATE INDEX IF NOT EXISTS rate_limit_log_user_endpoint_time_idx
  ON public.rate_limit_log (user_id, endpoint, hit_at DESC);

-- Defence-in-depth: lock down the table to service_role only.
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_log FROM anon;
REVOKE ALL ON public.rate_limit_log FROM authenticated;
-- service_role bypasses RLS by design — no explicit grant needed.

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname = 'rate_limit_log' AND relnamespace = 'public'::regnamespace;
--   -- Expect: t
--
--   SELECT privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='rate_limit_log'
--       AND grantee IN ('anon','authenticated');
--   -- Expect: 0 rows
-- ============================================================================
