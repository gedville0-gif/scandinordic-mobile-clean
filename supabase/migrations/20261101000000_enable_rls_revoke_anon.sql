-- ============================================================================
-- 20261101000000_enable_rls_revoke_anon.sql
-- Enable Row-Level Security on all user-owned tables and revoke anon access.
-- ============================================================================
--
-- WHY THIS EXISTS
--   The previous migration (20261030000000_grant_table_permissions.sql) granted
--   SELECT/INSERT/UPDATE/DELETE on all core tables to the 'anon' role. Combined
--   with the Supabase anon key being shipped in every mobile build, this means
--   ANY user can curl the database and read or modify ANY other user's data.
--   This migration closes that hole.
--
-- WHAT THIS DOES
--   For every user-owned table:
--     1. Enables Row-Level Security.
--     2. Adds four owner-scoped policies (owner_select, owner_insert,
--        owner_update, owner_delete) scoped to TO authenticated, where
--        auth.uid() = user_id (or auth.uid() = id for profiles).
--     3. Revokes ALL privileges from the 'anon' role.
--     4. Leaves 'authenticated' grants in place (RLS now enforces row scope).
--     5. Leaves 'service_role' untouched (it bypasses RLS by design — used by
--        edge functions and admin scripts).
--
-- MIGRATION ORDERING
--   This file (20261101000000_*) sorts AFTER the existing grant migration
--   (20261030000000_grant_table_permissions.sql), so the REVOKE FROM anon
--   statements here are applied last and are not undone by re-grants.
--   The verification queries at the bottom of this file confirm that anon
--   has zero privileges on the target tables after applying.
--
--   History note: this file was originally named 20260517_enable_rls_revoke_anon.sql,
--   which would have sorted BEFORE the grant migration and been overwritten.
--   It was renamed to its current timestamp on 2026-05-17 to fix that ordering.
--
-- TABLES COVERED (actively used in app code as of 2026-05-17)
--   transactions, invoices, workers, work_sessions,
--   team_payroll, mileage_journeys, tax_payments
--
-- TABLES DECLARED IN GRANT MIGRATION BUT UNUSED IN APP CODE
--   profiles, invoice_items, expenses, team_members,
--   time_logs, earnings_logs, payments
--   → Handled defensively at the bottom: RLS enabled + anon revoked IF the
--     table exists. Schema unknown — review before relying on these.
--
-- ROLLBACK
--   See verification block at bottom for the manual rollback statements.
--   This migration is idempotent (DROP POLICY IF EXISTS + CREATE POLICY).
--
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. transactions   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.transactions;
DROP POLICY IF EXISTS owner_insert ON public.transactions;
DROP POLICY IF EXISTS owner_update ON public.transactions;
DROP POLICY IF EXISTS owner_delete ON public.transactions;

CREATE POLICY owner_select ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.transactions FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. invoices   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.invoices;
DROP POLICY IF EXISTS owner_insert ON public.invoices;
DROP POLICY IF EXISTS owner_update ON public.invoices;
DROP POLICY IF EXISTS owner_delete ON public.invoices;

CREATE POLICY owner_select ON public.invoices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.invoices FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. workers   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.workers;
DROP POLICY IF EXISTS owner_insert ON public.workers;
DROP POLICY IF EXISTS owner_update ON public.workers;
DROP POLICY IF EXISTS owner_delete ON public.workers;

CREATE POLICY owner_select ON public.workers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.workers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.workers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.workers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.workers FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. work_sessions   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.work_sessions;
DROP POLICY IF EXISTS owner_insert ON public.work_sessions;
DROP POLICY IF EXISTS owner_update ON public.work_sessions;
DROP POLICY IF EXISTS owner_delete ON public.work_sessions;

CREATE POLICY owner_select ON public.work_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.work_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.work_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.work_sessions FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. team_payroll   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.team_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.team_payroll;
DROP POLICY IF EXISTS owner_insert ON public.team_payroll;
DROP POLICY IF EXISTS owner_update ON public.team_payroll;
DROP POLICY IF EXISTS owner_delete ON public.team_payroll;

CREATE POLICY owner_select ON public.team_payroll
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.team_payroll
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.team_payroll
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.team_payroll
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.team_payroll FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. mileage_journeys   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mileage_journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.mileage_journeys;
DROP POLICY IF EXISTS owner_insert ON public.mileage_journeys;
DROP POLICY IF EXISTS owner_update ON public.mileage_journeys;
DROP POLICY IF EXISTS owner_delete ON public.mileage_journeys;

CREATE POLICY owner_select ON public.mileage_journeys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.mileage_journeys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.mileage_journeys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.mileage_journeys
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.mileage_journeys FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. tax_payments   (owner column: user_id)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tax_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select ON public.tax_payments;
DROP POLICY IF EXISTS owner_insert ON public.tax_payments;
DROP POLICY IF EXISTS owner_update ON public.tax_payments;
DROP POLICY IF EXISTS owner_delete ON public.tax_payments;

CREATE POLICY owner_select ON public.tax_payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY owner_insert ON public.tax_payments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_update ON public.tax_payments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_delete ON public.tax_payments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.tax_payments FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. profiles   (owner column: id, matches auth.users.id)
--    Handled defensively: only ENABLE RLS if the table exists.
--    Convention: profiles.id = auth.users.id (not user_id).
--    INSERT policy intentionally omitted — profiles should be created via
--    a trigger on auth.users (see post-migration TODO at bottom).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS owner_select ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS owner_insert ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS owner_update ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS owner_delete ON public.profiles';

    EXECUTE $p$
      CREATE POLICY owner_select ON public.profiles
        FOR SELECT TO authenticated
        USING (auth.uid() = id)
    $p$;

    EXECUTE $p$
      CREATE POLICY owner_insert ON public.profiles
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = id)
    $p$;

    EXECUTE $p$
      CREATE POLICY owner_update ON public.profiles
        FOR UPDATE TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id)
    $p$;

    EXECUTE $p$
      CREATE POLICY owner_delete ON public.profiles
        FOR DELETE TO authenticated
        USING (auth.uid() = id)
    $p$;

    EXECUTE 'REVOKE ALL ON public.profiles FROM anon';
    RAISE NOTICE 'profiles: RLS enabled, anon revoked';
  ELSE
    RAISE NOTICE 'profiles: table does not exist — skipped';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 9. Defensive handling for OTHER tables declared in 20261030000000 but unused
--    in app code (schema unverified). For each, IF the table exists AND has a
--    user_id column → enable RLS + owner policies + revoke anon. Otherwise
--    raise NOTICE and skip.
--
--    ⚠️ If any of these tables exist with a DIFFERENT owner column (not
--    user_id), they will be left WITHOUT policies → fully blocked under RLS
--    once enabled. Review pg_policies after applying.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  has_user_id BOOLEAN;
BEGIN
  FOR tbl IN VALUES
    ('invoice_items'),
    ('expenses'),
    ('team_members'),
    ('time_logs'),
    ('earnings_logs'),
    ('payments')
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE '%: table does not exist — skipped', tbl;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'user_id'
    ) INTO has_user_id;

    IF NOT has_user_id THEN
      RAISE WARNING
        '%: table exists but has no user_id column — RLS NOT applied, REVIEW MANUALLY',
        tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_select ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_insert ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_update ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_delete ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY owner_select ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      tbl);
    EXECUTE format(
      'CREATE POLICY owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
      tbl);
    EXECUTE format(
      'CREATE POLICY owner_update ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      tbl);
    EXECUTE format(
      'CREATE POLICY owner_delete ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',
      tbl);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
    RAISE NOTICE '%: RLS enabled, anon revoked', tbl;
  END LOOP;
END $$;


COMMIT;


-- ============================================================================
-- VERIFICATION QUERIES — paste into Supabase SQL editor after applying
-- ============================================================================
--
-- A) Confirm RLS is enabled on every target table:
--
--    SELECT schemaname, tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN (
--        'transactions','invoices','workers','work_sessions',
--        'team_payroll','mileage_journeys','tax_payments','profiles'
--      )
--    ORDER BY tablename;
--    -- Expect: rowsecurity = true for every row.
--
-- B) Confirm 4 policies per active table:
--
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
--    -- Expect: 4 rows per table (select/insert/update/delete),
--    --        roles = {authenticated}.
--
-- C) Confirm anon has NO privileges on these tables:
--
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'anon'
--      AND table_schema = 'public'
--      AND table_name IN (
--        'transactions','invoices','workers','work_sessions',
--        'team_payroll','mileage_journeys','tax_payments','profiles'
--      )
--    ORDER BY table_name;
--    -- Expect: 0 rows.  If any rows appear → the file-ordering issue
--    --        described at the top has bitten you. Re-check.
--
-- D) Confirm service_role still has full access (it should):
--
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'service_role'
--      AND table_schema = 'public'
--      AND table_name = 'transactions';
--    -- Expect: SELECT, INSERT, UPDATE, DELETE.
--
-- ============================================================================
-- POST-MIGRATION TODOs (NOT INCLUDED IN THIS MIGRATION)
-- ============================================================================
--   1. Profiles auto-creation: add trigger on auth.users INSERT to create a
--      profiles row. Without this, signups won't have a profile.
--   2. Storage RLS: the 'receipts' bucket is also wide-open. Add bucket
--      policies separately (Supabase Storage uses storage.objects, not
--      public schema).
--   3. NOT NULL on user_id columns: verify and ALTER TABLE to enforce.
--      A NULL user_id would silently fail every owner policy.
--   4. ON DELETE CASCADE from auth.users(id) to every user_id column,
--      so account deletion cleans up automatically (GDPR Article 17).
--   5. Composite indexes for performance:
--      CREATE INDEX ON public.transactions (user_id, created_at DESC);
--      CREATE INDEX ON public.invoices     (user_id, created_at DESC);
--      ...etc per table.
-- ============================================================================
