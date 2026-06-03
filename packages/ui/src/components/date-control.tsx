import * as React from "react"

import { Input, type InputProps } from "./input"

// Native date picker styled to match Input. A thin wrapper that locks
// type="date" so date fields/questions read consistently; value/onChange/min/max
// pass straight through.
export type DateControlProps = Omit<InputProps, "type">

const DateControl = React.forwardRef<HTMLInputElement, DateControlProps>(
  (props, ref) => <Input ref={ref} type="date" {...props} />,
)
DateControl.displayName = "DateControl"

export { DateControl }
