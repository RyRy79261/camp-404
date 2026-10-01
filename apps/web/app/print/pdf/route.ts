import { NextResponse, type NextRequest } from "next/server";
import { captainActionGate } from "@/lib/captain-gate";
import {
  mayRenderHost,
  parseCookieHeader,
  pdfFileName,
  printPagePath,
} from "@/lib/print";
import { renderPrintPdf } from "@/lib/print-pdf";
import { rateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold Chromium unpacks and starts in a few seconds; the page then loads
// as the member. Its own limit keeps it in a function of its own on Vercel.
export const maxDuration = 60;

// "Download PDF" on every print page (#249; the owner's ruling 2026-09-30:
// a real PDF file, not the browser's print dialog). GET /print/pdf?from=
// /print/...&name=Title opens that print page as the member who asked and
// returns it as an A4 PDF (lib/print-pdf.ts). The page's own gate decides what
// is in it, exactly as on screen; this route only checks that the member is
// signed in and approved before it starts a browser, limits how often, and
// opens nothing but a print page on this site.

/** Ten files a minute per member: a sheet takes a few seconds to make. */
const LIMIT = { limit: 10, windowMs: 60_000 };

function text(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const gate = await captainActionGate("camp_member");
  if (!gate.ok) return text(gate.error, 401);

  const path = printPagePath(request.nextUrl.searchParams.get("from"));
  if (!path) return text("That page cannot be made into a PDF.", 400);

  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (
    !mayRenderHost(host, {
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
      branchUrl: process.env.VERCEL_BRANCH_URL,
      productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    })
  ) {
    return text("That page cannot be made into a PDF.", 400);
  }

  const verdict = await rateLimiter.limit(
    `print-pdf:${gate.campUser.id}`,
    LIMIT,
  );
  if (!verdict.ok) {
    return text(
      `Too many PDFs at once. Try again in ${verdict.retryAfterSeconds} seconds.`,
      429,
    );
  }

  const protocol = request.nextUrl.protocol || "https:";
  const result = await renderPrintPdf({
    origin: `${protocol}//${host}`,
    path,
    cookies: parseCookieHeader(request.headers.get("cookie")),
  });
  if (!result.ok) {
    return result.reason === "refused"
      ? text("You cannot print that page.", 403)
      : text("The PDF could not be made. Try again.", 502);
  }

  const name = pdfFileName(request.nextUrl.searchParams.get("name"));
  return new NextResponse(Buffer.from(result.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
