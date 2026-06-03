import * as React from "react"

import { cn } from "../lib/utils"
import { Input, type InputProps } from "./input"
import { Label } from "./label"

// Labelled text field — Label + Input + an optional helper or error, wired with
// aria-describedby + aria-invalid. Generates an id when none is given so the
// label always associates. The input's own props (incl. className) pass through.
export interface InputFieldProps extends InputProps {
  label: React.ReactNode
  helper?: string
  error?: string
  required?: boolean
  /** Class for the field wrapper (the input keeps its own className). */
  wrapperClassName?: string
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, helper, error, id, required, wrapperClassName, ...props }, ref) => {
    const generatedId = React.useId()
    const fieldId = id ?? generatedId
    const helperId = `${fieldId}-helper`
    const errorId = `${fieldId}-error`
    // Only point aria-describedby at the element that's actually rendered.
    const describedBy = error ? errorId : helper ? helperId : undefined

    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        <Label htmlFor={fieldId}>
          {label}
          {required && <span className="ml-1 text-primary">*</span>}
        </Label>
        <Input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {helper && !error && (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helper}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
InputField.displayName = "InputField"

export { InputField }
