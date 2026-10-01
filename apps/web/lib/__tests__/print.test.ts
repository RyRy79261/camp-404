import { describe, expect, it } from "vitest";
import {
  mayRenderHost,
  parseCookieHeader,
  pdfFileName,
  pdfHref,
  printPagePath,
  recipeCardPlates,
} from "../print";

// The rules the PDF route and the print buttons share (#249).

describe("printPagePath", () => {
  it("keeps a print page's path and query", () => {
    expect(printPagePath("/print/power/grid")).toBe("/print/power/grid");
    expect(printPagePath("/print/lounge?day=2")).toBe("/print/lounge?day=2");
  });

  it("refuses anything that is not a print page on this site", () => {
    for (const from of [
      null,
      "",
      "/captains/roster",
      "https://evil.example/print/x",
      "//evil.example/print/x",
      "/print/../captains/roster",
      "/print\\..\\captains",
      "/print/pdf",
      "/print/pdf?from=/print/lounge",
      "/printer",
      `/print/${"x".repeat(700)}`,
    ]) {
      expect(printPagePath(from), String(from)).toBeNull();
    }
  });
});

describe("pdfFileName", () => {
  it("names the file after the sheet, in safe characters only", () => {
    expect(pdfFileName("Grid sheet")).toBe("camp-404-grid-sheet.pdf");
    expect(pdfFileName("Power & Lighting")).toBe(
      "camp-404-power-and-lighting.pdf",
    );
    expect(pdfFileName('Crème "brûlée"\r\nX: y')).toBe(
      "camp-404-creme-brulee-x-y.pdf",
    );
    expect(pdfFileName(null)).toBe("camp-404-print.pdf");
    expect(pdfFileName("!!!")).toBe("camp-404-print.pdf");
  });
});

describe("pdfHref", () => {
  it("asks the PDF route for this page by its path", () => {
    const href = pdfHref("/print/lounge?day=2", "Lounge programme");
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/print/pdf");
    expect(url.searchParams.get("from")).toBe("/print/lounge?day=2");
    expect(url.searchParams.get("name")).toBe("Lounge programme");
  });
});

describe("mayRenderHost", () => {
  const vercel = {
    vercelEnv: "preview",
    vercelUrl: "camp-404-abc.vercel.app",
    branchUrl: "camp-404-git-feat-prints.vercel.app",
    productionUrl: "camp-404.com",
  };

  it("opens only this deployment's addresses and the camp's domain on Vercel", () => {
    expect(mayRenderHost("camp-404-abc.vercel.app", vercel)).toBe(true);
    expect(mayRenderHost("camp-404-git-feat-prints.vercel.app", vercel)).toBe(
      true,
    );
    expect(mayRenderHost("www.camp-404.com", vercel)).toBe(true);
    expect(mayRenderHost("evil.example", vercel)).toBe(false);
    expect(mayRenderHost("localhost:3000", vercel)).toBe(false);
  });

  it("opens only the machine itself off Vercel", () => {
    expect(mayRenderHost("localhost:3000", {})).toBe(true);
    expect(mayRenderHost("127.0.0.1:3104", {})).toBe(true);
    expect(mayRenderHost("[::1]:3000", {})).toBe(true);
    expect(mayRenderHost("camp-404.com", {})).toBe(false);
    expect(mayRenderHost("localhost.evil.example", {})).toBe(false);
    expect(mayRenderHost("", {})).toBe(false);
  });
});

describe("parseCookieHeader", () => {
  it("splits a Cookie header into names and values", () => {
    expect(parseCookieHeader("a=1; b=two=2;  c=; =x; junk")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "two=2" },
      { name: "c", value: "" },
    ]);
    expect(parseCookieHeader(null)).toEqual([]);
  });
});

describe("recipeCardPlates", () => {
  const verified = [40, 50];

  it("prints a checked count, and the version's own when none is asked", () => {
    expect(recipeCardPlates("40", verified, 50, 500)).toEqual({
      ok: true,
      plates: 40,
    });
    expect(recipeCardPlates(undefined, verified, 50, 500)).toEqual({
      ok: true,
      plates: 50,
    });
    expect(recipeCardPlates(["50", "40"], verified, 50, 500)).toEqual({
      ok: true,
      plates: 50,
    });
  });

  it("refuses a count with no checked result, never working one out", () => {
    expect(recipeCardPlates("45", verified, 50, 500)).toEqual({
      ok: false,
      asked: "45",
    });
    expect(recipeCardPlates("100", verified, 50, 500)).toEqual({
      ok: false,
      asked: "100",
    });
    expect(recipeCardPlates("0", [0], 50, 500).ok).toBe(false);
    expect(recipeCardPlates("9999", [9999], 50, 500).ok).toBe(false);
    expect(recipeCardPlates("4.5", verified, 50, 500).ok).toBe(false);
    expect(recipeCardPlates("-40", verified, 50, 500).ok).toBe(false);
  });
});
