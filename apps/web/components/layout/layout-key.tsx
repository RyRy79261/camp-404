import { LAYOUT_KIND_LABELS, pieceName } from "@camp404/core";
import type { LayoutPieceKind } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { KIND_COLOURS, sizeText, type PlanPiece } from "./layout-plan";

// The plan's key (the approved redesign, 2026-10-01): every piece by the
// number it wears on the plan, its name and its size in metres, the camp's
// pieces first and then the tents ("who sleeps where"). Inside the camp a row
// is a button when the page passes `onPick`: it picks that piece on the plan
// (to edit it, or only to find it). The neighbour page's key is by kind, with
// a count, and names nothing typed inside the camp.

const ROW =
  "grid h-8 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] page-md:h-7 items-center border-t border-border/60 text-left text-[13px]";

/** A number in its kind's colour, as the plan draws it. */
export function KeyChip({
  kind,
  text,
  className,
}: {
  kind: LayoutPieceKind;
  text: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-[18px] w-6 items-center justify-center border text-[10px] font-bold tabular-nums",
        className,
      )}
      style={{
        borderColor: KIND_COLOURS[kind],
        background: `color-mix(in oklab, ${KIND_COLOURS[kind]} 22%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}

function KeyRow({
  piece,
  pieceKey,
  picked,
  onPick,
  small,
}: {
  piece: PlanPiece;
  pieceKey: string;
  picked: boolean;
  onPick?: (id: string) => void;
  small?: boolean;
}) {
  const name = pieceName({ kind: piece.kind, label: piece.label ?? "" });
  const body = (
    <>
      <KeyChip kind={piece.kind} text={pieceKey} />
      <span className={cn("truncate pl-1", small && "text-xs")}>{name}</span>
      <span className="pl-1.5 text-xs tabular-nums text-muted-foreground">
        {sizeText(piece.w, piece.h)}
      </span>
    </>
  );
  return (
    <li
      className={cn(
        picked &&
          "bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_24%,var(--color-card)))]",
      )}
    >
      {onPick ? (
        <button
          type="button"
          className={cn(
            ROW,
            "cursor-pointer hover:bg-[var(--color-choice-hover,color-mix(in_oklab,var(--color-primary)_18%,var(--color-card)))]",
          )}
          aria-pressed={picked}
          aria-label={`${pieceKey}, ${name}: show on the plan`}
          onClick={() => onPick(piece.id)}
        >
          {body}
        </button>
      ) : (
        <div className={ROW}>{body}</div>
      )}
    </li>
  );
}

/** The key inside the camp: every piece by its number. */
export function LayoutKey({
  pieces,
  keys,
  pickedId = null,
  onPick,
  className,
}: {
  pieces: readonly PlanPiece[];
  keys: ReadonlyMap<string, string>;
  pickedId?: string | null;
  onPick?: (id: string) => void;
  className?: string;
}) {
  const camp = pieces.filter((p) => p.kind !== "tent");
  const tents = pieces.filter((p) => p.kind === "tent");
  return (
    <div className={cn("@container/key", className)}>
      <h2 className="mb-2 font-pixel text-[11px] tracking-[0.2em]">KEY</h2>
      {pieces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing on the plan yet.
        </p>
      ) : null}
      {camp.length > 0 ? (
        <>
          <p className="mb-1 mt-3 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Camp pieces
            <span> · sizes in metres</span>
          </p>
          <ol
            aria-label="Camp pieces"
            className="grid grid-cols-1 gap-x-3 @[21rem]/key:grid-cols-2"
          >
            {camp.map((piece) => (
              <KeyRow
                key={piece.id}
                piece={piece}
                pieceKey={keys.get(piece.id) ?? ""}
                picked={pickedId === piece.id}
                onPick={onPick}
              />
            ))}
          </ol>
        </>
      ) : null}
      {tents.length > 0 ? (
        <>
          <p className="mb-1 mt-3 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Tents
            <span> · who sleeps where</span>
          </p>
          <ol
            aria-label="Tents"
            className="grid grid-cols-1 gap-x-3 @[20rem]/key:grid-cols-2"
          >
            {tents.map((piece) => (
              <KeyRow
                key={piece.id}
                piece={piece}
                pieceKey={keys.get(piece.id) ?? ""}
                picked={pickedId === piece.id}
                onPick={onPick}
                small
              />
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

/** The neighbour page's key: each kind, its number on the plan, how many. */
export function KindKey({
  counts,
  keys,
  className,
}: {
  counts: readonly { kind: LayoutPieceKind; count: number }[];
  keys: ReadonlyMap<LayoutPieceKind, string>;
  className?: string;
}) {
  if (counts.length === 0) return null;
  return (
    <ol
      aria-label="What's on the plan"
      className={cn("grid grid-cols-2 gap-x-3 page-md:gap-x-4", className)}
    >
      {counts.map(({ kind, count }) => (
        <li key={kind} className={ROW}>
          <KeyChip kind={kind} text={keys.get(kind) ?? ""} />
          <span className="truncate pl-1">{LAYOUT_KIND_LABELS[kind]}</span>
          <span className="pl-1.5 text-xs tabular-nums text-muted-foreground">
            ×{count}
          </span>
        </li>
      ))}
    </ol>
  );
}
