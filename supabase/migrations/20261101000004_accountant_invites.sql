-- ============================================================================
-- 20261101000004_accountant_invites.sql
-- Server-side accountant invite ledger. Replaces the AsyncStorage-only
-- accountant list in lib/accountant.ts (which stays for legacy reads until
-- migration is complete).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.accountant_invites (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accountant_email  TEXT         NOT NULL,
  status            TEXT         NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS accountant_invites_inviter_idx
  ON public.accountant_invites (inviter_user_id, created_at DESC);

ALTER TABLE public.accountant_invites ENABLE ROW LEVEL SECURITY;

-- Inviter can read their own invites.
DROP POLICY IF EXISTS accountant_invites_select_own ON public.accountant_invites;
CREATE POLICY accountant_invites_select_own ON public.accountant_invites
  FOR SELECT TO authenticated
  USING (inviter_user_id = auth.uid());

-- Inviter can insert rows for themselves only.
DROP POLICY IF EXISTS accountant_invites_insert_own ON public.accountant_invites;
CREATE POLICY accountant_invites_insert_own ON public.accountant_invites
  FOR INSERT TO authenticated
  WITH CHECK (inviter_user_id = auth.uid());

-- Inviter can delete their own invites.
DROP POLICY IF EXISTS accountant_invites_delete_own ON public.accountant_invites;
CREATE POLICY accountant_invites_delete_own ON public.accountant_invites
  FOR DELETE TO authenticated
  USING (inviter_user_id = auth.uid());

REVOKE ALL ON public.accountant_invites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.accountant_invites TO authenticated;

COMMIT;
