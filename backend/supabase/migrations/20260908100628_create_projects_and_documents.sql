-- ============================================================================
-- Migration: create_projects_and_documents
-- Creates the core schema for Arkhive's project/document management:
--   - projects: top-level containers owned by a Supabase Auth user
--   - documents: uploaded files (stored in R2) belonging to a project
-- Access control is enforced via Row Level Security (RLS), not application code.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- projects
-- One row per project. Owned by a single Supabase Auth user (auth.users.id).
-- No custom "users" table is needed — auth.users is the identity source of truth.
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  -- Owning user. ON DELETE CASCADE means if a user's auth account is deleted,
  -- all of their projects (and via the documents FK below, their documents too)
  -- are automatically cleaned up rather than left as orphaned rows.
  owner_id uuid not null references auth.users (id) on delete cascade,

  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- documents
-- One row per uploaded document. A document can have multiple page images
-- in R2 (page-0.png, page-1.png, ...) tracked under storage_path, but pages
-- themselves are NOT modeled as separate rows here — they're discovered live
-- from R2 via listObjects() in the backend.
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),

  -- Parent project. ON DELETE CASCADE means deleting a project automatically
  -- deletes its documents' DB rows too (R2 file cleanup is still handled
  -- manually in the backend controller — cascade only covers Postgres rows).
  project_id uuid not null references public.projects (id) on delete cascade,

  -- R2 folder prefix for this document's pages: {owner_id}/{project_id}/{document_id}
  -- Actual page objects live at {storage_path}/page-{n}.png
  storage_path text not null,

  -- Original uploaded filename, for display purposes.
  filename text not null,

  -- Lifecycle status of OCR processing.
  --   pending    -> uploaded, not yet processed (or processed but not yet saved)
  --   processing -> OCR currently running
  --   done       -> extracted_data has been saved (post-flatten / post-edit)
  --   error      -> OCR pipeline failed
  -- The CHECK constraint rejects any other value at the DB level, so a typo
  -- in backend code (e.g. 'proccessing') fails loudly instead of corrupting data.
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),

  -- Flattened + possibly user-edited table data, shaped as ExtractedPage[]
  -- (see frontend/src/models — columns, rows, itemColumnKey, pageIndex per page).
  -- NOT the raw OCR output — that's returned to the frontend transiently by
  -- POST /api/documents/:id/process and only persisted here via the separate
  -- PATCH /api/documents/:id/data endpoint. This lets users reopen a project
  -- without re-running OCR, and lets their edits persist.
  extracted_data jsonb,

  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- Postgres does NOT auto-index foreign key columns. Every backend query filters
-- by owner_id or project_id (see controller/projects.ts, controller/documents.ts),
-- so these are added explicitly for query performance.
-- ----------------------------------------------------------------------------
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists documents_project_id_idx on public.documents (project_id);

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Enforces "users can only see/modify their own data" at the database level,
-- so any request going through the anon key + user JWT (not just the backend's
-- service_role client) is automatically scoped correctly.
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.documents enable row level security;

-- projects: a user may select/insert/update/delete only rows where they are the owner.
--   USING       -> which existing rows this policy applies to (reads, and the
--                  "which rows can I touch" check for updates/deletes)
--   WITH CHECK  -> what the row must look like AFTER an insert/update — this is
--                  what stops a user from re-assigning owner_id to someone else
create policy "projects_owner_all"
  on public.projects
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- documents: ownership is indirect — a document is "owned" by whoever owns
-- its parent project. Checked via an EXISTS subquery joining back to projects.
create policy "documents_owner_all"
  on public.documents
  for all
  using (
    exists (
      select 1 from public.projects
      where projects.id = documents.project_id
        and projects.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = documents.project_id
        and projects.owner_id = auth.uid()
    )
  );