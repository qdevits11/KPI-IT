/**
 * Session utilisateur par navigateur (identité pour les rôles).
 * Distincte du compte Jira partagé (sync KPI dans Supabase).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  buildAppUser,
  type AppUser,
} from "./roles";
import { resolveAppSecret } from "./secrets";

export const USER_SESSION_COOKIE = "kpi_app_user";

export interface UserSessionPayload {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  /** Tokens OAuth personnels (actions tickets) — optionnel. */
  authMode?: "basic" | "oauth";
  accessToken?: string;
  refreshToken?: string;
  cloudId?: string;
  tokenExpiresAt?: string;
  baseUrl?: string;
  connectedAt: string;
}

function secretKey(): Buffer {
  const raw = resolveAppSecret("user-session");
  return createHash("sha256").update(`user-session:${raw}`).digest();
}

export function encryptUserSession(payload: UserSessionPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptUserSession(token: string): UserSessionPayload | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    const parsed = JSON.parse(dec.toString("utf-8")) as UserSessionPayload;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Options cookie session utilisateur (identité KPI·IT).
 */
export function userSessionCookieOptions(secure?: boolean) {
  return {
    httpOnly: true,
    secure: secure ?? process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  };
}

export async function writeUserSession(
  payload: UserSessionPayload,
): Promise<void> {
  const jar = await cookies();
  jar.set(
    USER_SESSION_COOKIE,
    encryptUserSession(payload),
    userSessionCookieOptions(),
  );
}

/** Attache la session au NextResponse (redirect OAuth fiable). */
export function attachUserSessionCookie(
  response: { cookies: { set: (name: string, value: string, opts: object) => void } },
  payload: UserSessionPayload,
): void {
  response.cookies.set(
    USER_SESSION_COOKIE,
    encryptUserSession(payload),
    userSessionCookieOptions(),
  );
}

export async function clearUserSession(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(USER_SESSION_COOKIE);
  } catch {
    // ignore
  }
}

export async function readUserSession(): Promise<UserSessionPayload | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(USER_SESSION_COOKIE)?.value;
    if (!raw) return null;
    return decryptUserSession(raw);
  } catch {
    return null;
  }
}

/** Utilisateur courant pour RBAC (null si pas de session). */
export async function resolveCurrentUser(): Promise<AppUser | null> {
  const session = await readUserSession();
  if (!session?.email) return null;
  const { getAccessRightsForEmail, getPeopleDirectory } = await import(
    "./store"
  );
  const rights = await getAccessRightsForEmail(session.email);
  let avatarUrl = session.avatarUrl;
  if (!avatarUrl && session.displayName) {
    const people = await getPeopleDirectory();
    avatarUrl =
      people[session.displayName]?.avatarUrl ||
      Object.values(people).find(
        (p) => p.displayName.toLowerCase() === session.displayName?.toLowerCase(),
      )?.avatarUrl;
  }
  return buildAppUser(
    session.email,
    session.displayName,
    rights,
    avatarUrl,
  );
}

/** Résout les droits d’un email depuis la base (hors session). */
export async function resolveAppUser(
  email: string,
  displayName?: string,
  avatarUrl?: string,
): Promise<AppUser> {
  const { getAccessRightsForEmail } = await import("./store");
  const rights = await getAccessRightsForEmail(email);
  return buildAppUser(email, displayName, rights, avatarUrl);
}
