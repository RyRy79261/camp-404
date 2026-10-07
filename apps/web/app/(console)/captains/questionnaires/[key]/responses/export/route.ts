import { appendAuditEvents } from "@camp404/db/audit";
import { errorLogText } from "@camp404/core";
import { usesTestStore } from "@/lib/test-mode";
import {
  allergyReadEvents,
  loadResults,
  respondentsOf,
} from "../../metrics/results-data";
import { responsesCsv } from "../csv-export";

// The responses CSV, built only when a captain asks for it (§7.3). It goes
// through the same loadResults gate as the pages: sign-in, camp access and
// approval redirect, a non-captain gets no data, and an unknown questionnaire
// is a 404. Answers carry names, so the file is never cached.
//
// A file that leaves the app cannot be unread, so, like the member export, the
// allergy reads it holds are recorded BEFORE it is made, and when that write
// fails there is no file.

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

  const view = access.view;
  if (!usesTestStore()) {
    try {
      await appendAuditEvents(
        allergyReadEvents(view, respondentsOf(view), "questionnaire_csv"),
      );
    } catch (err) {
      console.error(
        "[questionnaire-csv] the allergy reads were not recorded, so no file",
        errorLogText(err, process.env),
      );
      return new Response(
        "The download could not be recorded, so it was not made. Try again.",
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  }

  const csv = responsesCsv(view);
  return new Response(csv.content, {
    headers: {
      "Content-Type": csv.mimeType,
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
