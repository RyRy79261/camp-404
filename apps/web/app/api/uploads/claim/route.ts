import { errorLogText } from "@camp404/core";
import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { CLAIM_MAX_FILES, ClaimInput } from "@camp404/types";
import { getAuthenticatedUser } from "@/lib/auth";
import { claimReceiptFolder } from "@/lib/claim-receipts";
import { submitClaim } from "@/lib/claims";
import { revalidateClaims } from "@/lib/claims-revalidate";
import { PROOF_MAX_BYTES } from "@/lib/dues-copy";
import { proofBytesToStore, proofExtension } from "@/lib/payment-proof";
import { ledgerCycle } from "@/lib/payments";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";

// A member's claim for money they spent for a team (#242): what it was for,
// the amount, the day, their bank account and ONE OR MORE receipts, in one
// request (refused with none). Each file is checked by its first bytes (a
// PDF, JPEG, PNG or WebP, never anything that could run) and stored as a
// PRIVATE blob in the member's own folder, like proof of payment. The blobs'
// addresses never leave the server; /api/claim-receipt/<file id> streams each
// to the member and the Finance team only. The bank details are encrypted
// before they are stored (lib/claims.ts). A photo's EXIF (GPS position, time)
// is stripped before it is stored. The files together stay under 4 MB: that
// is what one request to the site may carry, so the receipt picker shrinks
// each photo in the browser first (lib/image.ts).

const TYPES_SENTENCE = "Receipts must be PDFs or JPG, PNG or WebP photos.";

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
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

  const limit = await rateLimiter.limit(`claim-upload:${user.id}`, {
    limit: 20,
  });
  const ipLimit = await rateLimiter.limit(
    `claim-upload-ip:${getClientIp(req.headers)}`,
    { limit: 40 },
  );
  if (!limit.ok || !ipLimit.ok) {
    return refuse("Too many claims. Wait a few minutes and try again.", 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("That didn't arrive. Try again.", 400);
  }

  const parsed = ClaimInput.safeParse({
    team: form.get("team"),
    description: form.get("description"),
    amountCents: Number(form.get("amountCents")),
    spentOn: form.get("spentOn"),
    accountType: form.get("accountType"),
    accountDetails: form.get("accountDetails"),
  });
  if (!parsed.success) {
    return refuse(parsed.error.issues[0]?.message ?? "Check the form.", 400);
  }

  const files = form
    .getAll("receipt")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return refuse("Add at least one receipt: a photo or a PDF.", 400);
  }
  if (files.length > CLAIM_MAX_FILES) {
    return refuse(`Add at most ${CLAIM_MAX_FILES} files to one claim.`, 400);
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > PROOF_MAX_BYTES) {
    return refuse(
      "The receipts come to over 4 MB. Send smaller photos or PDFs.",
      413,
    );
  }
  const checked: { bytes: Uint8Array; type: string; ext: string }[] = [];
  for (const file of files) {
    const ext = proofExtension(file.type);
    if (!ext) return refuse(TYPES_SENTENCE, 415);
    const bytes = proofBytesToStore(
      file.type,
      new Uint8Array(await file.arrayBuffer()),
    );
    if (!bytes) return refuse(TYPES_SENTENCE, 415);
    checked.push({ bytes, type: file.type, ext });
  }

  const folder = claimReceiptFolder(campUser.id);
  const stored: { pathname: string; contentType: string }[] = [];
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (isE2ETestMode()) {
    // E2E only: no blob store, stand-in names the receipt route knows.
    checked.forEach((file, i) =>
      stored.push({
        pathname: `${folder}test-receipt-${i + 1}.${file.ext}`,
        contentType: file.type,
      }),
    );
  } else {
    if (!token) {
      return refuse("File uploads aren't set up on this site yet.", 501);
    }
    try {
      for (const file of checked) {
        const blob = await put(
          `${folder}receipt.${file.ext}`,
          Buffer.from(file.bytes),
          {
            access: "private",
            addRandomSuffix: true,
            contentType: file.type,
            token,
          },
        );
        stored.push({ pathname: blob.pathname, contentType: file.type });
      }
    } catch (err) {
      console.error("claim upload error", err);
      await removeStored(stored, token);
      return refuse("The upload failed. Try again.", 502);
    }
  }

  let result: Awaited<ReturnType<typeof submitClaim>>;
  try {
    result = await submitClaim({
      submitterId: campUser.id,
      cycle: await ledgerCycle(),
      ...parsed.data,
      files: stored,
    });
  } catch (err) {
    console.error("claim record error", errorLogText(err, process.env));
    if (!isE2ETestMode()) await removeStored(stored, token);
    return refuse("Something went wrong. Try again.", 500);
  }
  if (!result.ok) {
    // No claim points at the files, so nothing could ever show or delete
    // them: take them back out of the member's folder.
    if (!isE2ETestMode()) await removeStored(stored, token);
    return refuse(result.error, 400);
  }
  revalidateClaims();
  return NextResponse.json({ id: result.id });
}

/** Best effort: a file no claim points at is deleted again. */
async function removeStored(
  stored: readonly { pathname: string }[],
  token: string | undefined,
): Promise<void> {
  if (stored.length === 0 || !token) return;
  await del(
    stored.map((s) => s.pathname),
    { token },
  ).catch((cleanupErr: unknown) =>
    console.error("claim upload cleanup error", cleanupErr),
  );
}
