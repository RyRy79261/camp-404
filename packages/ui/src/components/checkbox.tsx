"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "../lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-current")}
    >
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

// AckRow — a checkbox and its text as one row you can tap anywhere, at least
// 44px tall (the touch-target minimum). Ported from the AfrikaBurn
// contributors app. A disabled box dims the whole row.
export interface AckRowProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** The row's text; wraps freely. */
  children: React.ReactNode
  /** Class for the row (the checkbox keeps `className`). */
  rowClassName?: string
}

const AckRow = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  AckRowProps
>(({ children, className, rowClassName, ...props }, ref) => (
  <label
    className={cn(
      "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-3 text-sm hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
      rowClassName
    )}
  >
    <Checkbox ref={ref} className={cn("mt-0.5", className)} {...props} />
    <span className="min-w-0 flex-1 text-sm leading-snug">{children}</span>
  </label>
))
AckRow.displayName = "AckRow"

export { Checkbox, AckRow }
