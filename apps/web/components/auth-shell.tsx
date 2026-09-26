import type { ReactNode, Ref } from "react";
import { Tent } from "lucide-react";
import { Surface } from "@camp404/os";
import { Card, CardContent } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";

// The screens a person sees before the console. The sign-in pages keep the
// AfrikaBurn organiser console's auth card (a mark and eyebrow over one card).
// The gate screens (awaiting approval, the onboarding intro, first-time setup,
// the invite gate, a lost page or a crash) wear the 404 OS look (decision 5 A,
// the owner's approval of the prototype, 2026-09-26): one window on the CRT
// desktop, its title bar in magenta, as the prototype's blocking form draws
// it. Neither sits inside the console layout, so each draws its own
// full-height frame. No hooks, so server pages and client boundaries both use
// them.

type Tone = "accent" | "destructive";

/** The icon circle every pre-console screen opens with. */
function GateIcon({ icon, tone = "accent" }: { icon: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5",
        tone === "destructive"
          ? "bg-destructive/15 text-destructive"
          : "bg-accent/15 text-accent",
      )}
    >
      {icon}
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
      {children}
    </p>
  );
}

/** The OS gate's square icon tile, in the accent blue or the danger red. */
function OsGateIcon({
  icon,
  tone = "accent",
}: {
  icon: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center border [&>svg]:size-5",
        tone === "destructive"
          ? "border-destructive bg-destructive/15 text-destructive"
          : "border-os-accent bg-os-accent/15 text-os-fg",
      )}
    >
      {icon}
    </span>
  );
}

/**
 * The 404 OS gate: the CRT desktop (grid, scanlines, noise) and one window on
 * it, its magenta title bar naming the place. `data-os-skin` puts the kit's
 * buttons and fields inside in the OS palette.
 */
function OsGateFrame({
  title,
  width = "max-w-lg",
  children,
  after,
}: {
  /** The title bar's words: the eyebrow ("Camp access"). */
  title: ReactNode;
  width?: string;
  children: ReactNode;
  /** Under the window: a second window, a quiet line. */
  after?: ReactNode;
}) {
  return (
    <main
      data-os-skin
      className="relative flex min-h-svh w-full flex-col items-center justify-center gap-4 overflow-hidden bg-os-bg px-4 py-12 text-os-fg"
    >
      <Surface />
      <div
        className={cn(
          "os-window-in relative flex w-full flex-col border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]",
          width,
        )}
      >
        <div className="flex h-9 shrink-0 select-none items-center justify-between gap-2 bg-os-primary px-3 text-os-primary-fg">
          <span className="truncate font-pixel text-xs uppercase tracking-[0.2em]">
            {title}
          </span>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider opacity-80"
          >
            404 OS
          </span>
        </div>
        {children}
      </div>
      {after && (
        <div className={cn("relative flex w-full flex-col gap-4", width)}>
          {after}
        </div>
      )}
    </main>
  );
}

interface AuthShellProps {
  children: ReactNode;
  className?: string;
  /** Short wide-tracked line under the card. */
  footer?: ReactNode;
  /** A second card under the main one (the invite gate's confirm-email). */
  aside?: ReactNode;
  /** Eyebrow over the card. @default "Camp 404" */
  eyebrow?: ReactNode;
  /** Glyph in the circle over the card. @default Tent */
  icon?: ReactNode;
  /**
   * The 404 OS gate look (decision 5 A): the invite gate at
   * /signup/required wears it; the sign-in pages themselves do not.
   */
  os?: boolean;
}

/**
 * The auth card: every page that asks for credentials, an invite code, or a
 * similar handshake. Mirrors AfrikaBurn's organiser sign-in.
 */
export function AuthShell({
  children,
  className,
  footer,
  aside,
  eyebrow = "Camp 404",
  icon = <Tent aria-hidden />,
  os = false,
}: AuthShellProps) {
  if (os) {
    return (
      <OsGateFrame
        title={eyebrow}
        width="max-w-sm"
        after={
          aside || footer ? (
            <>
              {aside}
              {footer && (
                <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-os-muted">
                  {footer}
                </p>
              )}
            </>
          ) : undefined
        }
      >
        <div className={cn("flex flex-col gap-4 p-5", className)}>
          <OsGateIcon icon={icon} />
          {children}
        </div>
      </OsGateFrame>
    );
  }
  return (
    <main
      className={cn(
        "mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-4 px-6 py-12",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <GateIcon icon={icon} />
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
      {aside}
      {footer && (
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {footer}
        </p>
      )}
    </main>
  );
}

interface GateScreenProps {
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A small line under the description, e.g. an error's trace code. */
  meta?: ReactNode;
  /** The ways on: buttons, a note, "Signed in as". */
  children?: ReactNode;
  tone?: Tone;
  /** For a boundary that moves focus to its heading. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The full-screen gate: shown to anyone held before the console (awaiting
 * approval, a required questionnaire, first-time setup, a lost page or a
 * crash). The 404 OS look (decision 5 A): one window on the CRT desktop, the
 * eyebrow in its magenta title bar, the heading in the pixel face.
 */
export function GateScreen({
  icon,
  eyebrow,
  title,
  description,
  meta,
  children,
  tone,
  headingRef,
}: GateScreenProps) {
  return (
    <OsGateFrame title={eyebrow}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <OsGateIcon icon={icon} tone={tone} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
              className="os-glow text-lg uppercase leading-tight outline-none"
            >
              {title}
            </h1>
            {description && (
              <p className="text-balance text-sm text-muted-foreground">
                {description}
              </p>
            )}
            {meta}
          </div>
        </div>
        {children}
      </div>
    </OsGateFrame>
  );
}
