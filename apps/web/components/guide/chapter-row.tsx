import Link from "next/link";
import { Badge } from "@camp404/ui/components/badge";
import { guideChapterPath, MARK_LABEL } from "@/lib/guide-copy";

// One chapter in the guide's contents (#250): its title as a link, then what
// it is and whether this reader has seen it. The rows are the meetings list's.

export function ChapterRow({
  slug,
  title,
  kind,
  mark,
  aside,
}: {
  slug: string;
  title: string;
  kind: "chapter" | "duty_card";
  mark: "new" | "updated" | null;
  /** The other grouping's label: the team when grouped by topic, and so on. */
  aside: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
      <Link
        href={guideChapterPath(slug)}
        className="min-w-0 font-medium underline-offset-4 hover:text-accent hover:underline"
      >
        {title}
      </Link>
      <span className="flex flex-wrap items-center gap-1.5">
        {kind === "duty_card" ? (
          <Badge variant="outline">Duty card</Badge>
        ) : null}
        {mark ? (
          <Badge variant={mark === "new" ? "default" : "warning"}>
            {MARK_LABEL[mark]}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">{aside}</span>
      </span>
    </div>
  );
}
