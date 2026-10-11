import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { errorLogText, mayReadPetPhoto } from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import { proofExtension } from "@/lib/payment-proof";
import { getPetPhoto, isPetReviewer } from "@/lib/pets";
import { isE2ETestMode } from "@/lib/test-mode";
import { findCampUserByAuthId, hasCampAccess, isApproved } from "@/lib/users";

const E2E_STAND_IN_PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOoyOuBIwbiOABYUhchIurzLwAAAABJRU5ErkJggg==",
  "base64",
);

export const runtime = "nodejs";

// Stream one of a pet's photos (Camp pets, owner 2026-10-09) to the member who
// sent it and to the captains, and to nobody else, whoever holds the link and
// whether or not the pet is in: the photos are only for a captain to draw the
// pet from. Anyone else gets the same 404 as a pet with no photo, so the
// address says nothing. A photo opens under a sandbox, so nothing in it runs.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ petId: string; side: string }> },
) {
  const { petId, side } = await params;
  if (side !== "front" && side !== "side") {
    return new NextResponse("Not found", { status: 404 });
  }
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
  const photo = await getPetPhoto(petId, side);
  if (
    !photo ||
    !mayReadPetPhoto({
      viewerId: campUser.id,
      ownerId: photo.ownerId,
      isCaptain: isPetReviewer(campUser),
    })
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dot = photo.pathname.lastIndexOf(".");
  const type =
    { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[
      photo.pathname.slice(dot + 1).split(/[^a-z]/)[0] ?? ""
    ] ?? null;
  if (!type || !proofExtension(type)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const headers = {
    "Content-Type": type,
    "Content-Disposition": `inline; filename="${side}.${proofExtension(type)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };

  if (isE2ETestMode()) {
    // E2E only: no blob store. A stand-in picture (a flat 4x4 PNG) so access
    // can be tested and the card draws a photo, not its alt text.
    return new NextResponse(new Uint8Array(E2E_STAND_IN_PHOTO), {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Not found", { status: 404 });
  try {
    const result = await get(photo.pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(result.stream, { headers });
  } catch (err) {
    console.error("pet-photo read error", errorLogText(err, process.env));
    return new NextResponse("Not found", { status: 404 });
  }
}
