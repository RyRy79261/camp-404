import { loadResults } from "../../metrics/results-data";
import { responsesCsv } from "../csv-export";

// The responses CSV, built only when a captain asks for it (§7.3). It goes
// through the same loadResults gate as the pages: sign-in, camp access and
// approval redirect, a non-captain gets no data, and an unknown questionnaire
// is a 404. Answers carry names, so the file is never cached.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  const cycle = new URL(request.url).searchParams.get("cycle") ?? undefined;
  const access = await loadResults(key, cycle);

  if (!access.ok) {
    return new Response(
      access.reason === "locked"
        ? "Captain access only."
        : "This questionnaire has never been published, so it has no answers.",
      {
        status: access.reason === "locked" ? 403 : 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const csv = responsesCsv(access.view);
  return new Response(csv.content, {
    headers: {
      "Content-Type": csv.mimeType,
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
