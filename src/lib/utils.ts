import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
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

// Русское склонение «день/дня/дней» для целого числа.
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}
