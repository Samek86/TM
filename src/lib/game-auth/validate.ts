export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Letters (incl. Hangul), digits, underscore. */
const USERNAME_RE = /^[\p{L}\p{N}_]+$/u;

export type FieldOk<T> = { ok: true; value: T };
export type FieldErr = { ok: false; error: string };
export type FieldResult<T> = FieldOk<T> | FieldErr;

export function validateUsername(raw: unknown): FieldResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "아이디를 입력하세요" };
  }
  const username = raw.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return {
      ok: false,
      error: `아이디는 ${USERNAME_MIN}~${USERNAME_MAX}자입니다`,
    };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: "아이디는 글자, 숫자, 밑줄(_)만 사용할 수 있습니다",
    };
  }
  return { ok: true, value: username };
}

export function validatePassword(raw: unknown): FieldResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "비밀번호를 입력하세요" };
  }
  if (raw.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다`,
    };
  }
  if (raw.length > PASSWORD_MAX) {
    return { ok: false, error: "비밀번호가 너무 깁니다" };
  }
  return { ok: true, value: raw };
}
