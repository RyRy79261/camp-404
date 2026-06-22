import type { Block, BuilderPage, BuilderQuestionnaire } from "@camp404/types";

// Pure, immutable structural edits on a builder questionnaire — the canvas's
// autosave reducers. Kept framework-free so they're unit-testable and the
// island just maps a user action to one of these + a persist().

/** The stable id of a block — the wrapped question's id, or the content id. */
export function blockId(block: Block): string {
  return block.kind === "question" ? block.question.id : block.id;
}

/** A fresh client-generated id for a new page / block / question. */
export const newId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

function move<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T);
  return next;
}

export function moveBlock(
  def: BuilderQuestionnaire,
  pageId: string,
  from: number,
  to: number,
): BuilderQuestionnaire {
  return {
    ...def,
    pages: def.pages.map((p) =>
      p.id === pageId ? { ...p, blocks: move(p.blocks, from, to) } : p,
    ),
  };
}

export function movePage(
  def: BuilderQuestionnaire,
  from: number,
  to: number,
): BuilderQuestionnaire {
  return { ...def, pages: move(def.pages, from, to) };
}

export function addBlock(
  def: BuilderQuestionnaire,
  pageId: string,
  block: Block,
): BuilderQuestionnaire {
  return {
    ...def,
    pages: def.pages.map((p) =>
      p.id === pageId ? { ...p, blocks: [...p.blocks, block] } : p,
    ),
  };
}

export function removeBlock(
  def: BuilderQuestionnaire,
  pageId: string,
  id: string,
): BuilderQuestionnaire {
  return {
    ...def,
    pages: def.pages.map((p) =>
      p.id === pageId
        ? { ...p, blocks: p.blocks.filter((b) => blockId(b) !== id) }
        : p,
    ),
  };
}

export function replaceBlock(
  def: BuilderQuestionnaire,
  pageId: string,
  id: string,
  block: Block,
): BuilderQuestionnaire {
  return {
    ...def,
    pages: def.pages.map((p) =>
      p.id === pageId
        ? { ...p, blocks: p.blocks.map((b) => (blockId(b) === id ? block : b)) }
        : p,
    ),
  };
}

/** Insert `page` after `afterPageId` (or at the end when null / not found). */
export function addPage(
  def: BuilderQuestionnaire,
  afterPageId: string | null,
  page: BuilderPage,
): BuilderQuestionnaire {
  const pages = [...def.pages];
  const idx = afterPageId ? pages.findIndex((p) => p.id === afterPageId) : -1;
  pages.splice(idx < 0 ? pages.length : idx + 1, 0, page);
  return { ...def, pages };
}

/** Remove a page — but a questionnaire always keeps at least one. */
export function removePage(
  def: BuilderQuestionnaire,
  pageId: string,
): BuilderQuestionnaire {
  if (def.pages.length <= 1) return def;
  return { ...def, pages: def.pages.filter((p) => p.id !== pageId) };
}

export function patchPage(
  def: BuilderQuestionnaire,
  pageId: string,
  patch: Partial<Omit<BuilderPage, "id" | "blocks">>,
): BuilderQuestionnaire {
  return {
    ...def,
    pages: def.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
  };
}
