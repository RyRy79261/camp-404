import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it is erased before the vi.mock factories hoist above it.
import type * as AvatarBlobModule from "@/lib/avatar-blob";

// The defect this file pins: the route slugged the client-supplied `question`
// into a blob path but never checked it named a real image question, so an
// authenticated member could mint an unbounded number of `answers/<key>/`
// folders — one per distinct id — and per-question cleanup, which never leaves
// the folder it wrote to, could not prune any of them. So the load-bearing
// assertions are on the REFUSED cases: `put` was never called and the cleanup
// never ran. A status check alone would not have caught the old behaviour,
// which happily answered 200.
//
// Request stubbing + the jsdom-environment note mirror the avatar route test.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
// The real key/dir derivation stays in play — the folder a legitimate upload
// lands in is part of what this asserts.
vi.mock("@/lib/avatar-blob", async (importOriginal) => ({
  ...(await importOriginal<typeof AvatarBlobModule>()),
  deleteQuestionnaireImageBlobs: vi.fn(),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  getBuilderDefinition: vi.fn(),
}));
vi.mock("@camp404/db/activations", () => ({
  getActivationById: vi.fn(),
  getRequiredAction: vi.fn(),
}));
vi.mock("@/lib/users", () => ({ ensureCampUser: vi.fn() }));

import { POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { isE2ETestMode } from "@/lib/test-mode";
import { rateLimiter } from "@/lib/rate-limit";
import { put } from "@vercel/blob";
import { deleteQuestionnaireImageBlobs } from "@/lib/avatar-blob";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { ensureCampUser } from "@/lib/users";

const TOKEN = "vercel_blob_rw_test_token";
const ACTIVATION = "act-1";

// A burner-profile-shaped definition: one image question and one that is not.
const BURNER = {
  version: "3",
  pages: [
    {
      id: "kitchen",
      kind: "questions",
      title: "Kitchen",
      questions: [
        {
          id: "kitchen.setup_photo",
          kind: "image",
          prompt: "Your setup",
          required: false,
        },
        {
          id: "about.name",
          kind: "short_text",
          prompt: "Name",
          maxLength: 80,
          required: true,
        },
      ],
    },
  ],
};

// A dispatched builder questionnaire pinned by the activation below.
const BUILDER = {
  version: "2",
  title: "Gear check",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Gear",
      blocks: [
        {
          kind: "question",
          question: {
            id: "gear.photo",
            kind: "image",
            prompt: "Your gear",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "gear.note",
            kind: "long_text",
            prompt: "Note",
            maxLength: 500,
            required: false,
          },
        },
      ],
    },
  ],
};

function upload(query: string, type = "image/webp"): Request {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array([1, 2, 3, 4])], "answer.webp", { type }),
  );
  return {
    method: "POST",
    url: `https://camp.test/api/uploads/questionnaire-image${query}`,
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/uploads/questionnaire-image", () => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "u1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    } as never);
    vi.mocked(getQuestionnaireForResponses).mockResolvedValue(BURNER as never);
    vi.mocked(ensureCampUser).mockResolvedValue({ id: "camp-1" } as never);
    vi.mocked(getActivationById).mockResolvedValue({
      id: ACTIVATION,
      questionnaireKey: "gear-check",
      version: "2",
      title: "Gear check",
      status: "open",
      blocking: true,
    } as never);
    vi.mocked(getRequiredAction).mockResolvedValue({
      status: "pending",
      version: "2",
      activationId: ACTIVATION,
    } as never);
    vi.mocked(getBuilderDefinition).mockResolvedValue(BUILDER as never);
    vi.mocked(put).mockResolvedValue({
      pathname: "avatars/u1/answers/kitchen-setup_photo/image-x7f2.webp",
    } as never);
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it("still answers 400 when `question` is missing", async () => {
    const res = await POST(upload(""));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing `question`" });
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses an id no questionnaire defines, and writes no blob", async () => {
    // THE STORAGE CASE. Each distinct id used to mint its own folder, which no
    // cleanup ever visits again — an authenticated member could fill the store
    // one 400-free request at a time.
    const res = await POST(upload("?question=made.up"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Unknown `question`" });
    expect(put).not.toHaveBeenCalled();
    expect(deleteQuestionnaireImageBlobs).not.toHaveBeenCalled();
  });

  it("refuses a real question that is not an `image` kind", async () => {
    // A text question's id is a perfectly good folder name, so path-safety
    // said yes; only the KIND rules it out.
    const res = await POST(upload("?question=about.name"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Unknown `question`" });
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses an unknown id before the E2E stub, which used to echo a url", async () => {
    // The stub short-circuits ahead of the blob write, so the check has to sit
    // in front of it or the harness path stays unauthorized.
    vi.mocked(isE2ETestMode).mockReturnValue(true);

    const res = await POST(upload("?question=made.up"));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it("stores a legitimate image answer in its own folder, and prunes only that folder", async () => {
    const res = await POST(upload("?question=kitchen.setup_photo"));

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledWith(
      "avatars/u1/answers/kitchen-setup_photo/image.webp",
      expect.any(File),
      {
        access: "private",
        addRandomSuffix: true,
        contentType: "image/webp",
        token: TOKEN,
      },
    );
    // Scoped to this question's key — never the profile photo, never another
    // question's answer.
    expect(deleteQuestionnaireImageBlobs).toHaveBeenCalledWith(
      "u1",
      "kitchen-setup_photo",
      "avatars/u1/answers/kitchen-setup_photo/image-x7f2.webp",
    );
    await expect(res.json()).resolves.toEqual({
      url: "/api/avatar?pathname=avatars%2Fu1%2Fanswers%2Fkitchen-setup_photo%2Fimage-x7f2.webp",
    });
  });

  it("stores an answer to a dispatched builder question against the pinned version", async () => {
    vi.mocked(put).mockResolvedValue({
      pathname: "avatars/u1/answers/gear-photo/image-a1b2.webp",
    } as never);

    const res = await POST(
      upload(`?question=gear.photo&activation=${ACTIVATION}`),
    );

    expect(res.status).toBe(200);
    // The version the activation pinned, not the editable head — a question the
    // head has since dropped is still the one the member is being asked.
    expect(getBuilderDefinition).toHaveBeenCalledWith("gear-check", "2");
    expect(put).toHaveBeenCalledWith(
      "avatars/u1/answers/gear-photo/image.webp",
      expect.any(File),
      expect.objectContaining({ contentType: "image/webp" }),
    );
  });

  it("refuses a builder question the member was never sent", async () => {
    vi.mocked(getRequiredAction).mockResolvedValue(null as never);

    const res = await POST(
      upload(`?question=gear.photo&activation=${ACTIVATION}`),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    // Refused at the access predicate — the definition is never even loaded.
    expect(getBuilderDefinition).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a builder question whose obligation is already completed", async () => {
    vi.mocked(getRequiredAction).mockResolvedValue({
      status: "completed",
      version: "2",
      activationId: ACTIVATION,
    } as never);

    const res = await POST(
      upload(`?question=gear.photo&activation=${ACTIVATION}`),
    );

    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a non-image block of a questionnaire the member IS answering", async () => {
    const res = await POST(
      upload(`?question=gear.note&activation=${ACTIVATION}`),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Unknown `question`" });
    expect(put).not.toHaveBeenCalled();
  });

  it("never reaches a definition for an unauthenticated request", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await POST(upload("?question=kitchen.setup_photo"));

    expect(res.status).toBe(401);
    expect(getQuestionnaireForResponses).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
