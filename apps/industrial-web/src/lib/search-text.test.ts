import { describe, expect, it } from "vitest";
import {
  matchesSearchTokens,
  matchesSearchTokensAnywhere,
  normalizeSearchText,
  searchTokens,
} from "./search-text";

describe("search text helpers", () => {
  it("strips accents and punctuation", () => {
    expect(normalizeSearchText("O'NEIL, José Jr.")).toBe("o neil jose jr");
    expect(normalizeSearchText("EMP-21055")).toBe("emp 21055");
    expect(normalizeSearchText("   ")).toBe("");
  });

  it("splits a query into tokens", () => {
    expect(searchTokens(" john  smith ")).toEqual(["john", "smith"]);
    expect(searchTokens("")).toEqual([]);
  });

  it("matches every token regardless of order", () => {
    const hay = ["JOHN R SMITH", "EMP-21055", "Flour Packer"];
    expect(matchesSearchTokens(hay, "smith john")).toBe(true);
    expect(matchesSearchTokens(hay, "john sm")).toBe(true);
    expect(matchesSearchTokens(hay, "21055")).toBe(true);
    expect(matchesSearchTokens(hay, "emp-21055")).toBe(true);
    expect(matchesSearchTokens(hay, "packer")).toBe(true);
    expect(matchesSearchTokens(hay, "john jones")).toBe(false);
  });

  it("treats a blank query as everything", () => {
    expect(matchesSearchTokens(["anything"], "  ")).toBe(true);
  });

  it("matches the start of a word, not the middle of one", () => {
    expect(matchesSearchTokens(["DON D BAITY"], "don")).toBe(true);
    expect(matchesSearchTokens(["DON M JOHNSON"], "don")).toBe(true);
    expect(matchesSearchTokens(["BRANDON D BRATCHIE"], "don")).toBe(false);
    expect(matchesSearchTokens(["CHARLITHA D MCDONALD"], "don")).toBe(false);
    expect(matchesSearchTokens(["BRANDON D BRATCHIE"], "bran")).toBe(true);
  });

  it("matches a hyphenated or suffixed name on its own words", () => {
    expect(matchesSearchTokens(["PATRICK LONDON-TERMINATED"], "london")).toBe(true);
    expect(matchesSearchTokens(["SMITH, JR."], "jr")).toBe(true);
  });

  it("keeps partial employee numbers working", () => {
    expect(matchesSearchTokens(["EMP-24952"], "24952")).toBe(true);
    expect(matchesSearchTokens(["EMP-24952"], "4952")).toBe(true);
    expect(matchesSearchTokens(["EMP-24952"], "9999")).toBe(false);
  });

  it("widens to matches inside words only when asked", () => {
    expect(matchesSearchTokensAnywhere(["CHARLITHA D MCDONALD"], "donald")).toBe(true);
    expect(matchesSearchTokens(["CHARLITHA D MCDONALD"], "donald")).toBe(false);
  });

  it("rejects an empty haystack for a real query", () => {
    expect(matchesSearchTokens([""], "don")).toBe(false);
  });
});
