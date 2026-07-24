import Link from 'next/link';
import { ChevronLeft, Tags } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { listCaseTypesForSettings } from '@/lib/cases/case-types';
import { CaseTypeCreateForm } from '@/components/case-types/case-type-create-form';
import {
  CaseTypeNameControl,
  CaseTypeActiveControl,
} from '@/components/case-types/case-type-row-controls';

// Справочник типов дел — управление по праву manage_case_types (RLS
// case_types_write_manage дублирует). Добавить свой тип, переименовать (кроме
// встроенных) и скрыть/вернуть. Удаления нет — только скрытие.
export default async function CaseTypesSettingsPage() {
  await requireCap('manage_case_types');
  const { t } = await getT();
  const types = await listCaseTypesForSettings();

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.nav.settings}
      </Link>

      {/* Создание типа */}
      <section className="flex flex-col gap-3">
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold text-text">
              {t.caseTypes.heading}
            </h2>
          </div>
          <div className="p-5">
            <p className="mb-4 text-[13px] text-text-muted">{t.caseTypes.intro}</p>
            <CaseTypeCreateForm />
          </div>
        </Card>
      </section>

      {/* Список типов */}
      <section className="flex flex-col gap-2">
        <p className="text-[12.5px] text-text-subtle">{t.caseTypes.list.hint}</p>
        {types.length === 0 ? (
          <p className="text-[13px] text-text-muted">{t.caseTypes.list.empty}</p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {types.map((ct) => (
                <li
                  key={ct.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors ${
                    ct.is_active ? '' : 'opacity-70'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                      <Tags size={16} strokeWidth={1.75} />
                    </span>
                    <CaseTypeNameControl
                      id={ct.id}
                      name={ct.label}
                      isBuiltin={ct.is_builtin}
                    />
                    {ct.is_builtin && (
                      <Badge tone="neutral" quiet>
                        {t.caseTypes.list.builtinBadge}
                      </Badge>
                    )}
                    {ct.is_active ? (
                      <Badge tone="success" quiet>
                        {t.caseTypes.list.statusActive}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" quiet>
                        {t.caseTypes.list.statusInactive}
                      </Badge>
                    )}
                  </div>
                  <CaseTypeActiveControl id={ct.id} isActive={ct.is_active} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
