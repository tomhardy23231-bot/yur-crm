import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-sans font-semibold leading-none",
    "rounded-md border border-transparent",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[180ms] ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:opacity-50 disabled:pointer-events-none",
    "whitespace-nowrap select-none",
  ],
  {
    variants: {
      variant: {
        primary: [
          // Золотая (латунь) CTA с градиентом — фирменный акцент «ЮрКейс».
          "bg-primary text-primary-fg [background-image:var(--grad-brass)] shadow-sm",
          "hover:-translate-y-px hover:shadow-primary-hover",
          "active:translate-y-0 active:shadow-none active:brightness-95",
        ],
        secondary:
          "bg-surface text-text border-border-strong hover:bg-surface-muted hover:border-text-muted",
        ghost:
          "bg-transparent text-text-muted hover:bg-surface-muted hover:text-text",
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
