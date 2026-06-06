import Link from "next/link";

import { cn } from "@/lib/utils";

// Строка статус-фильтров над таблицами (бриф §6): чипы «точка цвета этапа +
// название + счётчик», активный — синий. Кликабельны, ведут на отфильтрованный
// список. Серверно-рендерится: активность определяется из URL вызывающим экраном.

export type StatusChip = {
  key: string;
  label: string;
  count?: number;
  /** Класс цвета точки (напр. 'bg-stage-new'); без него — чип без точки («Все»). */
  dotClass?: string;
  href: string;
  active?: boolean;
};

export function StatusFilterStrip({
  chips,
  className,
}: {
  chips: ReadonlyArray<StatusChip>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-current={c.active ? "true" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            c.active
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border bg-surface text-text-muted hover:border-border-strong hover:bg-surface-muted",
          )}
        >
          {c.dotClass && (
            <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", c.dotClass)} />
          )}
          {c.label}
          {c.count != null && (
            <span
              className={cn(
                "text-[11px] tabular-nums",
                c.active ? "text-primary" : "text-text-subtle",
              )}
            >
              {c.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
