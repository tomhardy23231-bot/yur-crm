"use client";

import * as React from "react";
import { Mail, Phone, Send, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

export type Source = "gmail" | "telegram" | "whatsapp" | "viber" | "phone";

// Бренд-названия каналов (Gmail/Telegram/WhatsApp/Viber) не переводятся —
// только «Телефон» берётся из словаря.
const SOURCE_META: Record<Source, { label: string; bgClass: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  gmail:    { label: "Gmail",    bgClass: "bg-brand-gmail",    Icon: Mail },
  telegram: { label: "Telegram", bgClass: "bg-brand-telegram", Icon: Send },
  whatsapp: { label: "WhatsApp", bgClass: "bg-brand-whatsapp", Icon: MessageCircle },
  viber:    { label: "Viber",    bgClass: "bg-brand-viber",    Icon: MessageCircle },
  phone:    { label: "Телефон",  bgClass: "bg-text-muted",     Icon: Phone },
};

interface SourceIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  source: Source;
  size?: "sm" | "md";
}

const SIZES = {
  sm: { wrap: "w-5 h-5", icon: 11 },
  md: { wrap: "w-6 h-6", icon: 13 },
};

/**
 * Иконка канала коммуникации (Gmail/Telegram/WhatsApp/Viber/Телефон)
 * в брендовых цветах. Используется в карточке контакта и таблицах дел.
 */
export function SourceIcon({ source, size = "md", className, ...props }: SourceIconProps) {
  const { t } = useI18n();
  const { label: rawLabel, bgClass, Icon } = SOURCE_META[source];
  // Бренд-названия остаются как есть; локализуем только подпись «Телефон».
  const label = source === "phone" ? t.clients.form.phone : rawLabel;
  const sz = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white shrink-0",
        sz.wrap,
        bgClass,
        className,
      )}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={sz.icon} strokeWidth={2} />
    </span>
  );
}
