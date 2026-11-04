CREATE OR REPLACE FUNCTION public.enforce_dashboard_quote_word_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  quotes jsonb;
  quote_item jsonb;
  quote_text text;
  word_count integer;
BEGIN
  IF NEW.key <> 'admin_overview_photo_quotes' THEN
    RETURN NEW;
  END IF;

  BEGIN
    quotes := NEW.value::jsonb;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Dashboard photo quotes must be valid JSON.';
  END;

  IF jsonb_typeof(quotes) IS DISTINCT FROM 'array' OR jsonb_array_length(quotes) > 5 THEN
    RAISE EXCEPTION 'Dashboard photo quotes must be an array of up to five quotes.';
  END IF;

  FOR quote_item IN SELECT value FROM jsonb_array_elements(quotes)
  LOOP
    IF jsonb_typeof(quote_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(quote_item -> 'text') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each dashboard photo quote must have text.';
    END IF;

    quote_text := quote_item ->> 'text';
    SELECT count(*)::integer INTO word_count
    FROM regexp_split_to_table(quote_text, '[[:space:]]+') AS words(word)
    WHERE word <> '';

    IF word_count > 15 THEN
      RAISE EXCEPTION 'Dashboard photo quotes cannot exceed 15 words.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dashboard_quote_word_limit ON public.settings;
CREATE TRIGGER enforce_dashboard_quote_word_limit
  BEFORE INSERT OR UPDATE OF key, value ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_dashboard_quote_word_limit();
