import { publicPieces, type PublicMarkdown } from "@camp404/core";
import {
  MarkdownBody,
  type MarkdownLinkTarget,
} from "@camp404/ui/components/markdown-body";
import { appChapterUrl, headingAnchor } from "@/lib/book";
import { LockIcon } from "./site-chrome";

// A chapter's words on the public site (#250). The text came from the
// database layer already cut (PublicMarkdown): each members-only part is one
// gap, drawn as a single fixed line that never names what was cut. It goes
// through the app's own safe renderer (@camp404/ui's MarkdownBody).

export const MEMBERS_GAP_WORDS = "There is more here for camp members.";

export function ChapterText({
  slug,
  markdown,
  linkFor,
  className = "chapter-body prose",
}: {
  slug: string;
  markdown: PublicMarkdown;
  linkFor: (href: string) => MarkdownLinkTarget | null;
  className?: string;
}) {
  return (
    <div className={className}>
      {publicPieces(markdown).map((piece, i) =>
        piece.gap ? (
          <p key={i} className="members-gap" data-testid="members-gap">
            <LockIcon />
            <span>
              {MEMBERS_GAP_WORDS}{" "}
              <a href={appChapterUrl(slug)}>Read it in the app</a>
            </span>
          </p>
        ) : (
          <MarkdownBody
            key={i}
            prose=""
            className="piece"
            linkFor={linkFor}
            headingAnchor={headingAnchor}
          >
            {piece.markdown}
          </MarkdownBody>
        ),
      )}
    </div>
  );
}
