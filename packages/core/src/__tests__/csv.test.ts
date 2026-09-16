import { describe, expect, it } from "vitest";

import {
  CSV_BOM,
  CSV_EOL,
  csvFilenamePart,
  escapeCsvCell,
  neutraliseFormula,
  toCsv,
  toCsvFile,
  toCsvRow,
} from "../csv";

describe("escapeCsvCell", () => {
  it("leaves an ordinary cell alone", () => {
    expect(escapeCsvCell("Dusty Rhodes")).toBe("Dusty Rhodes");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("quotes a cell containing a comma", () => {
    expect(escapeCsvCell("Rhodes, Dusty")).toBe('"Rhodes, Dusty"');
  });

  it("quotes and DOUBLES an inner quote", () => {
    // The single detail that corrupts every following column if missed.
    expect(escapeCsvCell('He said "no"')).toBe('"He said ""no"""');
  });

  it("quotes a cell containing a newline, keeping the newline intact", () => {
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("quotes a cell with leading or trailing whitespace", () => {
    // Readers that strip unquoted padding would otherwise change the value.
    expect(escapeCsvCell("  padded")).toBe('"  padded"');
    expect(escapeCsvCell("padded  ")).toBe('"padded  "');
  });

  it("writes null and undefined as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("keeps a non-ASCII name verbatim", () => {
    expect(escapeCsvCell("Zoë Naudé")).toBe("Zoë Naudé");
  });
});

describe("neutraliseFormula", () => {
  // The decision: we DO neutralise, by prefixing a single apostrophe. Members
  // type free text, captains open the file in a desktop spreadsheet, so a live
  // `=HYPERLINK(...)` in an answer is a real (if small) hazard. The cost is a
  // visible apostrophe on the rare answer that genuinely starts with `=`.
  it.each(["=", "+", "@", "\t", "\r"])(
    "prefixes an apostrophe on a cell starting with %j",
    (lead) => {
      expect(neutraliseFormula(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
    },
  );

  it("neutralises a leading = in a stored answer", () => {
    expect(neutraliseFormula("=1+1")).toBe("'=1+1");
  });

  it("does NOT touch a negative number", () => {
    // `-3` is a slider answer, not an attack; prefixing would break the column.
    expect(neutraliseFormula("-3")).toBe("-3");
    expect(neutraliseFormula("-3.5")).toBe("-3.5");
  });

  it("does neutralise a leading dash that is not a number", () => {
    expect(neutraliseFormula("-cmd|'/c calc'!A0")).toBe("'-cmd|'/c calc'!A0");
  });

  it("leaves an interior = alone", () => {
    expect(neutraliseFormula("x = y")).toBe("x = y");
  });
});

describe("escapeCsvCell + formula neutralisation together", () => {
  it("neutralises then quotes when the neutralised cell still needs quoting", () => {
    expect(escapeCsvCell('=CONCAT("a","b")')).toBe(
      '"\'=CONCAT(""a"",""b"")"',
    );
  });

  it("neutralises without quoting when nothing else demands quotes", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
  });
});

describe("toCsvRow / toCsv", () => {
  it("joins cells with commas", () => {
    expect(toCsvRow(["a", "b", 1])).toBe("a,b,1");
  });

  it("terminates every row with CRLF, including the last", () => {
    expect(toCsv([["a"], ["b"]])).toBe(`a${CSV_EOL}b${CSV_EOL}`);
    expect(CSV_EOL).toBe("\r\n");
  });

  it("never emits a bare LF as a terminator", () => {
    const csv = toCsv([
      ["one", "two"],
      ["three", "four"],
    ]);
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("returns an empty string for no rows at all", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("toCsvFile", () => {
  it("starts with the UTF-8 BOM", () => {
    const file = toCsvFile([["Member"], ["Zoë"]]);
    expect(file.startsWith(CSV_BOM)).toBe(true);
    expect(file.codePointAt(0)).toBe(0xfeff);
  });

  it("uses U+FEFF, which is the EF BB BF Excel looks for", () => {
    // The three bytes are what Excel reads to skip the code-page guess; core
    // has no @types/node (deliberately, so it stays runtime-neutral), so this
    // pins the code point rather than encoding it.
    expect(CSV_BOM).toBe("\uFEFF");
    expect(CSV_BOM).toHaveLength(1);
  });

  it("emits exactly one BOM, at the front", () => {
    const file = toCsvFile([["a"], ["b"], ["c"]]);
    expect(file.split(CSV_BOM).length - 1).toBe(1);
  });
});

describe("csvFilenamePart", () => {
  it("slugifies", () => {
    expect(csvFilenamePart("Camp Sign-Up 2026!")).toBe("camp-sign-up-2026");
  });

  it("falls back rather than yielding an empty fragment", () => {
    expect(csvFilenamePart("!!!")).toBe("export");
    expect(csvFilenamePart("")).toBe("export");
  });
});
