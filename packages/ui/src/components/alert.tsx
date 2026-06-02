import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

// Inline callout for status messages — info, success, warning, error. Tone comes
// from the P0 semantic tokens. Presentational leaf; pass an icon + content as
// children. role="alert" only for the error tone so AT announces failures.
const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-accent/30 bg-accent/10 text-foreground [&>svg]:text-accent",
        success:
          "border-success/30 bg-success/10 text-foreground [&>svg]:text-success",
        warning:
          "border-warning/30 bg-warning/10 text-foreground [&>svg]:text-warning",
        error:
          "border-destructive/40 bg-destructive/10 text-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "info" },
  },
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Alert, alertVariants }
