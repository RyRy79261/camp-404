import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../lib/utils"

// Horizontal step indicator — onboarding progress, the two-step captain-promotion
// tracker (sent → accepted). Each step is done / active / upcoming.
// Presentational leaf; the caller derives statuses (e.g. from promotionStepState).
export interface StepperStep {
  label: string
  status: "done" | "active" | "upcoming"
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: StepperStep[]
}

function Stepper({ steps, className, ...props }: StepperProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)} {...props}>
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium",
              step.status === "done" &&
                "border-transparent bg-primary text-primary-foreground",
              step.status === "active" && "border-primary text-primary",
              step.status === "upcoming" && "border-border text-muted-foreground",
            )}
          >
            {step.status === "done" ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Completed</span>
              </>
            ) : (
              i + 1
            )}
          </span>
          <span
            className={cn(
              "text-sm",
              step.status === "upcoming"
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <span aria-hidden className="h-px w-6 bg-border" />
          )}
        </li>
      ))}
    </ol>
  )
}

export { Stepper }
