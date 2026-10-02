import { parseInline } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { paragraphsFromValue } from "./paragraph-text";

// The join site's words as members read them: one paragraph with its **bold**
// and *italic* (parseInline in @camp404/types; join.camp-404.com reads them
// the same way). About Camp 404 draws its paragraphs with these, and the
// editor's preview uses the same, so the preview is what members see.

export function InlineText({ text }: { text: string }) {
  return parseInline(text).map((run, i) => {
    const words = run.italic ? <em>{run.text}</em> : run.text;
    return run.bold ? (
      <strong key={i} className="font-semibold text-foreground">
        {words}
      </strong>
    ) : (
      <span key={i}>{words}</span>
    );
  });
}

/** Several paragraphs, each with its marks. */
export function InlineParagraphs({
  paragraphs,
  className,
}: {
  paragraphs: readonly string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <InlineText text={p} />
        </p>
      ))}
    </div>
  );
}

/** The editor's paragraphs-mode value, read as members read it. */
export function InlineParagraphsValue({ value }: { value: string }) {
  return (
    <InlineParagraphs
      paragraphs={paragraphsFromValue(value)}
      className="text-sm leading-relaxed"
    />
  );
}
