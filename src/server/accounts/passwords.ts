import { hash, verify, argon2id } from "argon2";
import { HttpError } from "../api/http-error.js";

let active = 0;
async function budget<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2)
    throw new HttpError(429, "AUTH_BUSY", "认证繁忙，请稍后重试。");
  active++;
  try {
    return await work();
  } finally {
    active--;
  }
}
export function passwordHash(password: string): Promise<string> {
  return budget(() =>
    hash(password, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  );
}
export function passwordMatches(
  encoded: string,
  password: string,
): Promise<boolean> {
  return budget(() => verify(encoded, password));
}
