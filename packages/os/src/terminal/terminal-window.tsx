"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  EMPTY_HISTORY,
  PROMPT,
  recall,
  remember,
  runCommand,
  type CommandTable,
  type TermLine,
} from "./engine";

type Entry = TermLine | { kind: "in"; text: string };

const COLOURS: Record<Entry["kind"], string> = {
  in: "text-os-fg",
  // A solid colour, not an alpha one, so the text keeps crisp edges.
  out: "text-[color-mix(in_oklch,var(--os-fg)_82%,var(--os-bg))]",
  hi: "text-os-primary",
  err: "text-os-accent",
};

type Props<K extends string, C> = {
  /** The app's commands, and the data their answers read. */
  commands: CommandTable<K, C>;
  context: C;
  /** Shown when the terminal opens and after nothing else. */
  welcome: readonly TermLine[];
  openApp: (id: K) => void;
  close: () => void;
  /** A command's `effect` (the app's own), handed on with its output. */
  onEffect?: (effect: string) => void;
  prompt?: string;
};

export function TerminalWindow<K extends string, C>({
  commands,
  context,
  welcome,
  openApp,
  close,
  onEffect,
  prompt = PROMPT,
}: Props<K, C>) {
  const inputId = useId();
  const [lines, setLines] = useState<Entry[]>(() => [...welcome]);
  const [value, setValue] = useState("");
  const history = useRef(EMPTY_HISTORY);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function submit() {
    const text = value;
    setValue("");
    history.current = remember(history.current, text);
    const result = runCommand(text, commands, context);
    if (result.exit) return close();
    setLines((prev) =>
      result.clear
        ? []
        : [...prev, { kind: "in", text: `${prompt} ${text}` }, ...result.lines],
    );
    if (result.effect && onEffect) onEffect(result.effect);
    if (result.open) {
      const id = result.open;
      // Let the output render first, then raise the requested window.
      window.setTimeout(() => openApp(id), 250);
    }
  }

  function step(by: number) {
    const next = recall(history.current, by);
    if (!next) return;
    history.current = next.history;
    setValue(next.value);
  }

  return (
    <div
      className="min-h-full bg-os-bg p-4 font-mono text-[13px] leading-relaxed"
      onClick={() => input.current?.focus()}
    >
      <div role="log" aria-live="polite" aria-label="Terminal output">
        {lines.map((l, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap break-words ${COLOURS[l.kind]}`}
          >
            {l.text}
          </p>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="shrink-0 text-os-primary">
          {prompt}
        </label>
        <input
          ref={input}
          id={inputId}
          data-autofocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              step(-1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              step(1);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-os-fg caret-os-primary outline-none focus-visible:outline-none"
        />
      </form>
      <div ref={end} />
    </div>
  );
}
