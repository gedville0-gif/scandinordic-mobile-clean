-- ============================================================================
-- 20261101000001_money_to_cents.sql
-- Convert money model from floats / numeric(10,2) to integer cents.
-- ============================================================================
--
-- WHY THIS EXISTS
--   The audit (CTO_AUDIT_2026-05-17.md, finding #2) flagged IEEE 754 float
--   money as a P0 issue: 0.1 + 0.2 === 0.30000000000000004 means accounting
--   integrity failures over time. The app now uses integer cents end-to-end
--   (see lib/money.ts → Cents branded type).
--
--   This migration:
--     1. TRUNCATEs all user-owned tables (acceptable per audit decision
--        A2 = scenario #1 — no real user data exists yet).
--     2. Converts invoices.total_amount (numeric(10,2)) → total_amount_cents
--        (bigint), matching the new client model.
--
-- ⚠️  DESTRUCTIVE — DO NOT APPLY TO PRODUCTION WITH REAL DATA
--   This file TRUNCATEs seven tables. It is correct ONLY for the
--   "scenario #1 — disposable test data" situation confirmed in the audit.
--   If real user data has been collected since 2026-05-18, STOP and rewrite
--   this migration with a backfill (UPDATE … SET amountCents = ROUND(amount * 100))
--   before applying.
--
-- ORDERING
--   This file is named 20261101000001_*, one second after the RLS migration
--   (20261101000000_enable_rls_revoke_anon.sql). It applies AFTER RLS is in
--   place, which is fine — TRUNCATE bypasses RLS (DDL), and ALTER COLUMN
--   operates on the column metadata, not row data.
--
-- COMPANION CODE CHANGES (in the same commit)
--   - lib/money.ts ............. new Cents type + helpers
--   - lib/types.ts ............. all money fields renamed (amount → amountCents, etc.)
--   - lib/storage.ts ........... saveInvoice writes `total_amount_cents`; demo data
--                                literals converted via toCents()
--   App/UI files NOT yet updated — Phase 4 work.
--
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Wipe all user-owned tables (scenario #1: no real data to preserve)
--    CASCADE handles any FK relationships (e.g. invoice_items → invoices)
--    if they exist.
-- ────────────────────────────────────────────────────────────────────────────
TRUNCATE TABLE
  public.transactions,
  public.invoices,
  public.workers,
  public.work_sessions,
  public.team_payroll,
  public.mileage_journeys,
  public.tax_payments
CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Migrate invoices.total_amount → invoices.total_amount_cents
--    Current schema (confirmed via information_schema.columns):
--      data_type = numeric, precision = 10, scale = 2
--    Target schema:
--      bigint (integer cents)
--    The USING (total_amount * 100)::bigint clause is academic here because
--    the TRUNCATE above already cleared all rows, but it's correct for any
--    future re-run on a populated database.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ALTER COLUMN total_amount TYPE bigint
  USING (total_amount * 100)::bigint;

ALTER TABLE public.invoices
  RENAME COLUMN total_amount TO total_amount_cents;

COMMIT;

-- ============================================================================
-- VERIFICATION (paste into Supabase SQL editor after applying)
-- ============================================================================
--
-- A) Confirm the column was renamed and retyped:
--
--    SELECT column_name, data_type, numeric_precision, numeric_scale
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'invoices'
--      AND column_name LIKE '%total%';
--    -- Expect: total_amount_cents | bigint | 64 | 0
--    -- NO row for total_amount (old column gone).
--
-- B) Confirm all user-owned tables are empty:
--
--    SELECT 'transactions'      AS table_name, COUNT(*) AS n FROM public.transactions
--    UNION ALL SELECT 'invoices',              COUNT(*)      FROM public.invoices
--    UNION ALL SELECT 'workers',               COUNT(*)      FROM public.workers
--    UNION ALL SELECT 'work_sessions',         COUNT(*)      FROM public.work_sessions
--    UNION ALL SELECT 'team_payroll',          COUNT(*)      FROM public.team_payroll
--    UNION ALL SELECT 'mileage_journeys',      COUNT(*)      FROM public.mileage_journeys
--    UNION ALL SELECT 'tax_payments',          COUNT(*)      FROM public.tax_payments;
--    -- Expect: all rows = 0.
--
-- C) Confirm RLS still enabled (should be unaffected by this migration):
--
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('transactions','invoices','workers','work_sessions',
--                        'team_payroll','mileage_journeys','tax_payments');
--    -- Expect: rowsecurity = true for all rows.
--
-- ============================================================================
-- ROLLBACK (if needed — paste into SQL editor manually; not auto-applied)
-- ============================================================================
--   ALTER TABLE public.invoices RENAME COLUMN total_amount_cents TO total_amount;
--   ALTER TABLE public.invoices ALTER COLUMN total_amount TYPE numeric(10,2)
--     USING (total_amount::numeric / 100);
--   -- Truncated data cannot be restored without backup.
-- ============================================================================
