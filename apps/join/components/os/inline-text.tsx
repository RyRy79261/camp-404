import { parseInline } from "@camp404/types";

// One paragraph of the camp's words, with the **bold** and *italic* captains
// set in the app's editor (parseInline in @camp404/types; About Camp 404 reads
// them the same way). Plain words read exactly as before.

export function InlineText({ text }: { text: string }) {
  return parseInline(text).map((run, i) => {
    const words = run.italic ? <em>{run.text}</em> : run.text;
    return run.bold ? (
      <strong key={i} className="font-bold text-os-fg">
        {words}
      </strong>
    ) : (
      <span key={i}>{words}</span>
    );
  });
}
