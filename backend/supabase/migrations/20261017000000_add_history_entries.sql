-- Add history_entries column to document_pages to persist edit history per page
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS history_entries jsonb DEFAULT '[]'::jsonb;
