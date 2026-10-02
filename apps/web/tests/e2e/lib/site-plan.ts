import type { APIRequestContext } from "@playwright/test";

// A site plan the size of the camp's (the approved redesign's own example,
// drawn after the owner's Figma of the block): the left half of the block,
// 28 m along B Road and A Road and 60 m deep, sixteen camp pieces and sixteen
// tents. Specs and the owner's screenshots start from it instead of drawing
// thirty pieces with the keyboard.

type Kind =
  | "parking"
  | "sleeping_area"
  | "generator"
  | "kitchen"
  | "water"
  | "bins"
  | "other"
  | "stretch_tent"
  | "path"
  | "tent";

const piece = (
  id: string,
  kind: Kind,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => ({ id, kind, label, x, y, w, h });

const TENTS: [string, number, number, number, number][] = [
  ["Zanele", 3, 9.5, 3, 3],
  ["Sipho", 6.5, 9.5, 3, 3],
  ["Thandi", 10, 9.5, 3, 3],
  ["Lerato", 13.5, 9.5, 3, 3],
  ["Kyle", 17, 9.5, 4, 3],
  ["Aisha", 3, 14, 2.5, 2.5],
  ["Pieter", 6, 14, 2.5, 2.5],
  ["Naledi", 9, 14, 2.5, 2.5],
  ["Musa", 12, 14, 2.5, 2.5],
  ["Chloe", 15, 14, 2.5, 2.5],
  ["Tumi", 18, 14, 2.5, 2.5],
  ["Bongani", 3, 18.5, 3, 3],
  ["Megan", 6.5, 18.5, 3, 3],
  ["Jason", 10, 18.5, 3, 3],
  ["Fatima", 13.5, 18.5, 3, 3],
  ["Spare tent", 17, 18.5, 2.5, 2.5],
];

/** The camp's plan, as the editor would save it. */
export function campSitePlan() {
  return {
    plot: {
      widthM: 28,
      depthM: 60,
      north: "top",
      part: "left",
      edges: { top: "B Road", right: "", bottom: "A Road", left: "3ish road" },
    },
    pieces: [
      piece("p-cars", "parking", "Car row (9 cars)", 1, 1, 26, 5),
      piece("p-sleep", "sleeping_area", "Sleeping area", 1.5, 8, 21, 17),
      piece("p-gen", "generator", "Generator space", 24.5, 14, 3, 3),
      piece("p-kitchen", "kitchen", "Kitchen", 8, 28, 10, 7),
      piece("p-drink", "water", "Drinking water", 19.5, 28, 1.5, 2),
      piece("p-grey", "water", "Grey water", 19.5, 31, 1.5, 3),
      piece("p-bins", "bins", "Bins", 4, 29, 2.5, 1.5),
      piece("p-fuel", "other", "Fuel storage", 24, 34.5, 3, 2),
      piece("p-lounge", "stretch_tent", "Lounge tent", 4, 38, 18, 9),
      piece("p-tr1", "parking", "Trailer 1", 23, 39, 2, 3.5),
      piece("p-tr2", "parking", "Trailer 2", 25.5, 39, 2, 3.5),
      piece("p-tr3", "parking", "Trailer 3", 23, 43.5, 2, 3.5),
      piece("p-tr4", "parking", "Trailer 4", 25.5, 43.5, 2, 3.5),
      piece("p-gate", "path", "Gateway", 3, 52, 2, 2),
      piece("p-sign", "other", "404 sign", 8, 56, 3, 1),
      piece("p-art", "other", "Shadow Work", 22, 52, 3, 3),
      ...TENTS.map(([name, x, y, w, h], i) =>
        piece(`t-${i + 1}`, "tent", name, x, y, w, h),
      ),
    ],
  };
}

/**
 * Save a plan as the next version this year, as `authUserId` (a captain or a
 * Structures lead who has loaded a page). Returns the version it became.
 */
export async function seedSitePlan(
  request: APIRequestContext,
  authUserId: string,
  layout: ReturnType<typeof campSitePlan> = campSitePlan(),
  note?: string,
): Promise<number> {
  const res = await request.post("/api/test/seed-layout", {
    data: { authUserId, layout, note },
  });
  if (!res.ok()) {
    throw new Error(`seedSitePlan failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { version: number }).version;
}
