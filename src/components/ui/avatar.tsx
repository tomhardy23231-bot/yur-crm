import * as React from "react";

import { cn, initials } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

// Палитра аватаров (эталон «ЮрКейс»): у каждого сотрудника — свой устойчивый
// цвет, чтобы команда читалась цветовыми якорями, а не «стеной индиго».
const AVATAR_COLORS = [
  "#B88A3E", // brass
  "#2F6FE0", // blue
  "#0E8D80", // teal
  "#9A3FB0", // violet
  "#D96A2C", // orange
  "#C0497A", // rose
  "#3A8F6D", // green
  "#7A52C9", // purple
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
export function Avatar({ name, src, size = "md", className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        "rounded-full text-white font-semibold select-none",
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
