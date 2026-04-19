import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:  "bg-brand text-brand-fg [a&]:hover:bg-brand/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive: "bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:  "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost:    "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link:     "text-brand underline-offset-4 [a&]:hover:underline",
        // DS semantic variants
        brand:   "bg-brand-soft text-brand-soft-fg border-brand/20",
        success: "bg-success-soft text-success border-success/20",
        warning: "bg-warning-soft text-warning border-warning/20",
        danger:  "bg-danger-soft text-danger border-danger/20",
        info:    "bg-info-soft text-info border-info/20",
        neutral: "bg-surface-2 text-muted-foreground border-border",
        admin:   "bg-admin-soft text-admin-soft-fg border-admin/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
