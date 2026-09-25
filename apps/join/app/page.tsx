import { Inter } from "next/font/google";
import { Button } from "@camp404/ui/components/button";
import { CAMP_404_PALETTE } from "@camp404/ui/lib/landing-palette";
import { cn } from "@camp404/ui/lib/utils";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/site";

// The join site's one page, for now a placeholder in the signed-out landing's
// look (apps/web landing-hero.tsx): its palette, face, scanlines and
// terminal type. The real page is a large, visual page built here in code from
// the owner's copy (owner, 2026-09-25); it has no editor and reads nothing.

// The signed-out landing's face.
const inter = Inter({ subsets: ["latin"], display: "swap" });

const MUTED = "text-[color:var(--color-muted-foreground)]";

export default function JoinPage() {
  return (
    <main
      style={CAMP_404_PALETTE}
      className={cn(
        inter.className,
        "relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]",
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

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <p className={cn("text-[10px] uppercase tracking-[0.5em]", MUTED)}>
          Camp 404
        </p>
        <h1 className="join-chromatic font-mono text-3xl font-black uppercase tracking-[0.15em] sm:text-4xl">
          How to join
        </h1>
        <p className={cn("text-sm", MUTED)}>The full page is coming soon.</p>
        <Button asChild size="lg" className="mt-4 w-full max-w-xs">
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
            "join-cursor mt-6 font-mono text-[10px] uppercase tracking-[0.3em]",
            MUTED,
          )}
        >
          $ awaiting input_
        </p>
      </div>

      <style>{STYLES}</style>
    </main>
  );
}

// The landing's backdrop and terminal type (apps/web landing-hero.tsx),
// without the giant 404.
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
