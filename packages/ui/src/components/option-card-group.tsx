"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../lib/utils"

// A vertical stack of large tappable radio cards — the redesign's single-choice
// picker (replaces a plain Select for `single_select`), with optional per-option
// description. Radiogroup semantics with roving focus + arrow-key navigation.
export interface OptionCard {
  value: string
  label: React.ReactNode
  description?: React.ReactNode
}

export interface OptionCardGroupProps {
  options: OptionCard[]
  value?: string
  onValueChange: (value: string) => void
  id?: string
  "aria-label"?: string
  className?: string
}

function OptionCardGroup({
  options,
  value,
  onValueChange,
  id,
  className,
  "aria-label": ariaLabel,
}: OptionCardGroupProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((o) => o.value === value)

  function focusSelect(index: number) {
    const target = (index + options.length) % options.length
    const next = options[target]
    if (!next) return
    onValueChange(next.value)
    refs.current[target]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      focusSelect(index + 1)
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      focusSelect(index - 1)
    } else if (e.key === "Home") {
      e.preventDefault()
      focusSelect(0)
    } else if (e.key === "End") {
      e.preventDefault()
      focusSelect(options.length - 1)
    }
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-2", className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value
        const tabbable = selected || (selectedIndex === -1 && i === 0)
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => focusSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/10"
                : "hover:bg-accent/30",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                selected
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export { OptionCardGroup }
