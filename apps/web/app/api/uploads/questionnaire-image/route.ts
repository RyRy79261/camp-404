import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  flattenBuilderQuestions,
  flattenQuestions,
  type Question,
} from "@camp404/types";
import { getActivationById, getRequiredAction } from "@camp404/db/activations";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { ensureCampUser } from "@/lib/users";
import {
  deleteQuestionnaireImageBlobs,
  questionKeySegment,
  questionnaireImageDir,
} from "@/lib/avatar-blob";
import { isE2ETestMode } from "@/lib/test-mode";

// 5 MB hard cap — same as the avatar route; the client already centre-crops +
// downscales to ~512px WebP (see lib/image.ts).
const MAX_BYTES = 5 * 1024 * 1024;

// Same allow-list as the avatar route: /api/avatar streams blobs back
// same-origin with their stored content type, so a stored `image/svg+xml`
// would execute in this app's origin.
const ALLOWED_TYPES = new Set(["image/webp", "image/png"]);

export const runtime = "nodejs";

/**
 * Accept an image answer to a questionnaire `image` question.
 *
 * Deliberately NOT `/api/uploads/avatar`: that route owns the member's PROFILE
 * PHOTO and prunes its siblings under `avatars/<id>/` after every write, so
 * routing generic image answers through it made an answer delete the profile
 * photo (and a second answer delete the first). Answers are stored in a
 * per-question sub-folder — `avatars/<id>/answers/<question>/` — which that
 * cleanup now skips, which `/api/avatar` still serves (it is under `avatars/`),
 * and which account anonymisation still sweeps. The burner-profile
 * `profile.image` question keeps using the avatar route: its answer IS the
 * profile photo (onboarding/questionnaire/actions.ts mirrors it onto
 * `users.profile_image_url`).
 *
 * Auth, dual rate limiting, validation and the E2E short-circuit mirror the
 * avatar route.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const questionId = params.get("question");
  if (!questionId) {
    return NextResponse.json({ error: "Missing `question`" }, { status: 400 });
  }

  const limit = await rateLimiter.limit(
    `questionnaire-image-upload:${user.id}`,
    { limit: 20 },
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  // Defence in depth — rate-limit by IP too, since user.id can be cheap to
  // mint via repeated signups.
  const ipLimit = await rateLimiter.limit(
    `questionnaire-image-upload-ip:${getClientIp(req.headers)}`,
    { limit: 40 },
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  // Authorize the KEY, before any storage is touched. Slugging only made the
  // client string path-safe; every distinct id still minted its own
  // `answers/<key>/` folder, and per-question cleanup never leaves the folder
  // it wrote to — so N ids meant N folders nothing ever prunes, which no
  // per-request rate or size limit bounds. Resolving the id against the
  // server's own definition bounds the folder count to the questions the
  // member is actually being asked.
  const resolved = await resolveImageQuestion(
    user,
    questionId,
    params.get("activation"),
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }
  // Key off the canonical record, not the client string.
  const questionKey = questionKeySegment(resolved.question.id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `image` file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Photo must be a WebP or PNG image" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const dir = questionnaireImageDir(user.id, questionKey);

  // E2E harness only — a deterministic stub with no network call.
  if (isE2ETestMode()) {
    return NextResponse.json({ url: proxyUrl(`${dir}test-image.webp`) });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  // No Blob store configured — say so rather than echoing a proxy URL for a
  // blob we never wrote (same contract as the avatar route).
  if (!token) {
    return NextResponse.json(
      { error: "Photo uploads aren't configured on this deployment." },
      { status: 501 },
    );
  }

  try {
    const ext = file.type === "image/png" ? "png" : "webp";
    const blob = await put(`${dir}image.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    // Prune this question's previous answer(s) only — never the profile photo,
    // never another question. Best-effort: a cleanup failure must not fail an
    // otherwise-successful upload.
    try {
      await deleteQuestionnaireImageBlobs(user.id, questionKey, blob.pathname);
    } catch (err) {
      console.error("questionnaire-image-cleanup error", err);
    }
    // Never hand the raw private blob URL to the client — it isn't readable
    // without the store token. Persist + render through the gated proxy.
    return NextResponse.json({ url: proxyUrl(blob.pathname) });
  } catch (err) {
    console.error("questionnaire-image-upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}

type QuestionLookup =
  | { ok: true; question: Question }
  | { ok: false; status: number; error: string };

const UNKNOWN: QuestionLookup = {
  ok: false,
  status: 400,
  error: "Unknown `question`",
};
const FORBIDDEN: QuestionLookup = {
  ok: false,
  status: 403,
  error: "Forbidden",
};

/**
 * The `image` question this upload claims to answer, resolved against the
 * SERVER's copy of the questionnaire — never the client's word for it.
 *
 * `activation` names the dispatched builder questionnaire the runner is
 * mounted on (`/questionnaires/[activationId]`); its absence means the burner
 * profile, the only questionnaire answered without one. An author previewing a
 * draft (`/captains/questionnaires/[key]/preview`) sends neither, so a preview
 * upload resolves to nothing and is refused — which is what that preview
 * already promises: it renders the real runner with no persistence and no
 * side effects.
 */
async function resolveImageQuestion(
  authUser: AuthenticatedUser,
  questionId: string,
  activationId: string | null,
): Promise<QuestionLookup> {
  if (!activationId) {
    // RESPONSES variant (all teams, incl. archived) — the same definition the
    // burner-profile save action validates a stored answer against.
    const questionnaire = await getQuestionnaireForResponses();
    return imageQuestion(
      flattenQuestions(questionnaire).find((q) => q.id === questionId),
    );
  }

  // Mirror the runner's access predicate (the page and saveBuilderResponses):
  // an open activation the viewer holds a PENDING obligation for. A member who
  // was never sent this questionnaire — or already finished it — has no answer
  // to store.
  const campUser = await ensureCampUser(authUser);
  const activation = await getActivationById(activationId);
  if (!activation || activation.status !== "open") return FORBIDDEN;
  const targeted = await getRequiredAction(
    campUser.id,
    activation.questionnaireKey,
  );
  if (
    !targeted ||
    targeted.status !== "pending" ||
    targeted.activationId !== activation.id
  ) {
    return FORBIDDEN;
  }

  // The version this activation PINNED, so a question the head has since
  // dropped still accepts the answer the member is being asked for.
  const definition = await getBuilderDefinition(
    activation.questionnaireKey,
    activation.version,
  );
  if (!definition) return FORBIDDEN;
  return imageQuestion(
    flattenBuilderQuestions(definition).find((q) => q.id === questionId),
  );
}

/** A found question, but only if it is the `image` kind this route stores. */
function imageQuestion(question: Question | undefined): QuestionLookup {
  if (!question || question.kind !== "image") return UNKNOWN;
  return { ok: true, question };
}

/** Same-origin URL that streams a private blob to signed-in members. */
function proxyUrl(pathname: string): string {
  return `/api/avatar?pathname=${encodeURIComponent(pathname)}`;
}
