import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { auditReadAfterResponse } from "@/lib/audit";
import { getClaimFile } from "@/lib/claims";
import { moneyActionGate } from "@/lib/money-gate";
import { proofExtension } from "@/lib/payment-proof";
import { isE2ETestMode } from "@/lib/test-mode";
import { findCampUserByAuthId, hasCampAccess, isApproved } from "@/lib/users";

export const runtime = "nodejs";

// Stream one of a claim's receipts (#242) to the member who claimed and to the
// Finance team (captains and Finance leads), and to nobody else, whoever holds
// the link: not the lead who approves the claim (owner, 2026-09-30: a claim's
// detail is Finance's and the claimant's). Every read by someone other than
// the member is recorded in the audit log after the response. A photo opens
// in the browser under a sandbox; a PDF downloads, so nothing in it runs on
// this site.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
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
  const file = await getClaimFile(fileId);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const own = file.submitterId === campUser.id;
  if (!own) {
    const gate = await moneyActionGate();
    if (!gate.ok) return new NextResponse("Forbidden", { status: 403 });
    auditReadAfterResponse({
      actorId: campUser.id,
      action: "reimbursement.receipt_viewed",
      target: file.submitterId,
      metadata: { reimbursementId: file.claimId, team: file.team },
    });
  }

  const ext = proofExtension(file.contentType);
  if (!ext) return new NextResponse("Not found", { status: 404 });
  const headers = {
    "Content-Type": file.contentType,
    "Content-Disposition": `${ext === "pdf" ? "attachment" : "inline"}; filename="receipt.${ext}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };

  if (isE2ETestMode()) {
    // E2E only: no blob store; a stand-in body so access can be tested.
    return new NextResponse("test receipt", { headers });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Not found", { status: 404 });
  try {
    const result = await get(file.pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(result.stream, { headers });
  } catch (err) {
    console.error("claim-receipt read error", err);
    return new NextResponse("Not found", { status: 404 });
  }
}
