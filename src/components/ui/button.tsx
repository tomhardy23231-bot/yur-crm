import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-sans font-semibold leading-none",
    // Каркас 2026-07-13: кнопки — пилюли (rounded-xl 18px при h-36 = полукруг).
    "rounded-full border border-transparent",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[200ms] ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:opacity-50 disabled:pointer-events-none",
    "whitespace-nowrap select-none",
  ],
  {
    variants: {
      variant: {
        primary: [
          // Сплошная синяя CTA с «цветной» тенью (каркас shadow-mint): парит и
          // приподнимается на hover.
          "bg-primary-hover text-primary-fg shadow-brand",
          "hover:-translate-y-px hover:shadow-brand-hover",
          "active:translate-y-0 active:shadow-brand active:brightness-95",
        ],
        secondary: [
          // Белая с тёплым бордером; hover синеет (каркас mint-softer).
          "bg-surface text-text border-border",
          "hover:border-primary-border hover:bg-primary-softer",
        ],
        ghost:
          "bg-transparent text-text-muted hover:bg-primary-softer hover:text-primary-pressed",
        destructive: [
          "bg-error text-primary-fg",
          "hover:opacity-90 hover:-translate-y-px hover:shadow-destructive-hover",
        ],
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
