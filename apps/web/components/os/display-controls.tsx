"use client";

import { useId } from "react";
import type {
  DesktopPreferences,
  DesktopPreferencesPatch,
} from "@camp404/types/desktop-preferences";
import { OS_THEMES_DEF, type OsThemeDef } from "@/lib/os-themes";

// The theme picker and the switches beside it (issue #290): in the welcome
// wizard's "How it looks" step and on the Display page in My account. A
// change applies to the whole desktop at once, which is the live preview;
// each theme's card also draws a small window in that theme's own colours.
// Native radios and checkboxes, so the keyboard and screen readers get what
// they expect. A chosen card says so in words, never by colour alone.

/** A small window in a theme's own colours: its title bar, a line, a button. */
function ThemeSample({ theme }: { theme: OsThemeDef }) {
  const c = theme.colours;
  return (
    <span
      aria-hidden
      className="flex h-12 w-16 shrink-0 flex-col border"
      style={{ background: c["--os-bg"], borderColor: c["--os-line"] }}
    >
      <span
        className="flex h-2.5 items-center justify-end px-0.5"
        style={{ background: c["--os-primary"] }}
      >
        <span
          className="h-1 w-1"
          style={{ background: c["--os-primary-fg"] }}
        />
      </span>
      <span
        className="m-1 flex flex-1 flex-col gap-0.5 p-0.5"
        style={{ background: c["--os-win-bg"] }}
      >
        <span className="h-0.5 w-8" style={{ background: c["--os-win-fg"] }} />
        <span
          className="h-0.5 w-5"
          style={{ background: c["--os-win-muted-fg"] }}
        />
        <span className="mt-auto flex gap-0.5">
          <span
            className="h-1.5 w-3"
            style={{ background: c["--os-win-primary"] }}
          />
          <span
            className="h-1.5 w-3"
            style={{ background: c["--os-accent"] }}
          />
        </span>
      </span>
    </span>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--color-primary)]"
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-semibold text-foreground"
        >
          {label}
          {/* Said in words, not only by the tick. */}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {checked ? "On" : "Off"}
          </span>
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

/** The "Open with one click" switch, on its own (the wizard's step 2). */
export function OneClickSwitch({
  prefs,
  onChange,
}: {
  prefs: DesktopPreferences;
  onChange: (patch: DesktopPreferencesPatch) => void;
}) {
  return (
    <Switch
      checked={prefs.oneClickOpen}
      onChange={(on) => onChange({ oneClickOpen: on })}
      label="Open with one click"
      hint="Icons open on a single click. To select one instead, hold Ctrl or Shift, or draw a box."
    />
  );
}

export function DisplayControls({
  prefs,
  onChange,
  oneClick = false,
}: {
  prefs: DesktopPreferences;
  onChange: (patch: DesktopPreferencesPatch) => void;
  /** Show "Open with one click" too (the Display page). */
  oneClick?: boolean;
}) {
  const name = useId();
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">
          Theme
        </legend>
        {OS_THEMES_DEF.map((theme) => {
          const chosen = prefs.theme === theme.id;
          const id = `${name}-${theme.id}`;
          return (
            <label
              key={theme.id}
              htmlFor={id}
              data-theme-option={theme.id}
              className={`flex cursor-pointer items-center gap-3 border p-2 ${
                chosen
                  ? "border-primary border-2 bg-muted"
                  : "border-border hover:bg-muted"
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={theme.id}
                checked={chosen}
                onChange={() => onChange({ theme: theme.id })}
                aria-describedby={`${id}-about`}
                className="size-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
              />
              <ThemeSample theme={theme} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {theme.label}
                  {chosen && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      In use
                    </span>
                  )}
                </span>
                <span
                  id={`${id}-about`}
                  className="block text-xs text-muted-foreground"
                >
                  {theme.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Switch
        checked={prefs.biggerText}
        onChange={(on) => onChange({ biggerText: on })}
        label="Bigger text"
        hint="All text one step larger, the small labels too."
      />
      <Switch
        checked={prefs.effectsOff}
        onChange={(on) => onChange({ effectsOff: on })}
        label="Effects off"
        hint="No screen lines, glitches, start-up screen or moving extras. Everything else stays."
      />
      {oneClick && <OneClickSwitch prefs={prefs} onChange={onChange} />}
    </div>
  );
}
