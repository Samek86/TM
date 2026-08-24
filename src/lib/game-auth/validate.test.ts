import { describe, expect, it } from "vitest";
import { validatePassword, validateUsername } from "./validate";

describe("validateUsername", () => {
  it("accepts 3–20 letter/digit/underscore names", () => {
    expect(validateUsername("ace")).toEqual({ ok: true, value: "ace" });
    expect(validateUsername("Pilot_01")).toEqual({ ok: true, value: "Pilot_01" });
    expect(validateUsername("  머셔너리  ")).toEqual({
      ok: true,
      value: "머셔너리",
    });
  });

  it("rejects short, long, empty, and punctuation names", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
    expect(validateUsername("").ok).toBe(false);
    expect(validateUsername("bad name").ok).toBe(false);
    expect(validateUsername("drop;table").ok).toBe(false);
  });
});

describe("validatePassword", () => {
  it("requires at least 8 characters and rejects empty/whitespace", () => {
    expect(validatePassword("1234567").ok).toBe(false);
    expect(validatePassword("").ok).toBe(false);
    expect(validatePassword("        ").ok).toBe(false);
    expect(validatePassword("12345678")).toEqual({
      ok: true,
      value: "12345678",
    });
  });
});
