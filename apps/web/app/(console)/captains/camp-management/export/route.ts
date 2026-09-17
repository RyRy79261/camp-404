import { captainPageGate } from "@/lib/captain-gate";
import { buildMemberExport } from "@/lib/member-export";

// The member export download. Every approved member may take it: the member
// ladder redirects anyone who isn't one, and the file holds only the columns
// the viewer's rank may read (lib/member-export.ts). The bar is below captain,
// so the viewer's rank here includes the real team-lead flag. The file names
// people, so it is never cached.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { campUser, rank } = await captainPageGate("camp_member");
  const file = await buildMemberExport({ userId: campUser.id, rank });
  return new Response(file.content, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
