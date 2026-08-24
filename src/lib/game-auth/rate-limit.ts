/**
 * In-memory sliding-window limiter (per process). Fine for a single Node
 * instance; resets on restart.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) return true;
  bucket.hits.push(now);
  return false;
}

/** Test helper — wipe buckets between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_USER_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const SIGNUP_IP_LIMIT = 10;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
export const WIN_USER_LIMIT = 40;
export const WIN_WINDOW_MS = 60 * 60 * 1000;
