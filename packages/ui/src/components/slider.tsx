"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
}

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  minLabel,
  maxLabel,
  className,
  id,
  ...rest
}: SliderProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number(e.currentTarget.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--color-muted)] accent-[color:var(--color-primary)]"
        {...rest}
      />
      <div className="flex justify-between text-xs text-[color:var(--color-muted-foreground)]">
        <span>{minLabel ?? min}</span>
        <span aria-live="polite" className="font-medium text-[color:var(--color-foreground)]">
          {value}
        </span>
        <span>{maxLabel ?? max}</span>
      </div>
    </div>
  );
}
