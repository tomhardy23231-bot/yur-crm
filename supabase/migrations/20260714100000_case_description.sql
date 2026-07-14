-- Case description (owner feedback 2026-07-14): free-form editable text shown
-- in the "Описание дела" block on the case card. Edits go through the regular
-- cases UPDATE RLS (can_write_case) and are journaled by the app as
-- 'case_updated' diffs — no new activity_log action, allowlist untouched.

alter table public.cases
  add column if not exists description text
    constraint cases_description_len
    check (description is null or char_length(description) <= 5000);
