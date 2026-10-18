ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS quality_flags jsonb;
