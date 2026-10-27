"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { offersEmojiByDefault } from "../lib/emoji";
import { EmojiFrame } from "./emoji-field";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * The ☺ button and the `:name` row (owner, 2026-10-27: every text box).
   * On by default for a plain text box; off for other types, codes, numbers
   * and anything the browser fills (offersEmojiByDefault). Pass false for a
   * text box that holds a code, an ID or a handle.
   */
  emoji?: boolean;
};

const BOX =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, emoji, ...props }, ref) => {
    const offer = emoji ?? offersEmojiByDefault({ type, ...props });
    if (!offer) {
      return (
        <input
          type={type}
          className={cn(BOX, className)}
          ref={ref}
          {...props}
        />
      );
    }
    return (
      <EmojiFrame<HTMLInputElement>
        as="input"
        className={className}
        boxClassName={BOX}
        forwardedRef={ref}
        boxProps={{ type, ...props }}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
