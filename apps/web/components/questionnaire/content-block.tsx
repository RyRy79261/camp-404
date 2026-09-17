import { Info, Megaphone, TriangleAlert } from "lucide-react";
import {
  isAllowedBuilderImageUrl,
  type BuilderContentBlock,
  type ContentBlock,
} from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { cn } from "@camp404/ui/lib/utils";

// Content blocks (AfrikaBurn's `content-block.tsx`, plus Camp 404's header
// breaks, explainers and dividers). These take NO answer: they never appear in
// the response map, never count towards progress, and never gate completion —
// `pageQuestions()` / `visibleQuestions()` filter them out upstream, so this
// component is purely decorative by construction. A block's `visibleIf` is the
// runner's business, not this component's.

type SizeFit = NonNullable<
  Extract<ContentBlock, { kind: "image_block" }>["sizeFit"]
>;

// fit: the picture at its own size, never wider than the column; fill: the
// column's width; full-width: the column's width with no frame.
const IMAGE_FIT: Record<SizeFit, string> = {
  fit: "mx-auto h-auto max-w-full rounded-md border border-border",
  fill: "w-full rounded-md border border-border object-cover",
  "full-width": "w-full object-cover",
};

export function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case "info_block":
      return (
        <div className="flex gap-3 rounded-md border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            {block.heading && (
              <p className="text-sm font-semibold">{block.heading}</p>
            )}
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {block.body}
            </p>
          </div>
        </div>
      );

    case "image_block":
      return (
        <figure className="flex flex-col gap-1.5">
          {/* A plain img: next/image needs a host allowlist. Only images Camp
              404 stores are shown — a definition saved before that rule could
              hold another site's link, and rendering it would make every
              member's browser call that site. */}
          {isAllowedBuilderImageUrl(block.url) && (
            <img
              src={block.url}
              alt={block.alt}
              loading="lazy"
              className={IMAGE_FIT[block.sizeFit ?? "fit"]}
            />
          )}
          {block.caption && (
            <figcaption className="text-xs text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "header_break":
      return (
        <div
          className={cn(
            "flex flex-col gap-1.5",
            block.alignment === "center"
              ? "items-center text-center"
              : "items-start text-left",
          )}
        >
          {block.eyebrow && (
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
              {block.eyebrow}
            </span>
          )}
          <h3 className="text-lg font-semibold text-foreground">
            {block.headingText}
          </h3>
          {block.subtext && (
            <p className="text-sm text-muted-foreground">{block.subtext}</p>
          )}
        </div>
      );

    case "explainer": {
      // plain = a muted paragraph; note/callout = the info tone (callout adds a
      // megaphone); warning = the warning tone with a triangle.
      if (block.style === "plain") {
        return (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {block.bodyText}
          </p>
        );
      }
      const Icon =
        block.style === "callout"
          ? Megaphone
          : block.style === "warning"
            ? TriangleAlert
            : null;
      return (
        <Alert variant={block.style === "warning" ? "warning" : "info"}>
          {Icon && <Icon aria-hidden />}
          <span className="whitespace-pre-wrap">{block.bodyText}</span>
        </Alert>
      );
    }

    case "divider":
      return <hr className="border-border" />;
  }
}

/**
 * TEMPORARY: the builder's own block shape, for the builder's editor until it
 * reads the unified model. Its image block names the picture `imageUrl` /
 * `altText`; everything else is the same block.
 */
export function ContentBlockRenderer({
  block,
}: {
  block: BuilderContentBlock;
}) {
  if (block.kind !== "image_block") return <ContentBlockView block={block} />;
  const { imageUrl, altText, ...rest } = block;
  return <ContentBlockView block={{ ...rest, url: imageUrl, alt: altText }} />;
}
