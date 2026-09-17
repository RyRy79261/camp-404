import { CheckCircle2, ClipboardX } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@camp404/ui/components/card";
import { RunnerFrame } from "./runner-frame";

// Read-only cards the generic runner shows instead of the form when it can't be
// answered: a closed/missing activation, a non-targeted viewer, a malformed or
// empty definition. One card, like the AfrikaBurn fill page's "Already
// submitted", bare and centred for a member held by a gate, or in the console.
type EdgeKind =
  | "closed"
  | "not-invited"
  | "unavailable"
  | "empty"
  | "completed";

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
  // The viewer's own finished submission. "Closed" would read as though the
  // form shut before they got to it.
  completed: {
    title: "You've already answered this",
    body: "Your answers are in, and the captains can see them. Thanks.",
  },
};

export function RunnerEdgeCard({ kind }: { kind: EdgeKind }) {
  const { title, body } = COPY[kind];
  return (
    <RunnerFrame className="max-w-xl justify-center">
      <Card>
        <CardHeader>
          <h1 className="flex items-center gap-2 text-base font-semibold normal-case tracking-normal">
            {kind === "completed" ? (
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <ClipboardX
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            {title}
          </h1>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <a href="/">Back to camp</a>
          </Button>
        </CardContent>
      </Card>
    </RunnerFrame>
  );
}
