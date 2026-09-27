import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { MoneyRefused } from "@camp404/db/dues";
import { PaymentProofInput } from "@camp404/types";
import { getAuthenticatedUser } from "@/lib/auth";
import { revalidateDues } from "@/lib/dues-revalidate";
import { PROOF_MAX_BYTES } from "@/lib/dues-copy";
import {
  proofBytesMatch,
  proofExtension,
  proofFolder,
} from "@/lib/payment-proof";
import { recordPayment } from "@/lib/payments";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";

// A member's proof of payment (#240): the file and what they say they paid,
// in one request. The file is checked by its first bytes (a PDF, JPEG, PNG or
// WebP, never anything that could run), stored as a PRIVATE blob in the
// member's own folder, and the payment lands on the ledger as pending for the
// Finance team to check against the bank. The blob's address never leaves the
// server; /api/payment-proof/<payment id> streams it to the member and the
// Finance team only. Never a card number: the app records what arrived.

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

  const limit = await rateLimiter.limit(`payment-proof:${user.id}`, {
    limit: 20,
  });
  const ipLimit = await rateLimiter.limit(
    `payment-proof-ip:${getClientIp(req.headers)}`,
    { limit: 40 },
  );
  if (!limit.ok || !ipLimit.ok) {
    return refuse("Too many uploads. Wait a few minutes and try again.", 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("That didn't arrive. Try again.", 400);
  }
  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return refuse("Add your proof of payment: a photo or a PDF.", 400);
  }
  const ext = proofExtension(file.type);
  if (!ext) {
    return refuse("The proof must be a PDF or a JPG, PNG or WebP photo.", 415);
  }
  if (file.size > PROOF_MAX_BYTES) {
    return refuse("That file is over 4 MB. Send a smaller photo or PDF.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!proofBytesMatch(file.type, bytes.subarray(0, 16))) {
    return refuse("The proof must be a PDF or a JPG, PNG or WebP photo.", 415);
  }

  const parsed = PaymentProofInput.safeParse({
    amountCents: Number(form.get("amountCents")),
    paidOn: form.get("paidOn"),
    method: form.get("method"),
    note: form.get("note") ?? null,
  });
  if (!parsed.success) {
    return refuse(parsed.error.issues[0]?.message ?? "Check the form.", 400);
  }

  let pathname: string;
  if (isE2ETestMode()) {
    // E2E only: no blob store, a stand-in name the proof route knows.
    pathname = `${proofFolder(campUser.id)}test-proof.${ext}`;
  } else {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return refuse("File uploads aren't set up on this site yet.", 501);
    }
    try {
      const blob = await put(
        `${proofFolder(campUser.id)}proof.${ext}`,
        Buffer.from(bytes),
        {
          access: "private",
          addRandomSuffix: true,
          contentType: file.type,
          token,
        },
      );
      pathname = blob.pathname;
    } catch (err) {
      console.error("payment-proof upload error", err);
      return refuse("The upload failed. Try again.", 502);
    }
  }

  try {
    const { reference } = await recordPayment({
      userId: campUser.id,
      amountCents: parsed.data.amountCents,
      currency: "ZAR",
      status: "pending",
      note: parsed.data.note,
      recordedByUserId: campUser.id,
      source: "member",
      method: parsed.data.method,
      paidOn: parsed.data.paidOn,
      proofPathname: pathname,
      proofContentType: file.type,
    });
    revalidateDues();
    return NextResponse.json({ reference });
  } catch (err) {
    if (err instanceof MoneyRefused) return refuse(err.sentence, 403);
    console.error("payment-proof record error", err);
    return refuse("Something went wrong. Try again.", 500);
  }
}
