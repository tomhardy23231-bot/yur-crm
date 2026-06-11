import * as React from "react";

import { cn, initials } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** circle — навигация/команда; square — скруглённый квадрат для таблиц (бриф §6). */
  shape?: "circle" | "square";
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

// Единый набор цветов аватара по хэшу имени — токены --avatar-1..6 в
// globals.css (v3 s10: палитра вынесена из компонента; светлые amber/teal
// затемнены — белые инициалы на каждом ≥ 3.0:1).
const AVATAR_COLORS = [
  "var(--avatar-1)", // blue
  "var(--avatar-2)", // violet
  "var(--avatar-3)", // rose
  "var(--avatar-4)", // amber
  "var(--avatar-5)", // teal
  "var(--avatar-6)", // slate
] as const;

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0];
}

/**
 * Аватар: фото если есть, иначе инициалы на сплошном цвете, устойчиво
 * выведенном из имени. Используется в таблицах, командах, навигации.
 */
export function Avatar({
  name,
  src,
  size = "md",
  shape = "circle",
  className,
  ...props
}: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        "text-white font-semibold select-none",
        shape === "square" ? "rounded-[8px]" : "rounded-full",
        SIZES[size],
        className,
      )}
      style={
        src
          ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: colorForName(name) }
      }
      aria-label={name}
      {...props}
    >
      {!src && initials(name)}
    </span>
  );
}
