import type { MouseEvent } from "react";
import {
  MarkdownBody,
  type MarkdownLinkTarget,
} from "@camp404/ui/components/markdown-body";

// About Camp 404's words on the join site: the same Markdown, through the same
// safe renderer (@camp404/ui's MarkdownBody, with its `marks`), as About in
// the app, styled with the OS palette. Notion's blue reads as the OS's
// electric blue (--os-accent): highlighted lines on a blue wash, coloured
// words in blue.

const PROSE =
  "text-sm leading-relaxed text-os-fg [overflow-wrap:anywhere] " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 " +
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-pixel [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-widest [&_h2]:text-os-accent " +
  "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-pixel [&_h3]:text-xs [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:text-os-accent " +
  "[&_p]:my-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:marker:text-os-primary " +
  "[&_a]:text-os-accent [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_strong]:font-bold [&_em]:italic " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-os-accent [&_blockquote]:pl-4 [&_blockquote]:text-os-muted " +
  "[&_mark]:bg-os-accent/30 [&_mark]:px-0.5 [&_mark]:text-os-fg " +
  "[&_.md-accent]:text-os-accent [&_u]:underline [&_u]:underline-offset-2";

/**
 * A link inside the words: one to a section (`#about-…`) jumps to it when the
 * section is on the page (About Camp 404's window) and is plain words
 * elsewhere; one out of the site opens in its own tab.
 */
function linkFor(sectionsHere: boolean) {
  return (href: string): MarkdownLinkTarget | null => {
    if (href.startsWith("#")) {
      return sectionsHere && href.startsWith("#about-") ? { href } : null;
    }
    return { href, external: true };
  };
}

/**
 * Jump to a section inside the window's own scroll box, never by the
 * browser's anchor scroll, which would also scroll the desktop behind it and
 * put a #hash in the site's address.
 */
function jump(e: MouseEvent<HTMLElement>) {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
    'a[href^="#about-"]',
  );
  if (!a) return;
  e.preventDefault();
  const target = document.getElementById(a.getAttribute("href")!.slice(1));
  jumpTo(target);
}

/**
 * Scroll the window to a section and move focus to it (the section has
 * tabIndex -1), so the next Tab goes on from the section, not the link.
 */
export function jumpTo(target: HTMLElement | null) {
  const box = target?.closest<HTMLElement>("[data-window-body]");
  if (!target || !box) return;
  target.focus({ preventScroll: true });
  const top =
    target.getBoundingClientRect().top -
    box.getBoundingClientRect().top +
    box.scrollTop;
  box.scrollTo({ top: Math.max(0, top - 12), behavior: "smooth" });
}

export function AboutWords({
  children,
  sectionsHere = false,
}: {
  children: string;
  /** Every section is on this page, so `#about-…` links can jump. */
  sectionsHere?: boolean;
}) {
  return (
    // Delegation for the links inside: they are real links, so Enter on one
    // fires this click too.
    <div onClick={sectionsHere ? jump : undefined}>
      <MarkdownBody prose={PROSE} marks linkFor={linkFor(sectionsHere)}>
        {children}
      </MarkdownBody>
    </div>
  );
}
