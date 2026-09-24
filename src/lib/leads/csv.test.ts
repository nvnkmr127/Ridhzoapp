import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv export", () => {
  it("neutralises formula injection from form-submitted values", () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(csvCell("+91 98765")).toBe(`"'+91 98765"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("-2+3")).toBe(`"'-2+3"`);
  });

  it("quotes commas/quotes/newlines and leaves plain text alone", () => {
    expect(csvCell("Asha Rao")).toBe("Asha Rao");
    expect(csvCell('Acme, "Ltd"')).toBe('"Acme, ""Ltd"""');
    expect(toCsv(["a", "b"], [[1, null]])).toBe("﻿a,b\r\n1,");
  });
});
