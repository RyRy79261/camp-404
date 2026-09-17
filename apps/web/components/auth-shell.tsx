import type { ReactNode, Ref } from "react";
import { Tent } from "lucide-react";
import { Card, CardContent } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";

// The screens a person sees before the console, in the AfrikaBurn organiser
// console's two compositions: the auth card (a mark and eyebrow over one card)
// and the gate screen (a centred column: icon circle, eyebrow, heading, copy,
// then the ways on). Neither sits inside the console layout, so each draws its
// own full-height frame. No hooks, so server pages and client boundaries both
// use them.

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

interface AuthShellProps {
  children: ReactNode;
  className?: string;
  /** Short wide-tracked line under the card. */
  footer?: ReactNode;
  /** Eyebrow over the card. @default "Camp 404" */
  eyebrow?: ReactNode;
  /** Glyph in the circle over the card. @default Tent */
  icon?: ReactNode;
}

/**
 * The auth card: every page that asks for credentials, an invite code, or a
 * similar handshake. Mirrors AfrikaBurn's organiser sign-in.
 */
export function AuthShell({
  children,
  className,
  footer,
  eyebrow = "Camp 404",
  icon = <Tent aria-hidden />,
}: AuthShellProps) {
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
 * crash). Mirrors AfrikaBurn's organiser GateScreen.
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
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <GateIcon icon={icon} tone={tone} />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-2xl font-semibold tracking-tight outline-none"
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
      {children}
    </main>
  );
}
