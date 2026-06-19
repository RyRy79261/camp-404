import { ClipboardX } from "lucide-react";
import { IconBadge } from "@camp404/ui/components/icon-badge";

// Read-only cards the generic runner shows instead of the form when it can't be
// answered: a closed/missing activation, a non-targeted viewer, a malformed or
// empty definition.
type EdgeKind = "closed" | "not-invited" | "unavailable" | "empty";

const COPY: Record<EdgeKind, { title: string; body: string }> = {
  closed: {
    title: "This form is closed",
    body: "This questionnaire isn't accepting answers right now. If you think that's a mistake, let a camp captain know.",
  },
  "not-invited": {
    title: "You're not on this one",
    body: "This questionnaire wasn't sent to you. Check with a camp captain if you think it should have been.",
  },
  unavailable: {
    title: "This form is unavailable",
    body: "We couldn't load this questionnaire. Please try again later — if it keeps happening, let a camp captain know.",
  },
  empty: {
    title: "Nothing to answer",
    body: "This questionnaire doesn't have any questions yet.",
  },
};

export function RunnerEdgeCard({ kind }: { kind: EdgeKind }) {
  const { title, body } = COPY[kind];
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
        <IconBadge size="lg" shape="circle" tone="muted">
          <ClipboardX aria-hidden />
        </IconBadge>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <p className="max-w-prose text-balance text-muted-foreground">
            {body}
          </p>
        </div>
        <a
          href="/"
          className="text-label text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to camp
        </a>
      </div>
    </main>
  );
}
