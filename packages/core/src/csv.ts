// CSV serialisation — the generic half. Knows nothing about questionnaires,
// rosters, or any Camp 404 domain type; it turns a rectangle of scalars into
// the byte sequence Excel, Numbers and Sheets all read back correctly.
//
// This module exists so there is exactly ONE of it. The questionnaire export
// (./questionnaire-csv) is the first consumer; WP9's roster CSV is the second,
// and it must import `escapeCsvCell`/`toCsvFile` from here rather than grow a
// second copy that drifts on the four details below.
//
// Four things are non-negotiable, because getting any one wrong makes the file
// silently wrong rather than obviously broken:
//
//  1. A UTF-8 BOM. Excel on Windows guesses the encoding of a BOM-less CSV from
//     the system code page, so a member called "Zoë" arrives as "ZoÃ«". The BOM
//     is three bytes that remove the guess.
//  2. CRLF line terminators. RFC 4180 says so, and a bare LF splits rows
//     unpredictably in older Excel.
//  3. Quote doubling. A cell containing `"` is quoted and every inner quote is
//     written twice; anything else corrupts every following column.
//  4. Formula neutralisation — see `escapeCsvCell`.

/**
 * UTF-8 byte-order mark. Prepended by `toCsvFile`; exported so a caller
 * streaming a file in pieces can emit it itself.
 */
export const CSV_BOM = "\uFEFF";

/** RFC 4180 line terminator. */
export const CSV_EOL = "\r\n";

/** MIME type for a CSV download, with the charset spelled out. */
export const CSV_MIME = "text/csv;charset=utf-8";

/** What a cell may hold before it is stringified. */
export type CsvCell = string | number | boolean | null | undefined;

// A cell whose first character is one of these is read as a formula by Excel,
// Sheets and Numbers. A member can type `=HYPERLINK("http://evil","Click")`
// into a long-text answer and it becomes live the moment a captain opens the
// export — the classic CSV injection.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

// ...except a plain number, which legitimately starts with `-`. `-3` is a
// slider answer, not an attack, and prefixing it would break every numeric
// column in the sheet. Anything with a sign, digits and at most one decimal
// point is left alone.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

// Quote when the cell holds a delimiter, a quote, a newline, or leading/
// trailing whitespace (which some readers strip, changing the value).
const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;

/**
 * Neutralise a spreadsheet formula lead by prefixing a single apostrophe.
 *
 * **The choice made here: yes, neutralise.** These exports carry free text a
 * member typed, and a captain opens them in a desktop spreadsheet — the exact
 * shape CSV injection needs. The cost is visible: the apostrophe is part of the
 * imported text (Excel's "leading quote means text" convention applies to typed
 * input, not to imported cells), so `=SUM(A1)` reads back as `'=SUM(A1)`. That
 * is the right trade for this data — an answer that looks like a formula is
 * vanishingly rare, and a live formula in a member's answer is never wanted.
 *
 * Exported so a caller can explain the apostrophe to a reader, and so the
 * decision is testable on its own.
 */
export function neutraliseFormula(value: string): string {
  if (!FORMULA_LEAD.test(value)) return value;
  if (PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}

/**
 * Render one cell: stringify, neutralise a formula lead, then quote and double
 * inner quotes if the content needs it.
 *
 * `null`/`undefined` become an empty cell — distinct from the em dash the
 * questionnaire layer writes for "asked, not answered", which is a fact about
 * the data rather than an absent column.
 */
export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const raw = neutraliseFormula(String(value));
  if (!NEEDS_QUOTING.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/** One row of already-escaped cells, comma joined. */
export function toCsvRow(cells: readonly CsvCell[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Serialise a rectangle of cells to CSV text — CRLF terminated, no BOM.
 * A trailing terminator is written after the last row so appending is safe.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  if (rows.length === 0) return "";
  return rows.map(toCsvRow).join(CSV_EOL) + CSV_EOL;
}

/**
 * Serialise a rectangle of cells to the exact string that should be written to
 * a `.csv` file or handed to a `Blob` — i.e. `toCsv` behind a UTF-8 BOM.
 *
 * Use this, not `toCsv`, for anything a human downloads.
 */
export function toCsvFile(rows: readonly (readonly CsvCell[])[]): string {
  return CSV_BOM + toCsv(rows);
}

/**
 * Make a filesystem-safe filename fragment out of arbitrary text: lowercase,
 * non-alphanumerics collapsed to single hyphens, trimmed. Empty input yields
 * `"export"` so a filename is never a bare extension.
 */
export function csvFilenamePart(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "export";
}
