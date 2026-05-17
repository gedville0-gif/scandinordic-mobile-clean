-- Grant table-level permissions to Supabase roles for all core tables.
-- Safe to re-run: GRANT is idempotent.

DO $$
DECLARE
  tbl TEXT;
  role_ TEXT;
BEGIN
  FOR tbl IN VALUES
    ('profiles'),
    ('invoices'),
    ('invoice_items'),
    ('expenses'),
    ('team_members'),
    ('time_logs'),
    ('earnings_logs'),
    ('payments'),
    ('transactions'),
    ('workers'),
    ('work_sessions')
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      FOR role_ IN VALUES ('anon'), ('authenticated'), ('service_role')
      LOOP
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
          tbl, role_
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Also grant usage on all sequences (needed for serial/identity columns)
DO $$
DECLARE
  seq TEXT;
  role_ TEXT;
BEGIN
  FOR seq IN
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    FOR role_ IN VALUES ('anon'), ('authenticated'), ('service_role')
    LOOP
      EXECUTE format(
        'GRANT USAGE, SELECT ON SEQUENCE public.%I TO %I',
        seq, role_
      );
    END LOOP;
  END LOOP;
END;
$$;
