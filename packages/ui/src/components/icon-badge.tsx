import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

// A circular/rounded container that frames an icon — section headers, list-row
// avatars-for-things, empty-state glyphs, the home control-panel group chips and
// tool-tile icon boxes. Pass a lucide icon as children.
const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center border [&>svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4",
        default: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
        md: "h-[46px] w-[46px] [&>svg]:h-5 [&>svg]:w-5",
        lg: "h-14 w-14 [&>svg]:h-6 [&>svg]:w-6",
      },
      // The board draws both circular badges (status glyphs) and rounded-square
      // chips. Rounded defaults to the group-head chip radius (`r:8`); the
      // larger `md` tool-tile icon box steps up to `r:12` via the compound below.
      shape: {
        circle: "rounded-full",
        rounded: "rounded-lg",
      },
      tone: {
        muted: "bg-muted/40 text-muted-foreground",
        primary: "border-transparent bg-primary/15 text-primary",
        accent: "border-transparent bg-accent/15 text-accent",
        secondary:
          "border-transparent bg-secondary/25 text-secondary-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
      },
    },
    // The 46px tool-tile icon box rounds to `r:12` (board 03), a step above the
    // 30px group-head chip's `r:8`.
    compoundVariants: [
      { shape: "rounded", size: "md", className: "rounded-xl" },
    ],
    defaultVariants: { size: "default", shape: "circle", tone: "muted" },
  },
)

export type IconBadgeTone = NonNullable<
  VariantProps<typeof iconBadgeVariants>["tone"]
>

export interface IconBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconBadgeVariants> {}

function IconBadge({ className, size, shape, tone, ...props }: IconBadgeProps) {
  return (
    <span
      className={cn(iconBadgeVariants({ size, shape, tone }), className)}
      {...props}
    />
  )
}

export { IconBadge, iconBadgeVariants }
