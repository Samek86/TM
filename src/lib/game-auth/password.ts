/**
 * Argon2id password hashing. Never log the password argument.
 *
 * Production: OWASP 2024 minimum (19 MiB, t=2, p=1).
 * Tests: lower memory so vitest stays fast — encoded hashes still carry params.
 */
import { argon2id, hash, verify } from "argon2";

const inVitest = process.env.VITEST === "true";

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: argon2id,
    memoryCost: inVitest ? 4096 : 19456,
    timeCost: inVitest ? 1 : 2,
    parallelism: 1,
    hashLength: 32,
  });
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Dummy hash so missing-user logins still pay argon2 verify cost. */
let dummyHashPromise: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-protection-placeholder");
  return dummyHashPromise;
}
