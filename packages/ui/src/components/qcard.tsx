import * as React from "react"

import { Card, CardContent } from "./card"
import { Label } from "./label"

// A single questionnaire field framed in a card — the prompt (+ a required
// marker), an optional helper, the control (passed as children), and an optional
// error. `htmlFor` ties the prompt label to the control; the single control
// child is cloned to inherit aria-describedby (helper/error) + aria-invalid so
// screen readers are wired without the caller repeating the ids.
export interface QCardProps {
  label: React.ReactNode
  htmlFor?: string
  required?: boolean
  helper?: string
  error?: string
  children: React.ReactNode
  className?: string
}

// Props we merge onto the control child for a11y wiring.
type DescribableProps = {
  "aria-describedby"?: string
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
}

function QCard({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
  className,
}: QCardProps) {
  const generatedId = React.useId()
  // Resolve the control id (the child's own id wins, then htmlFor, then a
  // generated one) so the Label always associates — even if the caller doesn't
  // pass an id on their control.
  const childId = React.isValidElement<{ id?: string }>(children)
    ? children.props.id
    : undefined
  const controlId = childId ?? htmlFor ?? generatedId
  const helperId = `${controlId}-helper`
  const errorId = `${controlId}-error`
  // Point at whichever message is actually rendered (error wins over helper).
  const describedBy = error ? errorId : helper ? helperId : undefined

  // Clone the single control child to inherit the id + a11y wiring.
  const control = React.isValidElement<DescribableProps & { id?: string }>(
    children,
  )
    ? React.cloneElement(children, {
        id: controlId,
        "aria-describedby":
          [children.props["aria-describedby"], describedBy]
            .filter(Boolean)
            .join(" ") || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })
    : children

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-2 p-4">
        <Label htmlFor={controlId} className="text-base">
          {label}
          {required && <span className="ml-1 text-primary">*</span>}
        </Label>
        {helper && !error && (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helper}
          </p>
        )}
        {control}
        {error && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export { QCard }
