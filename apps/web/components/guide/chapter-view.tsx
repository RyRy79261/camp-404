import { NotebookText } from "lucide-react";
import type { DutyCard } from "@camp404/types";
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

export function ChapterView({
  kind,
  card,
  markdown,
}: {
  kind: "chapter" | "duty_card";
  card: DutyCard | null;
  markdown: string;
}) {
  const hasText = markdown.trim() !== "";
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
            <MarkdownBody>{markdown}</MarkdownBody>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
