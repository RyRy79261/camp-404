"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { EmojiFrame } from "./emoji-field";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    /**
     * The ☺ button and the `:name` row (owner, 2026-10-27: every text box).
     * On unless false or the box is read-only.
     */
    emoji?: boolean;
  };

const BOX =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, emoji, ...props }, ref) => {
    if (!(emoji ?? !props.readOnly)) {
      return <textarea className={cn(BOX, className)} ref={ref} {...props} />;
    }
    return (
      <EmojiFrame<HTMLTextAreaElement>
        as="textarea"
        className={className}
        boxClassName={BOX}
        forwardedRef={ref}
        boxProps={props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
