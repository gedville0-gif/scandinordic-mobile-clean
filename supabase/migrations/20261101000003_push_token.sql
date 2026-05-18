-- ============================================================================
-- 20261101000003_push_token.sql
-- Add push_token column to public.profiles for Expo push notifications.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Partial index — only non-null tokens are queryable (and the rest are NULL
-- until the user grants notification permission).
CREATE INDEX IF NOT EXISTS profiles_push_token_idx
  ON public.profiles (push_token)
  WHERE push_token IS NOT NULL;

COMMIT;
