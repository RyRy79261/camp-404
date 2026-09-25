import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import { isJoinImageUrl } from "@camp404/core";
import { cn } from "../lib/utils";

// The join page's text as a visitor reads it (#264): on the join site, and in
// the captain's preview in Camp settings, so the preview is the page. Renders
// inside a root that carries CAMP_404_PALETTE (lib/landing-palette), the
// public pages' own look, not the console's.
//
// SAFETY. The page is public and the text is a captain's Markdown, pasted from
// Notion, so the renderer is the boundary:
//   - raw HTML never becomes markup (`skipHtml`). Notion's Markdown wraps a
//     callout in <aside>; dropping the tags keeps the words between them,
//     which are Markdown of their own.
//   - an allow-list schema: the tags Markdown makes, and on them only href,
//     src, alt and title.
//   - a picture shows only when it is one of the page's own uploads
//     (isJoinImageUrl). Any other host would be a tracking pixel on every
//     visitor, and Notion's picture links expire within the hour. A refused
//     picture leaves its alt text.
//   - a link keeps only http, https, mailto or an anchor; anything else
//     (javascript:, data:, a path on whichever host shows the page) loses its
//     href and reads as plain text. Every link opens in its own tab with no
//     referrer.

const SCHEMA: SanitizeSchema = {
  tagNames: [
    "p",
    "br",
    "strong",
    "em",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    // h1, h5 and h6 pass the schema only to be rendered as h2 and h4 below.
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "a",
    "img",
  ],
  attributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title"],
    "*": [],
  },
  protocols: { href: ["http", "https", "mailto"] },
  clobber: ["id", "name"],
  clobberPrefix: "join-page",
  strip: ["script", "style"],
  ancestors: { li: ["ul", "ol"] },
};

/** A link a visitor's browser may follow from the join page. */
export function isJoinLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("#")) return !/\s/.test(trimmed);
  return /^(?:https?:\/\/|mailto:)/i.test(trimmed);
}

function joinUrl(value: string, key: string): string {
  if (key === "src") return isJoinImageUrl(value) ? value.trim() : "";
  if (key === "href") return isJoinLinkUrl(value) ? value.trim() : "";
  return "";
}

// The prose shape of AfrikaBurn's MarkdownView (as MarkdownBody in the
// console), set in the landing's palette: headings take the magenta, links
// the electric blue.
const PROSE =
  "text-base leading-relaxed [overflow-wrap:anywhere] " +
  "[&>*:first-child]:mt-0 " +
  "[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-mono [&_h2]:text-sm [&_h2]:font-semibold " +
  "[&_h2]:uppercase [&_h2]:tracking-[0.25em] [&_h2]:text-[color:var(--color-primary)] " +
  "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:font-semibold " +
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 " +
  "[&_a]:text-[color:var(--color-accent)] [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--color-primary)] " +
  "[&_blockquote]:pl-4 [&_blockquote]:text-[color:var(--color-muted-foreground)] " +
  "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] " +
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-white/10 [&_pre]:p-3 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_hr]:my-8 [&_hr]:border-white/15 " +
  "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md";

export interface JoinPageBodyProps {
  /** The page's Markdown, as the captain saved it. */
  markdown: string;
  className?: string;
}

export function JoinPageBody({ markdown, className }: JoinPageBodyProps) {
  return (
    <div className={cn(PROSE, className)}>
      <Markdown
        skipHtml
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        urlTransform={joinUrl}
        components={{
          // The page owns its h1; a `#` in the text is a section heading.
          h1: ({ children }) => <h2>{children}</h2>,
          h5: ({ children }) => <h4>{children}</h4>,
          h6: ({ children }) => <h4>{children}</h4>,
          a: ({ href, title, children }) =>
            href ? (
              <a
                href={href}
                title={title}
                {...(href.startsWith("#")
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
          img: ({ src, alt, title }) =>
            typeof src === "string" && src !== "" ? (
              // A plain <img>: the host and size are not known at build time,
              // and the picture is streamed by the page's own route.
              <img src={src} alt={alt ?? ""} title={title} loading="lazy" />
            ) : (
              <>{alt}</>
            ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
