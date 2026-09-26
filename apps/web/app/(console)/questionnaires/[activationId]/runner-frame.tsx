import type { ReactNode } from "react";
import { cn } from "@camp404/ui/lib/utils";
import { HeldScreen } from "@/components/os/held-screen";
import { resolveMemberState } from "@/lib/member-gate";

/**
 * The page frame for the questionnaire runner and its completion screen, which
 * render three ways.
 *
 *  - A member with nothing standing in the way is on the 404 OS desktop, and
 *    the page is in a window, which already pads it: a centred reading width.
 *  - A member held by a blocking questionnaire sees the page on top of an
 *    inert desktop, in the blocking layer (`app/(console)/layout.tsx`). The
 *    frame says so with `<HeldScreen>`, so a desktop that was drawn before
 *    the hold began (the member was sent the form mid-session, and clicked)
 *    switches to the held picture at once and refreshes.
 *  - Anyone else (no desktop) gets the page bare: a full-height column with
 *    its own padding.
 *
 * The test is the layout's own (`resolveMemberState`, cached per request, so it
 * costs no second read). The layout also draws nothing before first-time
 * setup, but nobody can have been sent a questionnaire before then.
 */
export async function RunnerFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const state = await resolveMemberState();
  const member = state.kind === "member" ? state : null;

  if (member && !member.block) {
    return (
      <div className={cn("mx-auto flex w-full max-w-2xl flex-col", className)}>
        {children}
      </div>
    );
  }
  if (member?.block?.reason === "questionnaire") {
    return (
      <div className={cn("flex w-full flex-col px-4 py-6", className)}>
        <HeldScreen />
        {children}
      </div>
    );
  }
  return (
    <main
      className={cn(
        "mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8",
        className,
      )}
    >
      {children}
    </main>
  );
}
