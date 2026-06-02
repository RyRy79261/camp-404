import * as React from "react"
import { Loader2 } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

// Indeterminate loading spinner with an accessible status label. Presentational
// leaf — no state.
const spinnerVariants = cva("animate-spin text-muted-foreground", {
  variants: {
    size: { sm: "h-4 w-4", default: "h-5 w-5", lg: "h-8 w-8" },
  },
  defaultVariants: { size: "default" },
})

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string
  /** Screen-reader label announced while loading. */
  label?: string
}

function Spinner({ className, size, label = "Loading…" }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite">
      <Loader2 className={cn(spinnerVariants({ size }), className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { Spinner, spinnerVariants }
