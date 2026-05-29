import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-border rounded-lg shadow-sm overflow-hidden",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1 p-5 pb-3", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-[20px] leading-[1.3] tracking-[-0.01em] font-semibold text-text",
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[13px] text-text-muted leading-[1.5]", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-3 p-5 pt-4 border-t border-border", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

/* Hero-карточка с градиентной шапкой. По умолчанию — латунь (бренд «ЮрКейс»). */
interface CardHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  gradient?: "brass" | "indigo" | "rose" | "amber";
}

const CardHero = React.forwardRef<HTMLDivElement, CardHeroProps>(
  ({ className, gradient = "brass", style, ...props }, ref) => {
    const grad =
      gradient === "rose"
        ? "var(--grad-rose)"
        : gradient === "amber"
          ? "var(--grad-amber)"
          : gradient === "indigo"
            ? "var(--grad-indigo)"
            : "var(--grad-brass)";
    return (
      <div
        ref={ref}
        style={{ background: grad, ...style }}
        className={cn(
          "p-5 text-white",
          "flex items-center gap-4 relative",
          className,
        )}
        {...props}
      />
    );
  },
);
CardHero.displayName = "CardHero";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardHero,
};
