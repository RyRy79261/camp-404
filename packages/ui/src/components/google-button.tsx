import * as React from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"

// OAuth provider sign-in button — a full-width outline button with the provider
// glyph + label. Defaults to Google (a mono "G" accent mark, per the S02 board).
// Presentational: the consumer wires onClick/disabled; the auth logic stays in
// the app.
export interface OAuthButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Provider glyph; defaults to a mono "G". */
  mark?: React.ReactNode
  label?: string
}

function OAuthButton({
  mark,
  label = "Continue with Google",
  className,
  ...props
}: OAuthButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full gap-2.5", className)}
      {...props}
    >
      <span
        aria-hidden
        className="font-mono text-subtitle-dense font-bold text-accent"
      >
        {mark ?? "G"}
      </span>
      <span className="text-subtitle-dense font-semibold">{label}</span>
    </Button>
  )
}

export { OAuthButton }
