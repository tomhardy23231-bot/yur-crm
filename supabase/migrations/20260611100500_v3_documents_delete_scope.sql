-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.6.
--
-- Аудит: обладатель права delete_documents мог удалить документ (и физический файл)
-- ЛЮБОГО дела, в т.ч. невидимого ему (политики проверяли только cap, без скоупа дела).
-- Чтение/запись документов скоупится через can_see_case (наследуют от дела), а
-- удаление — нет: рассинхрон с моделью видимости.
--
-- Решение: к праву delete_documents добавляем видимость дела документа.
--   • public.documents — по documents.case_id → can_see_case(case_id);
--   • storage.objects — case_id из пути объекта ТЕМ ЖЕ приёмом, что SELECT-политика
--     case_documents_select_via_case (20260527100000): namespace 'cases' + парсер
--     private.case_id_from_storage_path(name) → can_see_case. Свой парсинг не изобретаем.
-- Миграция аддитивная (пересоздание двух DELETE-политик; новых объектов нет).

-- public.documents: удаление — право + видимость дела.
drop policy if exists documents_delete_managers on public.documents;
create policy documents_delete_managers
  on public.documents
  for delete
  to authenticated
  using (
    private.can('delete_documents')
    and private.can_see_case(case_id)
  );

-- storage.objects: удаление файла — право + видимость дела (case_id из пути).
drop policy if exists case_documents_delete_staff on storage.objects;
create policy case_documents_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'case-documents'
    and split_part(name, '/', 1) = 'cases'
    and private.can('delete_documents')
    and private.can_see_case(private.case_id_from_storage_path(name))
  );
