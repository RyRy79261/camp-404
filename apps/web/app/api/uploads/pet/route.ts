import { errorLogText } from "@camp404/core";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { PetInput } from "@camp404/types";
import { getAuthenticatedUser } from "@/lib/auth";
import { proofBytesToStore, proofExtension } from "@/lib/payment-proof";
import { petPhotoFolder } from "@/lib/pet-photos";
import { addPet } from "@/lib/pets";
import {
  PET_NEEDS_FRONT,
  PET_NEEDS_SIDE,
  PET_PHOTO_TYPES,
  PET_PHOTOS_MAX_BYTES,
  PETS_PATH,
} from "@/lib/pets-copy";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";

// A member sends in their pet (Camp pets, owner 2026-10-09): its name, what it
// is, one stupid thing, and a photo from the front and one from the side, in
// one request. The browser cuts each photo to a square first (the crop step);
// here each is checked by its first bytes (a JPEG, PNG or WebP, never anything
// that could run), its EXIF (GPS position, time) is stripped, and it is stored
// as a PRIVATE blob in the member's own folder, `pets/<member id>/`. The
// photos are only for the captains to draw the pet from: the blobs' addresses
// never leave the server, and /api/pet-photo streams each to the member and
// the captains only.

function refuse(error: string, status: number, field?: string) {
  return NextResponse.json({ error, field }, { status });
}

/** An image the photo slot may carry: never a PDF. */
function photoExtension(type: string): string | null {
  return type.startsWith("image/") ? proofExtension(type) : null;
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return refuse("Sign in again, then send it.", 401);
  const campUser = await ensureCampUser(user);
  if (
    !hasCampAccess(campUser, user.primaryEmail) ||
    !isApproved(campUser, user.primaryEmail)
  ) {
    return refuse("Your account isn't approved yet.", 403);
  }

  const limit = await rateLimiter.limit(`pet-upload:${user.id}`, {
    limit: 10,
  });
  const ipLimit = await rateLimiter.limit(
    `pet-upload-ip:${getClientIp(req.headers)}`,
    { limit: 30 },
  );
  if (!limit.ok || !ipLimit.ok) {
    return refuse(
      "Too many pets at once. Wait a few minutes and try again.",
      429,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("That didn't arrive. Try again.", 400);
  }

  const parsed = PetInput.safeParse({
    name: form.get("name") ?? "",
    kind: form.get("kind") ?? "",
    kindOther: form.get("kindOther") ?? "",
    stupidThing: form.get("stupidThing") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return refuse(
      issue?.message ?? "Check the form.",
      400,
      issue ? String(issue.path[0] ?? "") : undefined,
    );
  }

  const front = form.get("front");
  const side = form.get("side");
  if (!(front instanceof File) || front.size === 0) {
    return refuse(PET_NEEDS_FRONT, 400, "front");
  }
  if (!(side instanceof File) || side.size === 0) {
    return refuse(PET_NEEDS_SIDE, 400, "side");
  }
  if (front.size + side.size > PET_PHOTOS_MAX_BYTES) {
    return refuse("The photos come to over 4 MB. Send smaller ones.", 413);
  }
  const checked: {
    key: "front" | "side";
    bytes: Uint8Array;
    type: string;
    ext: string;
  }[] = [];
  for (const [key, file] of [
    ["front", front],
    ["side", side],
  ] as const) {
    const ext = photoExtension(file.type);
    if (!ext) return refuse(PET_PHOTO_TYPES, 415, key);
    const bytes = proofBytesToStore(
      file.type,
      new Uint8Array(await file.arrayBuffer()),
    );
    if (!bytes) return refuse(PET_PHOTO_TYPES, 415, key);
    checked.push({ key, bytes, type: file.type, ext });
  }

  const folder = petPhotoFolder(campUser.id);
  const stored: Record<"front" | "side", string> = { front: "", side: "" };
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (isE2ETestMode()) {
    // E2E only: no blob store, stand-in names the photo route knows.
    for (const file of checked) {
      stored[file.key] = `${folder}test-${file.key}.${file.ext}`;
    }
  } else {
    if (!token) {
      return refuse("Photo uploads aren't set up on this site yet.", 501);
    }
    try {
      for (const file of checked) {
        const blob = await put(
          `${folder}${file.key}.${file.ext}`,
          Buffer.from(file.bytes),
          {
            access: "private",
            addRandomSuffix: true,
            contentType: file.type,
            token,
          },
        );
        stored[file.key] = blob.pathname;
      }
    } catch (err) {
      console.error("pet upload error", errorLogText(err, process.env));
      await removeStored(stored, token);
      return refuse("The upload failed. Try again.", 502);
    }
  }

  let result: Awaited<ReturnType<typeof addPet>>;
  try {
    result = await addPet({
      ...parsed.data,
      ownerId: campUser.id,
      frontPhotoPath: stored.front,
      sidePhotoPath: stored.side,
    });
  } catch (err) {
    console.error("pet record error", errorLogText(err, process.env));
    if (!isE2ETestMode()) await removeStored(stored, token);
    return refuse("Something went wrong. Try again.", 500);
  }
  if (!result.ok) {
    // No pet points at the photos, so nothing could ever show or delete them.
    if (!isE2ETestMode()) await removeStored(stored, token);
    return refuse(result.error, 400);
  }
  revalidatePath(PETS_PATH);
  return NextResponse.json({ id: result.id });
}

/** Best effort: a photo no pet points at is deleted again. */
async function removeStored(
  stored: Record<"front" | "side", string>,
  token: string | undefined,
): Promise<void> {
  const paths = [stored.front, stored.side].filter(Boolean);
  if (paths.length === 0 || !token) return;
  await del(paths, { token }).catch((cleanupErr: unknown) =>
    console.error(
      "pet upload cleanup error",
      errorLogText(cleanupErr, process.env),
    ),
  );
}
