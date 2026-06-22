"use client";

import { useState } from "react";
import {
  Heading,
  Image as ImageIcon,
  Minus,
  Search,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { Block } from "@camp404/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Input } from "@camp404/ui/components/input";
import {
  BUILDER_FIELD_KINDS,
  morphQuestion,
  type BuilderFieldKind,
} from "./field-kinds";
import { newId } from "./builder-ops";

function makeQuestion(kind: BuilderFieldKind): Block {
  return {
    kind: "question",
    question: morphQuestion(
      {
        id: newId(),
        kind: "short_text",
        prompt: "Untitled question",
        required: false,
        maxLength: 120,
      },
      kind,
    ),
  };
}

// Content blocks start with valid, non-empty placeholders so the autosaved
// definition always parses; the editor opens for refinement on insert.
function makeContent(
  kind: "header_break" | "explainer" | "image_block" | "divider",
): Block {
  switch (kind) {
    case "header_break":
      return { id: newId(), kind, headingText: "Heading" };
    case "explainer":
      return { id: newId(), kind, bodyText: "Add your text here.", style: "plain" };
    case "image_block":
      return {
        id: newId(),
        kind,
        imageUrl: "https://placehold.co/800x450",
        // Empty so the editor's Save stays disabled until the author writes real
        // alt text (blockValid rejects empty altText) — a fake default would ship.
        altText: "",
        sizeFit: "fit",
      };
    case "divider":
      return { id: newId(), kind };
  }
}

interface Tile {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  make: () => Block;
}

const CONTENT_TILES: Tile[] = [
  { key: "header_break", label: "Header break", desc: "A heading inside a page", icon: Heading, make: () => makeContent("header_break") },
  { key: "explainer", label: "Explainer", desc: "A paragraph of notes or text", icon: StickyNote, make: () => makeContent("explainer") },
  { key: "image_block", label: "Image", desc: "A picture with a caption", icon: ImageIcon, make: () => makeContent("image_block") },
  { key: "divider", label: "Divider", desc: "A thin dividing rule", icon: Minus, make: () => makeContent("divider") },
];

const INPUT_TILES: Tile[] = BUILDER_FIELD_KINDS.map(
  ({ kind, label, desc, icon }) => ({
    key: kind,
    label,
    desc,
    icon,
    make: () => makeQuestion(kind),
  }),
);

function TileButton({ tile, onPick }: { tile: Tile; onPick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon aria-hidden className="size-4 text-accent" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{tile.label}</span>
        <span className="text-xs text-muted-foreground">{tile.desc}</span>
      </span>
    </button>
  );
}

// The "Add block" catalog (boards 51/56). Content pages only offer content
// blocks; question pages offer both. Picking a tile inserts a default block and
// hands it back so the canvas can open its editor.
export function BlockCatalogDialog({
  pageType,
  onSelect,
  onClose,
}: {
  pageType: "question" | "content";
  onSelect: (block: Block) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (t: Tile) =>
    !q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q);

  const content = CONTENT_TILES.filter(match);
  const inputs = pageType === "content" ? [] : INPUT_TILES.filter(match);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add block</DialogTitle>
          <DialogDescription>
            Pick a field or content block to add to this page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search blocks"
            aria-label="Search blocks"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        </div>

        {content.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Content &amp; layout
            </h3>
            {content.map((tile) => (
              <TileButton
                key={tile.key}
                tile={tile}
                onPick={() => onSelect(tile.make())}
              />
            ))}
          </section>
        )}

        {inputs.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Input fields
            </h3>
            {inputs.map((tile) => (
              <TileButton
                key={tile.key}
                tile={tile}
                onPick={() => onSelect(tile.make())}
              />
            ))}
          </section>
        )}

        {content.length === 0 && inputs.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No blocks match “{query}”.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
