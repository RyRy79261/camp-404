// A tent's label as a value to read and write down (#241): the one fact a
// member needs before the Burn, so it is drawn at heading size, never as a
// small chip. Server-safe (no state).

export function TentLabelValue({
  label,
  missing = "No label yet",
}: {
  label: string | null;
  /** Said while there is no label. */
  missing?: string;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Tent label
      </span>
      {label ? (
        <span
          data-testid="tent-label"
          className="text-2xl font-bold leading-tight tabular-nums text-foreground"
        >
          {label}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">{missing}</span>
      )}
    </span>
  );
}
