import type { ReactNode } from "react";
import { cn } from "@camp404/ui/lib/utils";
import { resolveMemberState } from "@/lib/member-gate";

/**
 * The page frame for the questionnaire runner and its completion screen, which
 * render two ways.
 *
 * The console layout draws its header only for a member with nothing standing
 * in the way (`app/(console)/layout.tsx`). A member held by a blocking
 * questionnaire gets these pages bare, so the frame is the whole screen: a full
 * height column with its own padding, under the runner's own blocking chrome.
 * Anyone else is inside the console, whose content column already pads the
 * page, so the frame is only a centred reading width.
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
  const inConsole = state.kind === "member" && !state.block;

  return inConsole ? (
    <div className={cn("mx-auto flex w-full max-w-2xl flex-col", className)}>
      {children}
    </div>
  ) : (
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
