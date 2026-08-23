import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDatabase } from "./database";

const cookieName = "nexo_lab_session";
const sessionDurationSeconds = 60 * 60 * 24 * 7;
const passwordResetDurationMilliseconds = 30 * 60 * 1000;
const scryptKeyLength = 64;
const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;

export type AuthenticatedTeacher = {
  id: number;
  code: string;
  name: string;
  email: string;
};

function passwordBytes(password: string) {
  return Buffer.from(password.normalize("NFKC"), "utf8");
}

export function passwordValidationError(password: unknown) {
  if (typeof password !== "string") return "La contraseña es obligatoria.";
  const length = [...password.normalize("NFKC")].length;
  if (length < 12) return "La contraseña debe tener al menos 12 caracteres.";
  if (length > 128) return "La contraseña no puede superar los 128 caracteres.";
  return null;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(passwordBytes(password), salt, scryptKeyLength, {
    N: scryptCost,
    r: scryptBlockSize,
    p: scryptParallelization,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, storedHash: string) {
  try {
    const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] = storedHash.split("$");
    if (algorithm !== "scrypt" || !rawCost || !rawBlockSize || !rawParallelization || !rawSalt || !rawHash) return false;
    if (Number(rawCost) !== scryptCost || Number(rawBlockSize) !== scryptBlockSize || Number(rawParallelization) !== scryptParallelization) return false;
    const salt = Buffer.from(rawSalt, "base64url");
    if (salt.length !== 16) return false;
    const expected = Buffer.from(rawHash, "base64url");
    if (expected.length !== scryptKeyLength) return false;
    const actual = scryptSync(passwordBytes(password), salt, expected.length, {
      N: scryptCost,
      r: scryptBlockSize,
      p: scryptParallelization,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function secureStringEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function sessionTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function createPasswordResetToken(teacherId: number) {
  const database = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + passwordResetDurationMilliseconds;
  database.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)")
    .run(now, now - 24 * 60 * 60 * 1000);
  database.prepare(`INSERT INTO password_reset_tokens
    (token_hash, teacher_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(sessionTokenHash(token), teacherId, expiresAt, now);
  return { token, expiresAt };
}

export function consumePasswordResetToken(token: string, password: string) {
  const database = getDatabase();
  const now = Date.now();
  database.exec("BEGIN IMMEDIATE");
  try {
    const reset = database.prepare(`SELECT id, teacher_id AS teacherId
      FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
      .get(sessionTokenHash(token), now) as { id: number; teacherId: number } | undefined;
    if (!reset) {
      database.exec("ROLLBACK");
      return false;
    }
    database.prepare("UPDATE teachers SET password_hash = ? WHERE id = ?")
      .run(hashPassword(password), reset.teacherId);
    database.prepare("DELETE FROM auth_sessions WHERE teacher_id = ?").run(reset.teacherId);
    database.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE teacher_id = ? AND used_at IS NULL")
      .run(now, reset.teacherId);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createAuthenticationSession(teacherId: number) {
  const database = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + sessionDurationSeconds * 1000;
  database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now());
  database.prepare("INSERT INTO auth_sessions (token_hash, teacher_id, expires_at) VALUES (?, ?, ?)")
    .run(sessionTokenHash(token), teacherId, expiresAt);
  return { token, expiresAt };
}

export function authenticationCookie(token: string) {
  return {
    name: cookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDurationSeconds,
  };
}

export function clearedAuthenticationCookie() {
  return { ...authenticationCookie(""), maxAge: 0 };
}

export async function currentAuthenticationToken() {
  return (await cookies()).get(cookieName)?.value ?? "";
}

export async function getAuthenticatedTeacher(): Promise<AuthenticatedTeacher | null> {
  const token = await currentAuthenticationToken();
  if (!token) return null;
  const database = getDatabase();
  const teacher = database.prepare(`SELECT t.id, t.code, t.name, t.email
    FROM auth_sessions a
    JOIN teachers t ON t.id = a.teacher_id
    WHERE a.token_hash = ? AND a.expires_at > ?`
  ).get(sessionTokenHash(token), Date.now()) as AuthenticatedTeacher | undefined;
  return teacher ?? null;
}

export async function deleteCurrentAuthenticationSession() {
  const token = await currentAuthenticationToken();
  if (!token) return;
  getDatabase().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(sessionTokenHash(token));
}

export function unauthorizedResponse() {
  return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
