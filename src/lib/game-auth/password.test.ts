import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("argon2id hash + verify", () => {
  it("hashes without storing plaintext and verifies the same password", async () => {
    const password = "correct horse battery";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.toLowerCase()).not.toContain(password.toLowerCase());
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("long-enough-secret");
    expect(await verifyPassword("different-secret", hash)).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("long-enough-secret", "not-a-hash")).toBe(false);
  });
});
