-- ============================================================================
-- Migration: add_document_pages
-- Promotes "page" from an implicit, R2-only concept to a first-class row.
--
-- WHY: a document can have many pages, each independently OCR'd and
-- independently validated. The old schema put `status` and `extracted_data`
-- on `documents`, which can only represent ONE state for the whole document.
-- That made it impossible to remember "page 0 is done, page 1 isn't" or to
-- resume validation after a crash mid-process. This migration fixes that by
-- giving every page its own row, its own status, and its own persisted
-- raw OCR + validated data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- document_pages
-- One row per page of a document. Existence of a row does NOT necessarily
-- mean the R2 object exists yet (it's created at upload-url time, before the
-- PUT completes) — but going forward this table, not listObjects(), is the
-- source of truth for "what pages does this document have and what state
-- are they in."
-- ----------------------------------------------------------------------------
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),

  document_id uuid not null references public.documents (id) on delete cascade,
  page_index int not null,

  -- Per-PAGE lifecycle (previously this lived on `documents` and could only
  -- describe the whole document at once).
  --   pending    -> uploaded, not yet OCR'd (or OCR result discarded/reset)
  --   processing -> OCR currently running on this page
  --   done       -> extracted_data has been validated and saved for this page
  --   error      -> OCR failed for this page
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),

  -- Raw OCR output for just this page, persisted immediately after OCR runs
  -- (not just held in memory / the HTTP response). This is what lets a user
  -- leave mid-validation and come back without re-running OCR: the frontend
  -- can reload this and re-flatten instead of re-calling /process.
  raw_ocr_result jsonb,

  -- Validated / user-edited data for this page, shaped as ExtractedData
  -- (columns, rows, itemColumnKey — no pageIndex needed inline anymore,
  -- since the row itself is the page).
  extracted_data jsonb,

  -- Populated when status = 'error', surfaced to the frontend instead of a
  -- generic failure message.
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A document can't have two rows claiming the same page index.
  unique (document_id, page_index)
);

create index if not exists document_pages_document_id_idx
  on public.document_pages (document_id);

-- Keep updated_at current on every write, so the frontend can show
-- "last processed/validated at" without a separate audit table.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists document_pages_set_updated_at on public.document_pages;
create trigger document_pages_set_updated_at
  before update on public.document_pages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: ownership is indirect, same pattern as `documents` -> `projects`,
-- just one hop further: document_pages -> documents -> projects.
-- ----------------------------------------------------------------------------
alter table public.document_pages enable row level security;

create policy "document_pages_owner_all"
  on public.document_pages
  for all
  using (
    exists (
      select 1
      from public.documents
      join public.projects on projects.id = documents.project_id
      where documents.id = document_pages.document_id
        and projects.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.documents
      join public.projects on projects.id = documents.project_id
      where documents.id = document_pages.document_id
        and projects.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Backfill: turn any existing documents.extracted_data (an ExtractedPage[]
-- with pageIndex baked into each element) into individual document_pages
-- rows. Safe to run even if extracted_data is null (the CASE/loop no-ops).
-- Run this BEFORE the drop-columns step below, and only once.
-- ----------------------------------------------------------------------------
do $$
declare
  doc record;
  page jsonb;
begin
  for doc in
    select id, status, extracted_data
    from public.documents
    where extracted_data is not null
  loop
    for page in select * from jsonb_array_elements(doc.extracted_data)
    loop
      insert into public.document_pages (document_id, page_index, status, extracted_data)
      values (
        doc.id,
        coalesce((page->>'pageIndex')::int, 0),
        'done',
        page - 'pageIndex'  -- strip pageIndex, it's now implied by the row
      )
      on conflict (document_id, page_index) do nothing;
    end loop;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- documents becomes a pure container: id, project_id, storage_path, filename.
-- Status and extracted_data now live per-page on document_pages.
-- Only run this after confirming the backfill above looks right in your data.
-- ----------------------------------------------------------------------------
alter table public.documents drop column if exists status;
alter table public.documents drop column if exists extracted_data;