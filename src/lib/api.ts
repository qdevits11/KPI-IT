/**
 * Helpers API homogènes — réponses, auth, validation légère.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessAdminPages,
  canEditWeekRetour,
  isEncodingResponsible,
  type AppUser,
} from "./roles";
import { resolveCurrentUser } from "./user-session";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "conflict"
  | "internal";

export function apiOk<T extends Record<string, unknown>>(
  body: T,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json({ ok: true, ...body }, init);
}

export function apiError(
  error: string,
  status: number,
  code: ApiErrorCode = "internal",
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error, code, ...extra },
    { status },
  );
}

export async function requireSessionApi(): Promise<
  { user: AppUser } | { response: NextResponse }
> {
  const user = await resolveCurrentUser();
  if (!user) {
    return {
      response: apiError(
        "Connexion requise.",
        401,
        "unauthorized",
      ),
    };
  }
  return { user };
}

export async function requireAdminApi(): Promise<
  { user: AppUser } | { response: NextResponse }
> {
  const session = await requireSessionApi();
  if ("response" in session) return session;
  if (!canAccessAdminPages(session.user)) {
    return {
      response: apiError(
        "Accès réservé aux administrateurs KPI·IT.",
        403,
        "forbidden",
      ),
    };
  }
  return session;
}

export async function requireEncodingApi(): Promise<
  { user: AppUser } | { response: NextResponse }
> {
  const session = await requireSessionApi();
  if ("response" in session) return session;
  if (
    !isEncodingResponsible(session.user) &&
    !canAccessAdminPages(session.user)
  ) {
    return {
      response: apiError(
        "Accès réservé aux responsables d’encodage.",
        403,
        "forbidden",
      ),
    };
  }
  return session;
}

export async function requireKpiRetourApi(): Promise<
  { user: AppUser } | { response: NextResponse }
> {
  const session = await requireSessionApi();
  if ("response" in session) return session;
  if (!canEditWeekRetour(session.user)) {
    return {
      response: apiError(
        "Seul le responsable KPI peut enregistrer le retour sur la semaine.",
        403,
        "forbidden",
      ),
    };
  }
  return session;
}

export function parseJsonBody<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { data: T } | { response: NextResponse } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: apiError(
        parsed.error.issues[0]?.message ?? "Payload invalide",
        400,
        "validation",
        { issues: parsed.error.issues },
      ),
    };
  }
  return { data: parsed.data };
}

/** Cron : Bearer CRON_SECRET uniquement (pas de contournement header). */
export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === secret;
}
