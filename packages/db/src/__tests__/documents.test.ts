import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  createDocument,
  getDocumentBySlug,
  listDocumentDrafts,
  setDocumentPublished,
  updateDocument,
} from "../documents";
import * as schema from "../schema";

// Documents are drafts until published; each write carries its audit row, a
// taken slug and a stale edit are refused.

describe("camp documents", () => {
  const h = useTestDb();

  it("creates a draft, refuses a taken slug, edits on the version read, and publishes", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    const created = await createDocument({
      title: "Kitchen safety",
      slug: "kitchen-safety",
      category: "manual",
      team: "kitchen",
      markdown: "# Gas",
      authorId: lead.id,
    });
    expect(created.ok && created.document).toMatchObject({
      version: 1,
      published: false,
    });
    expect(
      await createDocument({
        title: "Again",
        slug: "kitchen-safety",
        category: "manual",
        team: null,
        markdown: "",
        authorId: lead.id,
      }),
    ).toEqual({ ok: false, reason: "slug_taken" });

    const edited = await updateDocument({
      slug: "kitchen-safety",
      expectedVersion: 1,
      change: { markdown: "# Gas\n\nTurn it off." },
      actorId: lead.id,
    });
    expect(edited.ok && edited.document.version).toBe(2);
    expect(
      await updateDocument({
        slug: "kitchen-safety",
        expectedVersion: 1,
        change: { title: "Stale" },
        actorId: lead.id,
      }),
    ).toEqual({ ok: false, reason: "stale" });

    expect(
      (
        await setDocumentPublished({
          slug: "kitchen-safety",
          published: true,
          actorId: lead.id,
        })
      )?.published,
    ).toBe(true);
    expect(
      await setDocumentPublished({
        slug: "nope",
        published: true,
        actorId: lead.id,
      }),
    ).toBeNull();
    expect((await getDocumentBySlug("kitchen-safety"))?.title).toBe(
      "Kitchen safety",
    );

    const audit = await db.select().from(schema.auditLog);
    expect(audit.map((a) => a.action)).toEqual([
      "document.created",
      "document.updated",
      "document.published",
    ]);
  });

  it("lists drafts for a lead's teams and their own, and none for an empty scope", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    const other = await makeUser(db);
    const make = (
      slug: string,
      team: "kitchen" | "structures" | null,
      authorId: string,
    ) =>
      createDocument({
        title: slug,
        slug,
        category: "manual",
        team,
        markdown: "",
        authorId,
      });
    await make("kitchen-draft", "kitchen", other.id);
    await make("structures-draft", "structures", other.id);
    await make("own-general", null, lead.id);
    await make("published-one", "kitchen", other.id);
    await setDocumentPublished({
      slug: "published-one",
      published: true,
      actorId: other.id,
    });

    expect(
      (await listDocumentDrafts({ teams: ["kitchen"], authorId: lead.id })).map(
        (d) => d.slug,
      ),
    ).toEqual(["kitchen-draft", "own-general"]);
    expect(await listDocumentDrafts({ teams: [] })).toEqual([]);
    expect(await listDocumentDrafts()).toHaveLength(3);
  });
});
