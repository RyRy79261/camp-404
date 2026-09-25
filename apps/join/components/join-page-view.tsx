import { Button } from "@camp404/ui/components/button";
import { JoinPageBody } from "@camp404/ui/components/join-page-body";
import { CAMP_404_PALETTE } from "@camp404/ui/lib/landing-palette";
import { cn } from "@camp404/ui/lib/utils";
import type { JoinPageRead } from "@/lib/join-page";
import {
  APP_URL,
  PRIVACY_URL,
  SIGN_IN_URL,
  SIGN_UP_URL,
  TERMS_URL,
} from "@/lib/site";

// The join page as a visitor sees it: Camp 404's public look, the signed-out
// landing's palette, face, scanlines and terminal type (apps/web
// landing-hero.tsx), not the console's. The owner's text in the middle, and a
// clear way to sign up above and below it. Every word of the camp's own is
// the captains' (the database); this file holds only the frame.

const MUTED = "text-[color:var(--color-muted-foreground)]";

export function JoinPageView({
  read,
  fontClassName,
}: {
  read: JoinPageRead;
  fontClassName?: string;
}) {
  return (
    <main
      style={CAMP_404_PALETTE}
      className={cn(
        fontClassName,
        "relative min-h-[100dvh] overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]",
      )}
    >
      <div
        aria-hidden
        className="join-scanlines pointer-events-none absolute inset-0 z-0"
      />
      <div
        aria-hidden
        className="join-noise pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-6 pb-12 pt-14 sm:pt-20">
        <header className="flex flex-col items-center gap-4 text-center">
          <p className={cn("text-[10px] uppercase tracking-[0.5em]", MUTED)}>
            Camp 404
          </p>
          <h1 className="join-chromatic font-mono text-3xl font-black uppercase tracking-[0.15em] sm:text-4xl">
            How to join
          </h1>
          {read.status === "published" && read.cycle !== null ? (
            <p
              className={cn(
                "font-mono text-[11px] uppercase tracking-[0.3em]",
                MUTED,
              )}
            >
              For {read.cycle}
            </p>
          ) : null}
          <Button asChild size="lg" className="mt-2 w-full max-w-xs">
            <a href={SIGN_UP_URL}>Sign up</a>
          </Button>
        </header>

        <div className="mt-12">
          {read.status === "published" ? (
            <JoinPageBody markdown={read.markdown} />
          ) : (
            <p className={cn("text-center text-sm", MUTED)}>
              {read.status === "none"
                ? "This year's page about joining isn't up yet. You can still sign up, and check back here soon."
                : "This page didn't load just now. Try again in a minute."}
            </p>
          )}
        </div>

        <section
          aria-label="Sign up"
          className="mt-14 flex flex-col items-center gap-3 border-t border-white/10 pt-10 text-center"
        >
          <Button asChild size="lg" className="w-full max-w-xs">
            <a href={SIGN_UP_URL}>Sign up</a>
          </Button>
          <p className={cn("text-sm", MUTED)}>
            Already in camp?{" "}
            <a
              href={SIGN_IN_URL}
              className="text-[color:var(--color-foreground)] underline underline-offset-4"
            >
              Sign in
            </a>
          </p>
          <p
            aria-hidden
            className={cn(
              "join-cursor mt-4 font-mono text-[10px] uppercase tracking-[0.3em]",
              MUTED,
            )}
          >
            $ awaiting input_
          </p>
        </section>

        <footer className="mt-8">
          <nav
            aria-label="Camp 404"
            className={cn(
              "flex flex-wrap justify-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.3em]",
              MUTED,
            )}
          >
            <a
              href={APP_URL}
              className="hover:text-[color:var(--color-foreground)]"
            >
              camp-404.com
            </a>
            <a
              href={PRIVACY_URL}
              className="hover:text-[color:var(--color-foreground)]"
            >
              Privacy
            </a>
            <a
              href={TERMS_URL}
              className="hover:text-[color:var(--color-foreground)]"
            >
              Terms
            </a>
          </nav>
        </footer>
      </div>

      <style>{STYLES}</style>
    </main>
  );
}

// The landing's backdrop and terminal type (apps/web landing-hero.tsx),
// without the giant 404: the page is for reading.
const STYLES = `
  .join-chromatic {
    text-shadow:
      -1.5px 0 0 rgba(255, 0, 128, 0.8),
       1.5px 0 0 rgba(0, 200, 255, 0.8);
  }
  .join-scanlines {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 2px,
      rgba(255, 255, 255, 0.045) 2px,
      rgba(255, 255, 255, 0.045) 3px
    );
  }
  .join-noise {
    background-image:
      radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.5px),
      radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 0.5px);
    background-size: 3px 3px, 7px 7px;
    background-position: 0 0, 1px 1px;
    mix-blend-mode: overlay;
  }
  .join-cursor {
    animation: join-cursor-blink 1.05s steps(1) infinite;
  }
  @keyframes join-cursor-blink {
    0%, 49%   { opacity: 1; }
    50%, 100% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .join-cursor { animation: none; }
  }
`;
