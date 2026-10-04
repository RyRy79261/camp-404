import { Lock, NotebookText } from "lucide-react";
import { publicMarkdown, publicPieces, splitMembersOnly } from "@camp404/core";
import { GUIDE_SITE_HOST, type DutyCard } from "@camp404/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { MarkdownBody } from "@/components/announcements/markdown-body";
import { DutyCardView } from "./duty-card-view";

// A published chapter's words (#250), on the reader and on an old version's
// page: a duty card's parts first, then its Markdown; a chapter's Markdown
// alone. The Markdown goes through the announcements' renderer, which is the
// safety boundary for words one member writes and every other member reads.
//
// A "Members only" part (a `:::members` fence) is drawn in a marked box: the
// text is split by the same scanner the public site cuts with
// (splitMembersOnly), so what members see boxed is exactly what
// survival-guide.camp-404.com leaves out. `asPublic` shows the text as the
// public site will (the editor's "as the public will see it" preview).

export const MEMBERS_GAP_TEXT =
  "There is more here for camp members. Read it in the app.";

/** The text with its Members only parts boxed, or cut as the public sees it. */
export function GuideText({
  markdown,
  asPublic,
}: {
  markdown: string;
  asPublic?: boolean;
}) {
  if (asPublic) {
    return (
      <div className="flex flex-col">
        {publicPieces(publicMarkdown(markdown)).map((piece, i) =>
          piece.gap ? (
            <p
              key={i}
              data-testid="members-gap"
              className="my-3 flex items-center gap-2 border-y border-dashed border-border py-2 text-sm text-muted-foreground"
            >
              <Lock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              {MEMBERS_GAP_TEXT}
            </p>
          ) : (
            <MarkdownBody key={i}>{piece.markdown}</MarkdownBody>
          ),
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {splitMembersOnly(markdown).map((segment, i) =>
        segment.membersOnly ? (
          <section
            key={i}
            aria-label="Members only"
            data-testid="members-only-part"
            className="relative my-5 border border-dashed border-accent bg-accent/5 px-4 pb-2 pt-5"
          >
            <p className="absolute -top-2.5 left-3 flex items-center gap-1 bg-accent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              Members only
            </p>
            <p className="absolute -top-2 right-3 bg-background px-1.5 text-[11px] text-accent">
              Not on {GUIDE_SITE_HOST}
            </p>
            <MarkdownBody>{segment.markdown}</MarkdownBody>
          </section>
        ) : (
          <MarkdownBody key={i}>{segment.markdown}</MarkdownBody>
        ),
      )}
    </div>
  );
}

export function ChapterView({
  kind,
  card,
  markdown,
  bare,
  asPublic,
}: {
  kind: "chapter" | "duty_card";
  card: DutyCard | null;
  markdown: string;
  /** A chapter's text with no card around it (the editor's preview pane
   * draws the frame). */
  bare?: boolean;
  /** As survival-guide.camp-404.com will show it: members-only parts cut. */
  asPublic?: boolean;
}) {
  const hasText = markdown.trim() !== "";
  if (bare && kind === "chapter") {
    return hasText ? (
      <GuideText markdown={markdown} asPublic={asPublic} />
    ) : null;
  }
  return (
    <div className="flex flex-col gap-6">
      {kind === "duty_card" && card ? <DutyCardView card={card} /> : null}
      {hasText ? (
        <Card>
          {kind === "duty_card" ? (
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookText className="h-4 w-4 text-accent" aria-hidden />
                Good to know
              </CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className={kind === "duty_card" ? undefined : "pt-6"}>
            <GuideText markdown={markdown} asPublic={asPublic} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
