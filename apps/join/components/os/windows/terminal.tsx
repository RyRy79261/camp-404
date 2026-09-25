"use client";

import { useEffect, useRef, useState } from "react";
import { PROMPT, WELCOME, runCommand, type TermLine } from "@/lib/terminal";
import { useJoinData } from "../join-data";
import type { AppId } from "@/lib/window-manager";

type Entry = TermLine | { kind: "in"; text: string };

const COLOURS: Record<Entry["kind"], string> = {
  in: "text-os-fg",
  // A solid colour, not an alpha one, so the text keeps crisp edges.
  out: "text-[color-mix(in_oklch,var(--color-os-fg)_82%,var(--color-os-bg))]",
  hi: "text-os-primary",
  err: "text-os-accent",
};

export function TerminalWindow({
  openApp,
  close,
}: {
  openApp: (id: AppId) => void;
  close: () => void;
}) {
  const data = useJoinData();
  const [lines, setLines] = useState<Entry[]>([...WELCOME]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const cursor = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function submit() {
    const text = value;
    setValue("");
    if (text.trim()) history.current.push(text);
    cursor.current = history.current.length;
    const result = runCommand(text, data);
    if (result.exit) return close();
    setLines((prev) =>
      result.clear
        ? []
        : [...prev, { kind: "in", text: `${PROMPT} ${text}` }, ...result.lines],
    );
    if (result.open) {
      const id = result.open;
      // Let the output render first, then raise the requested window.
      window.setTimeout(() => openApp(id), 250);
    }
  }

  function recall(step: number) {
    const h = history.current;
    if (!h.length) return;
    cursor.current = Math.min(Math.max(cursor.current + step, 0), h.length);
    setValue(h[cursor.current] ?? "");
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
        <label htmlFor="terminal-input" className="shrink-0 text-os-primary">
          {PROMPT}
        </label>
        <input
          ref={input}
          id="terminal-input"
          data-autofocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              recall(-1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              recall(1);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-os-fg caret-os-primary outline-none focus-visible:outline-none"
        />
      </form>
      <div ref={end} />
    </div>
  );
}
