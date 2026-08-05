/**
 * Persistance multi-couches pour la base KPI.
 *
 * Sur Vercel le FS (`/tmp`) est éphémère : une nouvelle instance vide
 * écrasait toutes les ventilations Jira (demandeurs, etc.).
 *
 * Ordre de lecture : mémoire → disque → Vercel Blob → base vide.
 * Écriture : mémoire + disque + Blob (si token).
 * Une base vide ne doit jamais écraser un Blob déjà peuplé.
 */

import { put, get, head } from "@vercel/blob";
import type { AppDatabase } from "./types";

export const BLOB_DB_PATHNAME = "kpi-it/db.json";

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  return new Response(stream).text();
}

export async function loadDbFromBlob(): Promise<AppDatabase | null> {
  if (!blobConfigured()) return null;
  try {
    const result = await get(BLOB_DB_PATHNAME, {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    const raw = await streamToText(result.stream);
    if (!raw.trim()) return null;
    return JSON.parse(raw) as AppDatabase;
  } catch (err) {
    console.warn("Lecture Blob KPI impossible:", err);
    return null;
  }
}

export async function blobExists(): Promise<boolean> {
  if (!blobConfigured()) return false;
  try {
    const meta = await head(BLOB_DB_PATHNAME);
    return Boolean(meta);
  } catch {
    return false;
  }
}

/** Écrit/écrase le Blob (syncs, patches). */
export async function saveDbToBlob(db: AppDatabase): Promise<boolean> {
  if (!blobConfigured()) return false;
  try {
    await put(BLOB_DB_PATHNAME, JSON.stringify(db), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    });
    return true;
  } catch (err) {
    console.warn("Écriture Blob KPI impossible:", err);
    return false;
  }
}

/**
 * Initialise le Blob uniquement s’il est absent — pour ne pas écraser
 * une année de demandeurs avec un seed Excel vide.
 */
export async function saveDbToBlobIfAbsent(db: AppDatabase): Promise<boolean> {
  if (!blobConfigured()) return false;
  if (await blobExists()) {
    console.warn(
      "Seed local ignoré pour le Blob : une base durable existe déjà.",
    );
    return false;
  }
  return saveDbToBlob(db);
}
