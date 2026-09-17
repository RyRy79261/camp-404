import * as React from "react";
import { cn } from "../lib/utils";
import { Textarea, type TextareaProps } from "./textarea";

// A textarea that shows how many characters are used of its limit, under the
// box. Near the limit (the last tenth) the count turns to the warning colour
// and screen readers hear it change; before that it stays quiet, so a reader
// is not told the count on every key. No board draws a counter: it is the
// Textarea plus the caption style the forms already use.

export interface TextareaWithCountProps extends Omit<
  TextareaProps,
  "value" | "maxLength"
> {
  value: string;
  maxLength: number;
  /** Class for the textarea itself; `className` styles the wrapper. */
  textareaClassName?: string;
}

const TextareaWithCount = React.forwardRef<
  HTMLTextAreaElement,
  TextareaWithCountProps
>(
  (
    {
      value,
      maxLength,
      id,
      className,
      textareaClassName,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const countId = `${id ?? generatedId}-count`;
    const used = value.length;
    const nearLimit = used >= Math.floor(maxLength * 0.9);

    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <Textarea
          ref={ref}
          id={id}
          value={value}
          maxLength={maxLength}
          aria-describedby={[describedBy, countId].filter(Boolean).join(" ")}
          {...props}
          className={textareaClassName}
        />
        <p
          id={countId}
          aria-live={nearLimit ? "polite" : "off"}
          className={cn(
            "self-end font-mono text-xs tabular-nums",
            nearLimit ? "text-warning" : "text-muted-foreground",
          )}
        >
          {used} / {maxLength}
        </p>
      </div>
    );
  },
);
TextareaWithCount.displayName = "TextareaWithCount";

export { TextareaWithCount };
