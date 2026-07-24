import 'server-only';

import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { getT } from '@/lib/i18n/server';

// Справочник типов дел (public.case_types) — источник вариантов для формы дела,
// фильтров и карточки. Встроенные 7 типов (коды civil..other) локализуются через
// i18n enums.caseType по code; кастомные (добавленные из интерфейса) показываются
// своим name. RLS case_types_select_active отдаёт справочник любому активному
// сотруднику. Резолв лейблов и выборки — request-cached (React cache).

export type CaseTypeRow = {
  id: string;
  code: string;
  name: string;
  is_builtin: boolean;
  is_active: boolean;
  sort_order: number;
};

// Опция селекта типа дела (форма/фильтр): стабильный code + локализованный лейбл.
export type CaseTypeOption = { code: string; label: string };

// Полная строка справочника с готовым лейблом — для страницы настроек.
export type CaseTypeManaged = CaseTypeRow & { label: string };

// Сырой справочник (активные + скрытые), упорядочен sort_order → name.
// Request-cached: список читают несколько компонентов одного рендера.
const fetchAllCaseTypes = cache(async (): Promise<CaseTypeRow[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  return userDb(user.profile.id, (tx) =>
    tx.case_types.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        is_builtin: true,
        is_active: true,
        sort_order: true,
      },
    }),
  );
});

// Лейбл типа дела по коду: встроенные — из словаря enums.caseType (двуязычно),
// кастомные — свой name справочника; неизвестный код (напр. удалённый тип в старой
// записи) — как есть. Возвращает синхронную функцию-резолвер (карта уже загружена).
export const caseTypeLabeler = cache(
  async (): Promise<(code: string) => string> => {
    const { t } = await getT();
    const dict = t.enums.caseType as Record<string, string | undefined>;
    const rows = await fetchAllCaseTypes();
    const names = new Map<string, string>();
    for (const r of rows) names.set(r.code, r.name);
    return (code: string) => dict[code] ?? names.get(code) ?? code;
  },
);

// Активные типы для селектов формы/фильтров (code + лейбл), в порядке sort_order.
export async function listActiveCaseTypes(): Promise<CaseTypeOption[]> {
  const { t } = await getT();
  const dict = t.enums.caseType as Record<string, string | undefined>;
  const rows = await fetchAllCaseTypes();
  return rows
    .filter((r) => r.is_active)
    .map((r) => ({ code: r.code, label: dict[r.code] ?? r.name }));
}

// Полный справочник (активные + скрытые) с лейблами — страница настроек.
export async function listCaseTypesForSettings(): Promise<CaseTypeManaged[]> {
  const { t } = await getT();
  const dict = t.enums.caseType as Record<string, string | undefined>;
  const rows = await fetchAllCaseTypes();
  return rows.map((r) => ({ ...r, label: dict[r.code] ?? r.name }));
}

// Множество ВСЕХ кодов (активные + скрытые) — валидация выбранного типа в
// create/update дела: скрытый тип на уже заведённом деле остаётся допустимым.
export async function caseTypeCodeSet(): Promise<ReadonlySet<string>> {
  const rows = await fetchAllCaseTypes();
  return new Set(rows.map((r) => r.code));
}

// Опции типа дела для формы: активные + гарантированно текущий тип дела
// (даже если он скрыт) — чтобы правка не «теряла» выбранное значение.
export async function listCaseTypesForForm(
  currentCode?: string | null,
): Promise<CaseTypeOption[]> {
  const active = await listActiveCaseTypes();
  if (!currentCode || active.some((o) => o.code === currentCode)) return active;
  const label = (await caseTypeLabeler())(currentCode);
  return [...active, { code: currentCode, label }];
}

// Пары [code, лейбл] всех типов — для резолва значения case_type в diff'ах
// журнала/истории дела (иначе кастомный тип показался бы своим кодом-slug'ом).
export async function caseTypeLabelEntries(): Promise<Array<[string, string]>> {
  const rows = await listCaseTypesForSettings();
  return rows.map((r) => [r.code, r.label]);
}
