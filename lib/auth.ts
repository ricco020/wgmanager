import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";

/* Password hashing: scrypt from Node (no native module to compile in the Docker build).
   N = 2^14, r = 8 fits under Node's default maxmem; cost is written into the hash. */
const COST = 1 << 14;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const d = scryptSync(pw.normalize("NFKC"), salt, 64, { N: COST, r: 8, p: 1, maxmem: MAXMEM });
  return `scrypt$${COST}$${salt.toString("base64url")}$${d.toString("base64url")}`;
}

export function verifyPassword(pw: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const p = stored.split("$");
  if (p.length !== 4 || p[0] !== "scrypt") return false;
  const cost = Number(p[1]);
  if (!Number.isFinite(cost) || cost < 1024) return false;
  try {
    const salt = Buffer.from(p[2], "base64url");
    const expected = Buffer.from(p[3], "base64url");
    const d = scryptSync(pw.normalize("NFKC"), salt, expected.length, { N: cost, r: 8, p: 1, maxmem: MAXMEM });
    return d.length === expected.length && timingSafeEqual(d, expected);
  } catch {
    return false;
  }
}

export function passwordAcceptable(pw: string): boolean {
  return typeof pw === "string" && pw.normalize("NFKC").length >= 10 && pw.length <= 200;
}

/* Session cookie: "userId.exp.hmac", HttpOnly, signed with SESSION_SECRET. */
export const COOKIE = "wg_session";
const DURATION_S = 30 * 24 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET missing");
  return s;
}

function seal(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signSession(userId: string): string {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + DURATION_S}`;
  return `${payload}.${seal(payload)}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = value.slice(0, i);
  const given = Buffer.from(value.slice(i + 1), "utf8");
  const expected = Buffer.from(seal(payload), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const j = payload.lastIndexOf(".");
  const userId = payload.slice(0, j);
  const exp = Number(payload.slice(j + 1));
  if (!userId || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  return userId;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DURATION_S,
};

export async function currentUser() {
  const jar = await cookies();
  const id = readSession(jar.get(COOKIE)?.value);
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
}
