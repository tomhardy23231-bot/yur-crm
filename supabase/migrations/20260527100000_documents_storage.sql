-- Юр CRM — Шаг 8: приватный бакет для документов дел + RLS на storage.objects.
--
-- Convention пути: cases/<case_id_uuid>/<storage_uuid>--<original_slug>
--   - сегмент 1: 'cases' — namespace, чтобы политика игнорировала чужие пути
--     в том же бакете (на будущее, если добавим иные виды файлов);
--   - сегмент 2: case_id — используется политиками для проверки
--     can_see_case / can_write_case;
--   - сегмент 3 (filename): <uuid>--<slug>, где uuid гарантирует уникальность,
--     а slug сохраняет распознаваемое имя в storage_key (оригинал — в file_name).
--
-- RLS на storage.objects:
--   - SELECT (download/list) → can_see_case(case_id).
--   - INSERT (upload)        → can_write_case(case_id) AND owner = active_uid().
--   - UPDATE (rename/replace) → can_write_case(case_id) (Phase 1 не используется).
--   - DELETE                  → is_staff() — мирроринг documents_delete_staff
--     из public-RLS, физическое удаление файла = админская операция.

-- =====================================================================
-- Bucket
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

-- =====================================================================
-- private.case_id_from_storage_path — парсер convention-пути
-- =====================================================================
-- Возвращает case_id (uuid) из пути 'cases/<uuid>/<filename>'.
-- При несоответствии формату — NULL → политики дадут false → доступ закрыт.

create or replace function private.case_id_from_storage_path(p_path text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_segment text;
  v_uuid uuid;
begin
  v_segment := split_part(p_path, '/', 2);
  if v_segment is null or length(v_segment) = 0 then
    return null;
  end if;
  begin
    v_uuid := v_segment::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v_uuid;
end;
$$;

grant execute on function private.case_id_from_storage_path(text) to authenticated;

-- =====================================================================
-- Политики на storage.objects (только bucket_id = 'case-documents')
-- =====================================================================

create policy case_documents_select_via_case
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'case-documents'
    and split_part(name, '/', 1) = 'cases'
    and private.can_see_case(private.case_id_from_storage_path(name))
  );

create policy case_documents_insert_via_case
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'case-documents'
    and split_part(name, '/', 1) = 'cases'
    and private.can_write_case(private.case_id_from_storage_path(name))
    and owner = (select private.active_uid())
  );

create policy case_documents_update_via_case
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'case-documents'
    and split_part(name, '/', 1) = 'cases'
    and private.can_write_case(private.case_id_from_storage_path(name))
  )
  with check (
    bucket_id = 'case-documents'
    and split_part(name, '/', 1) = 'cases'
    and private.can_write_case(private.case_id_from_storage_path(name))
  );

create policy case_documents_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'case-documents'
    and private.is_staff()
  );
