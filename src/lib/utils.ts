import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Инициалы аватара (бриф §6 «фикс инициалов»). Берём первые буквы значимых
// слов, отбрасывая скобочные/служебные части: «Владелец (owner)» → «В»,
// «Юрист (продажник)» → «Ю», «Тест Клиент №2» → «ТК». Раньше в инициалы
// попадала открывающая скобка («В(»).
export function initials(name: string): string {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ") // убрать «(...)»
    .replace(/\[[^\]]*\]/g, " ") // убрать «[...]»
    .trim();
  // Значимые слова — те, что начинаются с буквы (отсекаем «№2», цифры, тире).
  const parts = cleaned.split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  if (parts.length === 0) {
    const fallback = name.trim();
    return fallback ? fallback.slice(0, 1).toUpperCase() : "?";
  }
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Денежный формат проекта (₴). Группировка по-русски, до 2 знаков дробной части.
// Суффикс « ₴» добавляется на месте вызова — как в существующих экранах.
const MONEY_FMT = new Intl.NumberFormat("ru-RU", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return MONEY_FMT.format(value);
}

// Формат процента (ставки зарплаты). Целые без дробной части, дробные — до 2
// знаков, разделитель по локали (ru-RU → запятая). Единый источник для бейджа
// категории и таблиц начислений, чтобы «7,5%» не расходилось с «7.5%».
const PCT_FMT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function formatPercent(value: number): string {
  return PCT_FMT.format(value);
}

// U6: сколько полных дней прошло с момента (для «N дней на этапе»).
const DAY_MS = 86_400_000;
export function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}
