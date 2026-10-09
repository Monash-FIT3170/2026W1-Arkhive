alter table document_pages
  add column if not exists review_state jsonb;