import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

// A circular/rounded container that frames an icon — section headers, list-row
// avatars-for-things, empty-state glyphs. Pass a lucide icon as children.
const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full border [&>svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4",
        default: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
        lg: "h-14 w-14 [&>svg]:h-6 [&>svg]:w-6",
      },
      tone: {
        muted: "bg-muted/40 text-muted-foreground",
        primary: "border-transparent bg-primary/15 text-primary",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
      },
    },
    defaultVariants: { size: "default", tone: "muted" },
  },
)

export interface IconBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconBadgeVariants> {}

function IconBadge({ className, size, tone, ...props }: IconBadgeProps) {
  return (
    <span
      className={cn(iconBadgeVariants({ size, tone }), className)}
      {...props}
    />
  )
}

export { IconBadge, iconBadgeVariants }
