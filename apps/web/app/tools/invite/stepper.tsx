"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";

// The −/+ number stepper the board draws for the multi-use cap (board S14 §4):
// a real `<input type="number">` (so the value submits and stays keyboard- /
// AT-accessible) flanked by decrement/increment buttons, clamped to [min, max].
interface StepperProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  "aria-label"?: string;
  className?: string;
}

export function Stepper({
  id,
  name,
  value,
  onChange,
  min = 1,
  max = 100,
  className,
  "aria-label": ariaLabel,
}: StepperProps) {
  const current = Number(value);
  const safe = Number.isFinite(current) ? current : min;
  // Never emit "NaN": a non-numeric/empty value falls back to min.
  const clamp = (n: number) =>
    String(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));

  const stepButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4";

  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between rounded-lg border border-border bg-muted pl-4 pr-2",
        className,
      )}
    >
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Decrease"
          className={stepButton}
          disabled={safe <= min}
          onClick={() => onChange(clamp(safe - 1))}
        >
          <Minus aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Increase"
          className={stepButton}
          disabled={safe >= max}
          onClick={() => onChange(clamp(safe + 1))}
        >
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}
