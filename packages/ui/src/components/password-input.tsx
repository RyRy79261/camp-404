"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "../lib/utils";
import {
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  type PasswordStrengthScore,
} from "../lib/form-logic";

// PasswordInput — the password field, ported from the AfrikaBurn contributors
// app's packages/ui/src/components/password-input.tsx: ONE field, show/hide
// toggle, PASTE ALLOWED, length-based strength bar, minimum-length feedback.
// Deliberately NO composition rules.
//
// Camp 404 keeps its own confirm-password field on sign-up, which AfrikaBurn
// does not have — that one passes `hideStrength`, since a second meter on a
// field you are copying into says nothing.
//
// Uncontrolled by default; pass `value`/`onChange` to control it. The strength
// meter reads the live value so it works in both modes.

const BAR_COLOR: Record<PasswordStrengthScore, string> = {
  0: "bg-transparent",
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-primary",
  4: "bg-success",
};

export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  /** Hide the strength meter (e.g. on a sign-IN field where it is noise). */
  hideStrength?: boolean;
  /**
   * The HTML `minLength` constraint, and the length the meter calls "too
   * short". It is FORWARDED to the input, so it means exactly what it means on
   * any other field — pass it and the browser enforces it too.
   *
   * Omitted, the input carries no constraint (sign-in must still accept an
   * account made before the minimum existed) and the meter falls back to
   * PASSWORD_MIN_LENGTH for its wording.
   */
  minLength?: number;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      hideStrength = false,
      minLength,
      id,
      value,
      defaultValue,
      onChange,
      "aria-describedby": describedByProp,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const [visible, setVisible] = React.useState(false);
    const [current, setCurrent] = React.useState(
      typeof value === "string"
        ? value
        : typeof defaultValue === "string"
          ? defaultValue
          : "",
    );

    // Track value for the meter whether controlled or uncontrolled.
    const meterValue = typeof value === "string" ? value : current;
    const meterMin = minLength ?? PASSWORD_MIN_LENGTH;
    const strength = passwordStrength(meterValue, meterMin);
    // The meter needs an id whether or not the caller gave the field one:
    // `useId` covers the callers who label the field some other way, and
    // without it the meter rendered with `id={undefined}` and was announced by
    // nothing.
    const meterId = id ? `${id}-strength` : `password-${reactId}-strength`;
    // Only point at the meter while the meter is on the page. An empty field
    // with the meter enabled renders no `#${id}-strength`, and a describedby
    // naming an element that does not exist is a broken reference for a screen
    // reader (and an aria-valid-attr-value failure) on every load of sign-up.
    const showMeter = !hideStrength && meterValue.length > 0;
    // MERGED, not replaced, in either direction. A caller's own describedby (a
    // field error, a "what this is for" line) has to survive the meter, and the
    // meter has to survive the caller's — this used to be one `{...props}`
    // spread away from silently dropping whichever came second.
    const describedBy =
      [describedByProp, showMeter ? meterId : undefined]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            // Revealed, the field is type="text" and React keeps its value
            // attribute in step: the 404 OS desktop blanks it in a copy.
            data-os-private=""
            value={value}
            defaultValue={defaultValue}
            onChange={(e) => {
              setCurrent(e.target.value);
              onChange?.(e);
            }}
            className={cn("pr-10", className)}
            minLength={minLength}
            {...props}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            // NO tabIndex={-1} HERE. AfrikaBurn's used to carry one, which took
            // the only control for revealing a password out of the tab order on
            // every password field in all three of their apps. Anyone working
            // keyboard-only (or with a switch device) could type a 15-character
            // passphrase and had no way to check it, which is precisely the
            // audience a show/hide toggle exists for. The focus ring above is
            // styled for exactly this reason.
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {showMeter ? (
          <div id={meterId} className="space-y-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  BAR_COLOR[strength.score],
                )}
                style={{ width: `${strength.percent}%` }}
                role="progressbar"
                aria-valuenow={strength.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Password strength"
              />
            </div>
            <p
              className={cn(
                "text-xs",
                strength.meetsMin
                  ? "text-muted-foreground"
                  : "text-destructive",
              )}
            >
              {strength.meetsMin
                ? strength.label
                : `${strength.label} — use at least ${meterMin} characters`}
            </p>
          </div>
        ) : null}
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
