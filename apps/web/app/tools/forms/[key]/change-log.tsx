import type { FormEdit } from "@/lib/forms";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

// The running edit history beneath a replayed form (board S15 detail view):
// one card per save, each listing the fields that changed as a from → to diff.
// Server-renderable — the page passes the edits in.
export function ChangeLog({ edits }: { edits: FormEdit[] }) {
  return (
    <section className="flex flex-col gap-3 pt-1.5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold text-foreground">Change log</h2>
        <p className="text-label text-muted-foreground">
          Every time you update this form we record what changed. We don&apos;t
          keep old versions — just this running history.
        </p>
      </div>

      {edits.length === 0 ? (
        <div className="rounded-xl bg-muted px-4 py-5 text-center text-label text-muted-foreground">
          No edits yet. Changes you make here will show up in this list.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {edits.map((edit) => (
            <li
              key={edit.id}
              className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5"
            >
              <p className="text-micro font-medium text-muted-foreground">
                {dateFmt.format(new Date(edit.createdAt))}
              </p>
              {edit.changes.map((change) => (
                <div key={change.fieldId} className="flex flex-col gap-1.5">
                  <p className="text-sm font-bold text-foreground">
                    {change.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-label">
                    <span className="text-muted-foreground">{change.from}</span>
                    <span className="text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <span className="font-medium text-foreground">
                      {change.to}
                    </span>
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
