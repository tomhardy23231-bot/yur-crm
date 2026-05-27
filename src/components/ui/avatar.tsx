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

/**
 * Аватар: фото если есть, иначе инициалы на indigo-gradient.
 * Используется в hero-шапках карточек, таблицах, kanban, навигации.
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
          : { background: "var(--grad-indigo)" }
      }
      aria-label={name}
      {...props}
    >
      {!src && initials(name)}
    </span>
  );
}
