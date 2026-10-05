// The printable pages (#249): the paths, the file name and the checks the
// PDF route and the shell share. A plain module, so the client buttons and
// the server route read the same rules; pure, so the rules are unit-tested.
//
// Every print is a page under /print/... drawn by the shared shell
// (components/print/print-sheet.tsx). "Download PDF" asks /print/pdf for a
// file of the page the member is on: the server opens that same page in a
// headless Chromium, with the member's own cookies, and saves it as a PDF. So
// the file is the print view itself, with the same permission gate, and there
// is no second layout to keep in step.

/** Where the PDF of a print page is made. */
export const PRINT_PDF_PATH = "/print/pdf";

/** Every print page lives under this. */
export const PRINT_ROOT = "/print/";

/**
 * Whether a path is a print page. The app-wide gates (notices, the report
 * dialog) stay quiet there: the PDF maker's headless browser opens these
 * pages as the member.
 */
export function isPrintPath(pathname: string | null): boolean {
  return pathname === "/print" || !!pathname?.startsWith(PRINT_ROOT);
}

/**
 * The attribute the shell sets on the sheet. The PDF route makes a file only
 * when the page it opened has one, so a refusal or an error page never comes
 * back as a PDF.
 */
export const PRINT_SHEET_ATTR = "data-print-sheet";

/** The longest print address the route accepts, query included. */
const MAX_PATH = 600;

/**
 * The print page a PDF may be made of, as a path and query on this site, or
 * null. Only a page under /print/ (never the PDF route itself), only on this
 * origin: no other host, no protocol-relative address, no backslash.
 */
export function printPagePath(from: string | null): string | null {
  if (!from || from.length > MAX_PATH) return null;
  if (!from.startsWith(PRINT_ROOT) || from.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(from, "http://print.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://print.invalid") return null;
  const path = url.pathname;
  if (!path.startsWith(PRINT_ROOT)) return null;
  if (path === PRINT_PDF_PATH || path.startsWith(`${PRINT_PDF_PATH}/`)) {
    return null;
  }
  // A path that leaves /print/ once resolved ("/print/../captains") is
  // caught above, as URL resolves the dots.
  return `${path}${url.search}`;
}

/**
 * The file's name: "camp-404-" and the sheet's title in lower-case words,
 * ".pdf". Only letters, digits and dashes reach the header.
 */
export function pdfFileName(title: string | null): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `camp-404-${slug || "print"}.pdf`;
}

/** The address that makes a PDF of the print page at `pathAndQuery`. */
export function pdfHref(pathAndQuery: string, title: string): string {
  const params = new URLSearchParams({ from: pathAndQuery, name: title });
  return `${PRINT_PDF_PATH}?${params.toString()}`;
}

/**
 * Whether the PDF route may open pages on `host` (host and port). The route
 * forwards the member's cookies to the page it opens, so it opens only this
 * site: on Vercel, this deployment's own addresses and the camp's domain; off
 * Vercel, the machine itself.
 */
export function mayRenderHost(
  host: string,
  env: {
    vercelEnv?: string;
    vercelUrl?: string;
    branchUrl?: string;
    productionUrl?: string;
  },
): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (env.vercelEnv?.trim()) {
    const allowed = [
      env.vercelUrl,
      env.branchUrl,
      env.productionUrl,
      "camp-404.com",
      "www.camp-404.com",
    ]
      .map((a) => a?.trim().toLowerCase())
      .filter((a): a is string => !!a);
    return allowed.includes(h);
  }
  const name = h.startsWith("[")
    ? h.slice(0, h.indexOf("]") + 1)
    : h.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/** Parse a Cookie header into name and value pairs, for the page the route opens. */
export function parseCookieHeader(
  header: string | null,
): { name: string; value: string }[] {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return null;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      return name ? { name, value } : null;
    })
    .filter((c): c is { name: string; value: string } => c !== null);
}

/** The sheet's table style: thin black rules that print clearly. */
export const SHEET_TABLE =
  "w-full border-collapse text-sm [&_td]:border [&_td]:border-neutral-400 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-neutral-700 [&_th]:bg-neutral-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold";

/**
 * The plate count a recipe card prints at (#249). Food does not scale by
 * multiplying, so a card prints only a count the recipe has a checked result
 * for (a row in recipe_plate_counts: the version's own count, or one Claude
 * proofread). No count asked: the version's own. A count asked that has no
 * result, or that is not a whole number from 1 to `max`, is refused, never
 * worked out.
 */
export function recipeCardPlates(
  asked: string | string[] | undefined,
  verified: readonly number[],
  own: number,
  max: number,
): { ok: true; plates: number } | { ok: false; asked: string } {
  const raw = Array.isArray(asked) ? asked[0] : asked;
  if (raw === undefined || raw === "") {
    return verified.includes(own)
      ? { ok: true, plates: own }
      : { ok: false, asked: String(own) };
  }
  if (!/^\d{1,4}$/.test(raw)) return { ok: false, asked: raw.slice(0, 12) };
  const plates = Number(raw);
  if (plates < 1 || plates > max || !verified.includes(plates)) {
    return { ok: false, asked: String(plates) };
  }
  return { ok: true, plates };
}
