"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import { LineIcon } from "@/components/os/line-icons";
import type { VoiceRow } from "@/lib/voice/resolve";
import type { RowResult } from "@/lib/voice/run";
import { VOICE_OFFLINE, type VoiceCommand } from "./use-voice-command";
import { Waveform } from "./waveform";
import { VOICE_NOTICE } from "@/lib/voice/notice";

// The Voice panel (#356; mock-up camp404-night/design/voice.html): the
// recording, then one ticked list of what the server read back, then one
// result per action. The desktop draws it as a small window beside the mic
// under the Today gadget; a phone as a sheet over the bottom bar. Captains
// only: nobody else is given this component.

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Johannesburg",
});

function Kbd({
  children,
  onGo,
}: {
  children: React.ReactNode;
  onGo?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "whitespace-nowrap border px-1.5 py-px font-sans text-[11px] font-semibold",
        onGo
          ? "border-current px-1 text-[10px] text-current opacity-70"
          : "border-border text-muted-foreground",
      )}
    >
      {children}
    </kbd>
  );
}

function Label({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <p
      className={cn(
        "font-pixel text-[10px] uppercase tracking-[0.15em]",
        muted ? "text-muted-foreground" : "text-primary",
      )}
    >
      {children}
    </p>
  );
}

function Btn({
  go,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { go?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-2 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40",
        go
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-foreground hover:bg-choice-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const s = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  return (
    <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function Said({
  words,
  onAgain,
}: {
  words: string | null;
  onAgain: () => void;
}) {
  if (!words) return null;
  return (
    <p className="text-[13px] leading-relaxed text-muted-foreground">
      You said <q className="italic text-foreground">{words}</q> ·{" "}
      <button
        type="button"
        onClick={onAgain}
        className="text-[var(--os-accent)] underline underline-offset-2"
      >
        Say it again
      </button>
    </p>
  );
}

function ActionRow({
  row,
  index,
  ticked,
  onToggle,
}: {
  row: VoiceRow;
  index: number;
  ticked: boolean;
  onToggle: () => void;
}) {
  const blocked = row.blocked !== null;
  return (
    <label
      data-voice-row={index + 1}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border border-choice-edge bg-card px-3 py-2.5",
        (!ticked || blocked) && "bg-transparent opacity-60",
        blocked && "cursor-not-allowed",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={ticked && !blocked}
        disabled={blocked}
        onChange={onToggle}
        aria-label={`${index + 1}. ${row.sentence}`}
      />
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-5 shrink-0 place-items-center border-2 border-primary text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          ticked && !blocked ? "bg-primary" : "bg-transparent",
        )}
      >
        {ticked && !blocked && (
          <LineIcon name="check" className="size-3.5 [stroke-width:3]" />
        )}
      </span>
      <span
        aria-hidden
        className="mt-0.5 w-3 shrink-0 text-[11px] font-bold text-muted-foreground"
      >
        {index + 1}
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold leading-snug text-foreground">
          {row.sentence}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {row.facts}
          {row.dependsOn !== null && (
            <span className="text-[oklch(0.82_0.13_75)]">
              {row.facts ? " · " : ""}Runs only if {row.dependsOn + 1} works
            </span>
          )}
          {blocked && (
            <span className="block text-[oklch(0.82_0.13_75)]">
              Can't be done: {row.blocked}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}

function ResultRow({ result }: { result: RowResult }) {
  const ok = result.status === "done";
  const no = result.status === "not_done";
  const tag = {
    done: "Done",
    not_done: "Not done",
    skipped: "Skipped",
    unticked: "Not ticked",
  }[result.status];
  return (
    <div
      data-voice-result={result.status}
      className={cn(
        "flex items-start gap-2.5 border border-border px-3 py-2.5",
        no &&
          "border-l-[3px] border-[oklch(0.78_0.15_75)] bg-[color-mix(in_oklab,oklch(0.78_0.15_75)_7%,var(--os-win-card))]",
        !ok && !no && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-[22px] shrink-0 place-items-center border",
          ok
            ? "border-[oklch(0.75_0.17_150)] bg-[color-mix(in_oklab,oklch(0.75_0.17_150)_25%,transparent)] text-[oklch(0.85_0.17_150)]"
            : "border-[oklch(0.78_0.15_75)] text-[oklch(0.85_0.15_75)]",
        )}
      >
        <LineIcon name={ok ? "check" : "x"} className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "mb-0.5 font-pixel text-[9px] uppercase tracking-[0.12em]",
            ok ? "text-[oklch(0.85_0.17_150)]" : "text-[oklch(0.85_0.15_75)]",
          )}
        >
          {result.index + 1} · {tag}
        </p>
        <p className="text-sm font-semibold leading-snug">
          {ok
            ? result.sentence
            : no
              ? `${result.sentence}: not done.`
              : result.sentence}
        </p>
        {result.detail && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {result.detail}
            {!ok && result.path && (
              <>
                {" "}
                <a
                  href={result.path}
                  className="text-[var(--os-accent)] underline underline-offset-2"
                >
                  Open the page
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** What the panel shows, phase by phase. Shared by the desktop and the phone. */
export function VoiceBody({
  voice,
  onClose,
  phone = false,
}: {
  voice: VoiceCommand;
  onClose: () => void;
  phone?: boolean;
}) {
  const { phase, outcome, shown, ticked, results } = voice;
  const again = () => {
    voice.reset();
    void voice.start();
  };

  const answers =
    outcome && outcome.kind !== "refused"
      ? outcome.answers
      : (outcome?.answers ?? []);
  const answerBox =
    answers.length > 0 ? (
      <div
        data-voice-answers
        className="border border-dashed border-border px-3 py-2.5"
      >
        <Label muted>Answer{answers.length > 1 ? "s" : ""}</Label>
        <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-foreground">
          {answers.map((a, i) => (
            <li key={i}>
              {a.text}
              {a.path && (
                <>
                  {" "}
                  <a
                    href={a.path}
                    className="text-[var(--os-accent)] underline underline-offset-2"
                  >
                    Open
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const footer = (left: React.ReactNode, right: React.ReactNode) =>
    phone ? null : (
      <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">{left}</span>
        <span className="ml-auto">{right}</span>
      </div>
    );

  const error = voice.error ? (
    <p
      role="alert"
      className="border border-[oklch(0.78_0.15_75)] px-3 py-2 text-[13px] text-foreground"
    >
      {voice.error}
    </p>
  ) : null;

  if (!voice.online) {
    return (
      <div className="flex flex-col gap-2.5 p-3.5">
        <p
          data-voice-offline
          className="text-[13px] leading-relaxed text-muted-foreground"
        >
          {VOICE_OFFLINE}
        </p>
      </div>
    );
  }

  if (phase === "consent") {
    return (
      <div className="flex flex-col gap-3 p-3.5">
        <p className="text-sm font-semibold">Before your first command</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {VOICE_NOTICE}
        </p>
        {error}
        <div
          className={cn(
            "flex gap-2.5",
            phone ? "flex-col-reverse" : "justify-end",
          )}
        >
          <Btn onClick={onClose} data-voice-not-now>
            Not now
          </Btn>
          <Btn go onClick={() => void voice.consent(true)}>
            Turn on voice
          </Btn>
        </div>
      </div>
    );
  }

  if (phase === "idle" || phase === "recording") {
    const recording = phase === "recording";
    return (
      <>
        <div className="flex flex-col gap-2.5 p-3.5">
          {error}
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {recording ? "Listening" : "Ready"}
              {recording && (
                <span
                  aria-hidden
                  className="ml-2 inline-block size-1.5 animate-pulse bg-primary align-middle"
                />
              )}
            </span>
            <Waveform
              analyser={voice.analyser}
              active={recording}
              className="h-[34px] min-w-0 flex-1"
            />
            {recording && <Elapsed since={voice.startedAt} />}
            <button
              type="button"
              onClick={() => (recording ? voice.stop() : void voice.start())}
              aria-label={recording ? "Stop and send" : "Start speaking"}
              className="grid size-[38px] shrink-0 place-items-center bg-primary text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <LineIcon
                name={recording ? "stop" : "mic"}
                className="size-[18px]"
              />
            </button>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Say up to five things to do, the way you would ask a camp mate.
            Questions are fine too: “what’s on tomorrow?”
          </p>
        </div>
        {footer(
          <>
            <Kbd>Space</Kbd> {recording ? "stop and send" : "start"}{" "}
            <Kbd>Esc</Kbd> {recording ? "throw away" : "close"}
          </>,
          null,
        )}
      </>
    );
  }

  if (phase === "thinking") {
    return (
      <div
        className="flex items-center gap-2.5 p-3.5 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden /> Working out what
        you mean…
      </div>
    );
  }

  if (phase === "results" && results) {
    const done = results.filter((r) => r.status === "done").length;
    const notDone = results.filter(
      (r) => r.status === "not_done" || r.status === "skipped",
    ).length;
    return (
      <>
        <div className="flex flex-col gap-2.5 p-3.5">
          <Said words={voice.words} onAgain={again} />
          <p className="text-sm font-semibold" role="status">
            {done} done{notDone > 0 ? `, ${notDone} not done` : ""}{" "}
            <span className="font-medium text-muted-foreground">
              · each ran on its own
            </span>
          </p>
          {results.map((r) => (
            <ResultRow key={r.index} result={r} />
          ))}
        </div>
        <div
          className={cn(
            "flex gap-2.5 border-t border-border px-3.5 py-2.5",
            phone ? "flex-col-reverse" : "justify-between",
          )}
        >
          <Btn onClick={onClose} data-voice-close>
            Close
          </Btn>
          <Btn onClick={again}>
            <LineIcon name="mic" className="size-4" /> Say something else
          </Btn>
        </div>
        {footer(
          <>
            <Kbd>Esc</Kbd> close
          </>,
          "Each action is in the audit log",
        )}
      </>
    );
  }

  // The outcome (and the run in flight).
  if (!outcome) return null;
  const running = phase === "running";

  if (outcome.kind === "refused" || outcome.kind === "answers") {
    return (
      <>
        <div className="flex flex-col gap-2.5 p-3.5">
          <Said words={voice.words} onAgain={again} />
          {answerBox}
          {outcome.kind === "refused" && (
            <p
              data-voice-refused
              className="text-sm leading-relaxed text-foreground"
            >
              {outcome.message}
              {outcome.path && (
                <>
                  {" "}
                  <a
                    href={outcome.path}
                    className="text-[var(--os-accent)] underline underline-offset-2"
                  >
                    Open the page
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex gap-2.5 border-t border-border px-3.5 py-2.5",
            phone ? "flex-col-reverse" : "justify-between",
          )}
        >
          <Btn onClick={onClose}>Close</Btn>
          <Btn onClick={again}>
            <LineIcon name="mic" className="size-4" /> Say something else
          </Btn>
        </div>
        {footer(
          <>
            <Kbd>Esc</Kbd> close
          </>,
          "Nothing saved",
        )}
      </>
    );
  }

  if (outcome.kind === "ask" && !shown) {
    return (
      <>
        <div className="flex flex-col gap-2.5 p-3.5">
          <Said words={voice.words} onAgain={again} />
          {answerBox}
          <Label muted>One question first</Label>
          <p className="text-[15px] font-semibold">{outcome.question}</p>
          {outcome.options.map((o, i) => (
            <button
              key={i}
              type="button"
              data-voice-choice={i + 1}
              onClick={() => voice.pick(i)}
              className="flex w-full items-center gap-3 border border-choice-edge bg-choice px-3 py-2.5 text-left text-foreground hover:bg-choice-hover"
            >
              <span
                aria-hidden
                className="grid size-[22px] shrink-0 place-items-center border border-muted-foreground text-[11px] font-semibold text-muted-foreground"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <b className="block text-[14.5px] font-semibold">
                  {o.choice.sentence}
                </b>
                <span className="text-xs text-muted-foreground">
                  {o.choice.facts}
                </span>
              </span>
            </button>
          ))}
          {outcome.waiting.length > 0 && (
            <div className="border-t border-border pt-2 text-[12.5px] text-muted-foreground">
              Waiting, shown with this one before anything runs:
              <ul className="mt-1">
                {outcome.waiting.map((w, i) => (
                  <li key={i}>· {w.sentence}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Btn onClick={onClose} className={phone ? "w-full" : undefined}>
              Neither, cancel all
            </Btn>
          </div>
        </div>
        {footer(
          <>
            <Kbd>1</Kbd>
            <Kbd>2</Kbd> pick <Kbd>Esc</Kbd> cancel
          </>,
          "Nothing saved",
        )}
      </>
    );
  }

  if (!shown) return null;
  const count = [...ticked].filter(
    (i) => shown.rows[i] && !shown.rows[i]!.blocked,
  ).length;
  const doLabel = `Do ${count} action${count === 1 ? "" : "s"}`;
  return (
    <>
      <div className="flex flex-col gap-2.5 p-3.5">
        <Said words={voice.words} onAgain={again} />
        {answerBox}
        <Label>
          Here is what I'll do · {count} of {shown.rows.length}
        </Label>
        {outcome.kind === "list" && outcome.note && (
          <p className="text-[13px] text-muted-foreground">{outcome.note}</p>
        )}
        {shown.rows.map((row, i) => (
          <ActionRow
            key={i}
            row={row}
            index={i}
            ticked={ticked.has(i)}
            onToggle={() => voice.toggle(i)}
          />
        ))}
        {error}
      </div>
      <div
        className={cn(
          "flex gap-2.5 border-t border-border px-3.5 py-2.5",
          phone ? "flex-col-reverse" : "justify-end",
        )}
      >
        <Btn onClick={onClose} disabled={running}>
          Cancel {!phone && <Kbd>Esc</Kbd>}
        </Btn>
        <Btn
          go
          onClick={() => void voice.run()}
          disabled={count === 0 || running}
          data-voice-do
        >
          {running && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {doLabel} {!phone && <Kbd onGo>Enter</Kbd>}
        </Btn>
      </div>
      {footer(
        <>
          <Kbd>1</Kbd>–<Kbd>{shown.rows.length}</Kbd> tick <Kbd>Enter</Kbd> do
        </>,
        `Nothing saved yet · expires ${TIME.format(new Date(shown.expiresAt))}`,
      )}
    </>
  );
}

/** The panel's keys: Space, Esc, Enter and the numbers (desktop). */
export function useVoiceKeys(voice: VoiceCommand, onClose: () => void) {
  return React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox";
      if (typing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (voice.phase === "recording") voice.discard();
        else onClose();
        return;
      }
      if (
        e.key === " " &&
        (voice.phase === "recording" || voice.phase === "idle")
      ) {
        if (t.tagName === "BUTTON") return;
        e.preventDefault();
        if (voice.phase === "recording") voice.stop();
        else void voice.start();
        return;
      }
      if (e.key === "Enter" && voice.phase === "outcome" && voice.shown) {
        if (t.tagName === "BUTTON" || t.tagName === "A") return;
        e.preventDefault();
        void voice.run();
        return;
      }
      const n = Number(e.key);
      if (
        Number.isInteger(n) &&
        n >= 1 &&
        n <= 5 &&
        voice.phase === "outcome"
      ) {
        e.preventDefault();
        if (voice.outcome?.kind === "ask" && !voice.shown) voice.pick(n - 1);
        else if (voice.shown && n <= voice.shown.rows.length)
          voice.toggle(n - 1);
      }
    },
    [voice, onClose],
  );
}

/** The window chrome: the OS's magenta title bar, "VOICE captains", ✕. */
export function VoiceFrame({
  onClose,
  children,
  className,
  style,
  onKeyDown,
  panelRef,
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  panelRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-label="Voice"
      tabIndex={-1}
      data-voice-panel
      onKeyDown={onKeyDown}
      style={style}
      className={cn(
        "os-window-colours flex select-text flex-col border border-[var(--os-primary)] bg-popover text-foreground outline-none shadow-[0_0_26px_color-mix(in_oklab,var(--os-primary)_40%,transparent),0_16px_40px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className="flex shrink-0 select-none items-center justify-between bg-[var(--os-primary)] px-3 py-1.5 font-pixel text-[11px] uppercase tracking-[0.2em] text-white">
        <span>
          Voice{" "}
          <small className="ml-2 font-sans text-[11px] normal-case tracking-normal opacity-85">
            captains
          </small>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Voice"
          className="grid size-7 place-items-center tracking-normal hover:bg-black/20"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}

/**
 * The desktop's mic: a 44 px square at the right edge, flush with the Today
 * tab, just under the gadget (TodayGadget's `below`), with the Voice panel
 * beside it to its left.
 */
export function DesktopVoice({ voice }: { voice: VoiceCommand }) {
  const [open, setOpen] = React.useState(false);
  const mic = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLElement>(null);
  const [top, setTop] = React.useState<number | null>(null);
  const close = React.useCallback(() => {
    voice.reset();
    setOpen(false);
    mic.current?.focus();
  }, [voice]);
  const keys = useVoiceKeys(voice, close);
  const recording = voice.phase === "recording";
  const offline = !voice.online;

  // The panel opens at the mic's height and grows up to the desktop's top
  // when the list is long.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const m = mic.current?.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      if (!m || !p) return;
      const room = window.innerHeight - 48;
      setTop(Math.max(8, Math.min(m.top, room - p.height)));
    };
    place();
    const ro = new ResizeObserver(place);
    if (panel.current) ro.observe(panel.current);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className="pointer-events-auto relative mt-3 flex justify-end">
      <button
        ref={mic}
        type="button"
        data-voice-mic
        aria-label={
          offline
            ? "Voice is off: no internet"
            : recording
              ? "Stop and send"
              : "Voice"
        }
        aria-expanded={open}
        title={offline ? VOICE_OFFLINE : "Voice"}
        onClick={() => {
          if (recording) {
            voice.stop();
            return;
          }
          if (!open) {
            setOpen(true);
            if (voice.phase === "idle" && voice.online) void voice.start();
          } else close();
        }}
        className={cn(
          "grid size-11 place-items-center border border-r-0 border-[var(--os-primary)] shadow-[4px_4px_0_0_rgb(0_0_0/0.45)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-primary)]",
          recording
            ? "animate-pulse bg-[var(--os-win-primary)] text-[#17191b]"
            : open
              ? "bg-[var(--os-primary)] text-[var(--os-bg)]"
              : "bg-[var(--os-chrome)] text-[var(--os-primary)] hover:bg-[color-mix(in_oklab,var(--os-primary)_25%,var(--os-chrome))]",
          offline && "opacity-50",
        )}
      >
        <LineIcon name={recording ? "stop" : "mic"} className="size-5" />
      </button>
      {open && (
        <VoiceFrame
          panelRef={panel}
          onClose={close}
          onKeyDown={keys}
          style={{ top: top ?? undefined, maxHeight: "calc(100vh - 56px)" }}
          className="fixed right-[56px] w-[440px] max-w-[calc(100vw-5rem)]"
        >
          <VoiceBody voice={voice} onClose={close} />
        </VoiceFrame>
      )}
    </div>
  );
}

/** The phone's Voice sheet: it rises above the bottom bar, Do under the thumb. */
export function PhoneVoiceSheet({
  voice,
  onClose,
}: {
  voice: VoiceCommand;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <VoiceFrame
      panelRef={ref}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      className="os-window-in fixed inset-x-0 bottom-[var(--os-phone-bar,0px)] z-[86] max-h-[calc(100dvh-var(--os-phone-bar,0px)-4rem)] border-x-0 border-b-0 border-t-2 md:hidden [&>div:last-child]:pb-[34px]"
    >
      <VoiceBody voice={voice} onClose={onClose} phone />
    </VoiceFrame>
  );
}
