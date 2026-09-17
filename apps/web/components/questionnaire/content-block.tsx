import { isAllowedBuilderImageUrl, type BuilderContentBlock } from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { Megaphone, TriangleAlert } from "lucide-react";

// Display-only renderer for a builder questionnaire's content blocks (header
// breaks, explainers, images, dividers). These capture nothing — there is no
// value/onChange — and the response validators skip them. Rendered inside the
// builder runner's page→block loop.
export function ContentBlockRenderer({ block }: { block: BuilderContentBlock }) {
  switch (block.kind) {
    case "header_break":
      return (
        <div
          className={
            block.alignment === "center"
              ? "flex flex-col items-center gap-1.5 text-center"
              : "flex flex-col items-start gap-1.5 text-left"
          }
        >
          {block.eyebrow && (
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
              {block.eyebrow}
            </span>
          )}
          <h3 className="text-lg font-bold text-foreground">
            {block.headingText}
          </h3>
          {block.subtext && (
            <p className="text-sm text-muted-foreground">{block.subtext}</p>
          )}
        </div>
      );
    case "explainer": {
      // plain = naked muted paragraph; note/callout = accent info tone (callout
      // adds a megaphone); warning = warning tone with an alert triangle.
      if (block.style === "plain") {
        return <p className="text-sm text-muted-foreground">{block.bodyText}</p>;
      }
      const variant = block.style === "warning" ? "warning" : "info";
      const Icon =
        block.style === "callout"
          ? Megaphone
          : block.style === "warning"
            ? TriangleAlert
            : null;
      return (
        <Alert variant={variant}>
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          <span className="text-sm">{block.bodyText}</span>
        </Alert>
      );
    }
    case "image_block": {
      const fitClass =
        block.sizeFit === "full-width"
          ? "w-full -mx-4"
          : block.sizeFit === "fill"
            ? "w-full"
            : "w-full rounded-md";
      return (
        <figure className="flex flex-col gap-2">
          {/* A plain img on purpose: next/image needs a configured domain
              allowlist, which an arbitrary author/Blob URL can't satisfy. */}
          {/* Only images Camp 404 stores. A definition saved before that
              rule could hold another site's link, and rendering it would make
              every member's browser call that site. */}
          {isAllowedBuilderImageUrl(block.imageUrl) && (
            <img src={block.imageUrl} alt={block.altText} className={fitClass} />
          )}
          {block.caption && (
            <figcaption className="text-center text-xs text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    }
    case "divider":
      return <hr className="border-border" />;
  }
}
