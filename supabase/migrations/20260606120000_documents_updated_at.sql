-- documents.updated_at — время последнего изменения файла (правка через
-- OnlyOffice). Нужен для версионного ключа редактора (key меняется при каждом
-- сохранении → DS перечитывает свежую версию). На вставке = now() (= uploaded_at).
-- Обновляется явно в oo-callback при сохранении.

alter table public.documents
  add column if not exists updated_at timestamptz not null default now();

comment on column public.documents.updated_at is
  'Время последнего изменения файла (правка через OnlyOffice). Питает версионный ключ редактора.';
