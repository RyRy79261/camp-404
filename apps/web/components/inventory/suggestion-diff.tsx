import type { ChangedField } from "@/lib/inventory-copy";

// A member's suggested change, as what it changes (#246 redesign): each
// field before and after ("How many 4 → 3"), the note quoted under it. Only
// the fields that differ, so a reviewer sees the change before pressing
// Approve.

export function SuggestionDiff({
  fields,
  note,
  narrow = false,
}: {
  fields: ChangedField[];
  note: string | null;
  /** The item page's side rail: a narrower label column (the mock-up). */
  narrow?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {fields.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No change to the numbers: a count that matches.
        </p>
      ) : (
        <dl
          className={`grid ${narrow ? "grid-cols-[5rem_1fr]" : "grid-cols-[6rem_1fr]"} gap-x-3 gap-y-1 text-[13px] leading-5`}
        >
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0">
                {f.from && (
                  <>
                    <s className="text-muted-foreground decoration-muted-foreground/60">
                      {f.from}
                    </s>{" "}
                    <span aria-hidden>→</span>
                    <span className="sr-only">to</span>{" "}
                  </>
                )}
                <span className="font-semibold">{f.to}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {note && (
        <p className="text-[13px] text-muted-foreground italic">
          &ldquo;{note}&rdquo;
        </p>
      )}
    </div>
  );
}
