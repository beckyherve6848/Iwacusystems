DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'utility_invoices'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.utility_invoices;
  END IF;
END;
$$;
