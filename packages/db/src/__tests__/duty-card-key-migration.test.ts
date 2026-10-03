import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";

// 0094 (#250): a duty card used to name its shift with a typed key
// (card.shiftTypeKey) that no shift carried. The migration links a shift type
// to the published duty card whose key is exactly the shift's name in that
// form ("Morning clean" -> morning-clean), only when one published card has
// that key, and never touches a shift that already has a card. The harness
// has run it on an empty database; the test stores rows and runs its SQL,
// twice.

describe("0094_link_duty_cards_by_typed_key", () => {
  const h = useTestDb();
  const SQL = readFileSync(
    new URL(
      "../../migrations/0094_link_duty_cards_by_typed_key.sql",
      import.meta.url,
    ),
    "utf8",
  );

  async function card(
    slug: string,
    key: string | null,
    published = true,
  ): Promise<string> {
    const body = JSON.stringify({
      ...(key === null ? {} : { shiftTypeKey: key }),
      subRoles: [{ name: "Washing", min: 1, max: 2 }],
      steps: ["Wash."],
      hardRules: [],
      checklist: [],
      askRole: "The lead",
    });
    const { rows } = await h.client().query<{ id: string }>(
      `INSERT INTO documents (title, slug, category, kind, card, published, published_version)
       VALUES ($1, $1, 'kitchen', 'duty_card', $2::jsonb, $3, $4) RETURNING id`,
      [slug, body, published, published ? 1 : null],
    );
    const id = rows[0]!.id;
    if (published) {
      await h.client().query(
        `INSERT INTO document_versions (document_id, version, title, category, kind, markdown, card)
         VALUES ($1, 1, $2, 'kitchen', 'duty_card', '', $3::jsonb)`,
        [id, slug, body],
      );
    }
    return id;
  }

  async function shift(name: string, dutyCardId: string | null = null) {
    await h.client().query(
      `INSERT INTO shift_types (cycle, team, name, start_minute, duration_minutes, places, duty_card_id)
       VALUES (2027, 'kitchen', $1, 480, 60, 2, $2)`,
      [name, dutyCardId],
    );
  }

  const links = async () =>
    (
      await h.client().query<{
        name: string;
        duty_card_id: string | null;
      }>(`SELECT name, duty_card_id FROM shift_types ORDER BY name`)
    ).rows.map((r) => [r.name, r.duty_card_id]);

  it("links only the exact, unambiguous matches, and a re-run changes nothing", async () => {
    const morning = await card("morning-card", "morning-clean");
    const snake = await card("snake-card", "night_watch");
    const keep = await card("keep-card", "breakfast");
    // Two published cards with one key: ambiguous, so neither links.
    await card("dup-a", "dishes");
    await card("dup-b", "dishes");
    // A draft's key is not one members read.
    await card("draft-card", "lounge-host", false);
    await card("no-key", null);

    await shift("Morning clean");
    await shift("Night watch");
    await shift("Breakfast", morning); // already linked: left alone
    await shift("Dishes");
    await shift("Lounge host");
    await shift("Morning cleaning"); // not exact

    await h.client().exec(SQL);
    const once = await links();
    expect(once).toEqual([
      ["Breakfast", morning],
      ["Dishes", null],
      ["Lounge host", null],
      ["Morning clean", morning],
      ["Morning cleaning", null],
      ["Night watch", snake],
    ]);
    expect(once.some(([, id]) => id === keep)).toBe(false);

    await h.client().exec(SQL);
    expect(await links()).toEqual(once);
  });
});
