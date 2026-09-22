"use client";

import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import { isAllowedBuilderImageUrl } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";

// MarkdownBody — the rendered announcement body, on the two surfaces where a
// member reads the WHOLE message: the announcement page and the full-screen
// acknowledgement takeover. Everywhere the body is clipped stays plain text
// (`plainPreview` from @camp404/core), and so does every channel that leaves
// the app — push, email, Telegram.
//
// Mirrors AfrikaBurn's read-only bulletin renderer
// (packages/ui/src/components/markdown-editor/markdown-view.tsx): the same
// prose shape, restyled with Camp 404's tokens. AfrikaBurn renders through a
// Tiptap schema because react-markdown is not in its tree; ours IS in the
// tree, so this is react-markdown behind rehype-sanitize and there is no
// tiptap dependency to port.
//
// SAFETY. A captain's markdown is read by every other member, so the renderer
// is the boundary, not the composer:
//   - raw HTML never reaches the DOM. react-markdown does not parse it (no
//     rehype-raw), and the schema below drops what remark leaves behind, so a
//     <script> or an onerror= shows as the text it was typed as.
//   - the schema is an ALLOW-list built from nothing, not defaultSchema with
//     holes patched: the tags markdown itself produces, and on them only href,
//     src, alt and title.
//   - an image may only come from Camp 404's own storage. The rule is
//     `isAllowedBuilderImageUrl` (@camp404/types), the same one the
//     questionnaire builder's image blocks use — a link to any other host
//     would make every member's browser call it (a tracking pixel) and could
//     change after the captain looked at it.
//   - a link keeps only http/https/mailto, or a path on this app. Anything
//     else (javascript:, data:) loses its href and renders as plain text.
// `markdown-body.test.tsx` holds each of those to a test.

/**
 * The tags markdown can produce, and nothing else. Anything outside the list
 * is unwrapped to its own text, so a member still reads the words.
 */
const ANNOUNCEMENT_SCHEMA: SanitizeSchema = {
  tagNames: [
    "p",
    "br",
    "strong",
    "em",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
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
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["https"],
  },
  // Anything a member types that looks like an id is namespaced, so a body
  // cannot collide with (or overwrite) an element the page owns.
  clobber: ["id", "name"],
  clobberPrefix: "announcement-body",
  // Dropped with their contents: what is inside them is not prose.
  strip: ["script", "style"],
  ancestors: { li: ["ul", "ol"] },
};

/** A link target a member's browser may follow from an announcement. */
function isAllowedLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  // A path on this app. "//host" and "/\host" both leave it in a browser.
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && !/[\\\s]/.test(trimmed);
  }
  if (trimmed.startsWith("#")) return true;
  return /^(?:https?|mailto):/i.test(trimmed);
}

/**
 * The first gate on every URL in the body, before the schema sees it. Returns
 * "" for a target we will not carry, which the components below render as
 * plain text rather than a dead link or a broken image.
 */
function announcementUrl(value: string, key: string): string {
  if (key === "src") return isAllowedBuilderImageUrl(value) ? value : "";
  if (key === "href") return isAllowedLinkUrl(value) ? value : "";
  return "";
}

/**
 * The prose shape, copied from AfrikaBurn's MarkdownView and re-tokenised:
 * links take Camp 404's accent instead of AfrikaBurn's primary. A class set in
 * the app, deliberately — no typography plugin is added for six rules.
 */
const PROSE =
  "text-base leading-relaxed [overflow-wrap:anywhere] " +
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight " +
  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&>*:first-child]:mt-0 " +
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border " +
  "[&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] " +
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_hr]:my-5 [&_hr]:border-border " +
  "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md";

export interface MarkdownBodyProps {
  /** The announcement body, as the captain wrote it. */
  children: string;
  className?: string;
}

export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  return (
    <div className={cn(PROSE, className)}>
      <Markdown
        rehypePlugins={[[rehypeSanitize, ANNOUNCEMENT_SCHEMA]]}
        urlTransform={announcementUrl}
        components={{
          // Markdown's `#` is an h1, and the page already has one. Demote it
          // so the body cannot break the heading outline a screen reader
          // walks.
          h1: ({ children: kids }) => <h2>{kids}</h2>,
          // A link out of the app opens in its own tab and carries no
          // referrer; one that stays in the app navigates in place, because
          // sending a member to /profile in a second tab is a bug, not a
          // courtesy.
          a: ({ href, title, children: kids }) => {
            if (!href) return <>{kids}</>;
            const external = !href.startsWith("/") && !href.startsWith("#");
            return (
              <a
                href={href}
                title={title}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                  : {})}
              >
                {kids}
              </a>
            );
          },
          // A refused image leaves its alt text, which is what the member
          // needed from it anyway.
          img: ({ src, alt, title }) =>
            typeof src === "string" && src !== "" ? (
              // A plain <img>, not next/image: the body is arbitrary markdown,
              // so neither the dimensions nor the host are known at build time.
              <img src={src} alt={alt ?? ""} title={title} />
            ) : (
              <>{alt}</>
            ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
