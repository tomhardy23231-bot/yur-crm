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
