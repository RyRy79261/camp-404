import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditReadAfterResponse } from "@/lib/audit";
import { getPaymentProof } from "@/lib/dues";
import { moneyActionGate } from "@/lib/money-gate";
import { proofExtension } from "@/lib/payment-proof";
import { isE2ETestMode } from "@/lib/test-mode";
import { findCampUserByAuthId, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";

// Stream one payment's proof file (#240) to the member who sent it and to the
// Finance team (captains and Finance leads), and to nobody else, whoever holds
// the link. Every read by someone other than the member is recorded in the
// audit log after the response. A photo opens in the browser under a sandbox;
// a PDF downloads, so nothing in it runs on this site.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const campUser = await findCampUserByAuthId(user.id);
  if (
    !campUser ||
    !hasCampAccess(campUser, user.primaryEmail) ||
    !isApproved(campUser, user.primaryEmail)
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const proof = await getPaymentProof(paymentId);
  if (!proof) return new NextResponse("Not found", { status: 404 });

  const own = proof.userId === campUser.id;
  if (!own) {
    const gate = await moneyActionGate();
    if (!gate.ok) return new NextResponse("Forbidden", { status: 403 });
    auditReadAfterResponse({
      actorId: campUser.id,
      action: "payment.proof_viewed",
      target: proof.userId,
      metadata: { reference: proof.reference },
    });
  }

  const ext = proofExtension(proof.contentType);
  if (!ext) return new NextResponse("Not found", { status: 404 });
  const headers = {
    "Content-Type": proof.contentType,
    "Content-Disposition": `${ext === "pdf" ? "attachment" : "inline"}; filename="proof-${proof.reference}.${ext}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };

  if (isE2ETestMode()) {
    // E2E only: no blob store; a stand-in body so access can be tested.
    return new NextResponse("test proof", { headers });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Not found", { status: 404 });
  try {
    const result = await get(proof.pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(result.stream, { headers });
  } catch (err) {
    console.error("payment-proof read error", err);
    return new NextResponse("Not found", { status: 404 });
  }
}
