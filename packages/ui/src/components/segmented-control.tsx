"use client"

import * as React from "react"

import { cn } from "../lib/utils"

// A row of equal-width segments — a controlled single-choice toggle (the
// questionnaire's `toggle` kind). Proper radiogroup semantics with roving focus
// + arrow-key navigation (the inline version it replaces was click-only).
export interface SegmentedOption {
  value: string
  label: React.ReactNode
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value?: string
  onValueChange: (value: string) => void
  id?: string
  "aria-label"?: string
  className?: string
}

function SegmentedControl({
  options,
  value,
  onValueChange,
  id,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((o) => o.value === value)

  function focusSelect(index: number) {
    // Wrap around; the modulo on a non-negative base handles -1 → last.
    const target = (index + options.length) % options.length
    const next = options[target]
    if (!next) return
    onValueChange(next.value)
    refs.current[target]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      focusSelect(index + 1)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
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
      className={cn("inline-flex w-full rounded-md border p-1", className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value
        // Roving tabindex: the selected segment (or the first, when none is
        // selected) is the single tab stop into the group.
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
              "flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
