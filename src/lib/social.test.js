import {
  isValidHandle,
  normalizeHandle,
  normalizeListVisibility,
  normalizeProfileVisibility,
  normalizeSection,
  slugify,
} from "./social";

describe("social utils", () => {
  test("normalizeSection defaults to general", () => {
    expect(normalizeSection("travel")).toBe("travel");
    expect(normalizeSection("")).toBe("general");
    expect(normalizeSection("unknown")).toBe("general");
  });

  test("normalizeListVisibility defaults to private", () => {
    expect(normalizeListVisibility("public")).toBe("public");
    expect(normalizeListVisibility("")).toBe("private");
    expect(normalizeListVisibility("nope")).toBe("private");
  });

  test("normalizeProfileVisibility defaults to public", () => {
    expect(normalizeProfileVisibility("private")).toBe("private");
    expect(normalizeProfileVisibility("")).toBe("public");
    expect(normalizeProfileVisibility("nope")).toBe("public");
  });

  test("normalizeHandle lowercases and strips @", () => {
    expect(normalizeHandle("@Fergus")).toBe("fergus");
    expect(normalizeHandle("  A.B+C ")).toBe("a.b+c");
    expect(normalizeHandle("")).toBe("");
  });

  test("isValidHandle enforces length and pattern", () => {
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("abc")).toBe(true);
    expect(isValidHandle("a_bc")).toBe(true);
    expect(isValidHandle("a-bc")).toBe(false);
    expect(isValidHandle("-abc")).toBe(false);
  });

  test("slugify creates stable slugs", () => {
    expect(slugify("Hello world")).toBe("hello-world");
    expect(slugify("  Top 10: NYC Hotels  ")).toBe("top-10-nyc-hotels");
    expect(slugify("")).toBe("");
    expect(slugify("a".repeat(200), { maxLength: 10 })).toBe("a".repeat(10));
    const clipped = slugify("hello-".repeat(20), { maxLength: 20 });
    expect(clipped.length).toBeLessThanOrEqual(20);
    expect(clipped.endsWith("-")).toBe(false);
    expect(clipped.startsWith("hello")).toBe(true);
  });
});
