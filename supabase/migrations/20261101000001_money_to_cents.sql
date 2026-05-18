-- ============================================================================
-- 20261101000001_money_to_cents.sql
-- Ensure invoices.total_amount_cents exists (bigint integer cents).
-- ============================================================================
--
-- WHY THIS EXISTS
--   Audit finding #2 (CTO_AUDIT_2026-05-17.md): IEEE 754 floats for money
--   produce cumulative rounding errors. Client code (lib/money.ts,
--   lib/types.ts, lib/storage.ts:94) now writes `total_amount_cents` as
--   integer cents. This migration guarantees the column exists with the
--   correct type, regardless of which path created the table.
--
-- IDEMPOTENT & NON-DESTRUCTIVE
--   The original version of this file TRUNCATEd seven user-owned tables
--   and unconditionally ALTERed total_amount → total_amount_cents. That
--   failed on the live database (the legacy total_amount column does not
--   exist; the table was created out-of-band with the cents schema already
--   in place) AND it was destructive — unacceptable now that real data has
--   accumulated since 2026-05-18.
--
--   This rewrite:
--     - Preserves all existing rows.
--     - Handles three remote states:
--         (a) only legacy `total_amount` numeric column exists → convert
--         (b) only `total_amount_cents` bigint exists → no-op
--         (c) neither exists → add `total_amount_cents` bigint
--     - Is safe to re-run (no-op on a settled schema).
--
-- ============================================================================

BEGIN;

DO $$
DECLARE
  has_legacy BOOLEAN;
  has_cents  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'total_amount'
  ) INTO has_legacy;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'total_amount_cents'
  ) INTO has_cents;

  IF has_legacy AND NOT has_cents THEN
    -- Path (a): convert legacy numeric column in place, then rename.
    EXECUTE 'ALTER TABLE public.invoices
             ALTER COLUMN total_amount TYPE bigint
             USING ROUND(total_amount * 100)::bigint';
    EXECUTE 'ALTER TABLE public.invoices
             RENAME COLUMN total_amount TO total_amount_cents';
    RAISE NOTICE 'invoices: total_amount (numeric) -> total_amount_cents (bigint), values × 100';
  ELSIF has_legacy AND has_cents THEN
    -- Mixed state: both columns present. Backfill cents from legacy where null,
    -- then drop the legacy column.
    EXECUTE 'UPDATE public.invoices
             SET total_amount_cents = ROUND(total_amount * 100)::bigint
             WHERE total_amount_cents IS NULL AND total_amount IS NOT NULL';
    EXECUTE 'ALTER TABLE public.invoices DROP COLUMN total_amount';
    RAISE NOTICE 'invoices: backfilled total_amount_cents from total_amount, dropped legacy column';
  ELSIF NOT has_cents THEN
    -- Path (c): neither column. Add the cents column.
    EXECUTE 'ALTER TABLE public.invoices ADD COLUMN total_amount_cents bigint';
    RAISE NOTICE 'invoices: added total_amount_cents (bigint)';
  ELSE
    -- Path (b): already migrated.
    RAISE NOTICE 'invoices.total_amount_cents already present — no-op';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION (paste into Supabase SQL editor after applying)
-- ============================================================================
--   SELECT column_name, data_type, numeric_precision, numeric_scale
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'invoices'
--     AND column_name LIKE '%total%';
--   -- Expect: total_amount_cents | bigint | 64 | 0
--   -- NO row for total_amount.
-- ============================================================================
