import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/** Défauts Microsoft 365 / Exchange Online */
export const OFFICE365_SMTP = {
  host: "smtp.office365.com",
  port: 587,
  from: "KPI IT <noreply@coverseal.com>",
  user: "noreply@coverseal.com",
} as const;

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[];
}

export interface WeekMailValues {
  year: number;
  week: number;
  start: string;
  endExclusive: string;
  demandesItHebdo: number;
  demandesNonResoluesHebdo: number;
  ticketsHorsSlaCloture: number;
  ticketsHorsSlaPriseEnCharge: number;
}

function extractEmail(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  if (from.includes("@")) return from.trim();
  return null;
}

export function getSmtpConfig(): SmtpConfig | null {
  const from =
    process.env.SMTP_FROM?.trim() || OFFICE365_SMTP.from;
  const toRaw =
    process.env.SMTP_TO?.trim() ||
    process.env.MAIL_TO?.trim() ||
    "q.devits@coverseal.com";
  const pass = process.env.SMTP_PASS?.trim();
  const user =
    process.env.SMTP_USER?.trim() ||
    extractEmail(from) ||
    OFFICE365_SMTP.user;

  // Office 365 exige auth ; sans mot de passe = non configuré
  if (!pass) return null;

  const port = Number(process.env.SMTP_PORT ?? OFFICE365_SMTP.port);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;

  return {
    host: process.env.SMTP_HOST?.trim() || OFFICE365_SMTP.host,
    port: Number.isFinite(port) ? port : OFFICE365_SMTP.port,
    secure,
    // STARTTLS sur 587 — requis pour smtp.office365.com
    requireTLS: !secure,
    user,
    pass,
    from,
    to: toRaw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function smtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

function createTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      // Office 365 / modernes
      minVersion: "TLSv1.2",
    },
  });
}

function formatSmtpError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("authentication unsuccessful") ||
    lower.includes("invalid login") ||
    lower.includes("535")
  ) {
    return (
      "Auth Office 365 refusée. Vérifiez le mot de passe de noreply@coverseal.com, " +
      "et que « Authenticated SMTP » est activé pour cette boîte " +
      "(admin M365 → utilisateur → Mail → applications mail)."
    );
  }
  if (lower.includes("5.7.57") || lower.includes("client was not authenticated")) {
    return (
      "SMTP AUTH désactivé pour noreply@coverseal.com. " +
      "Activez Authenticated SMTP dans le centre d’admin Microsoft 365."
    );
  }
  if (lower.includes("sender") && lower.includes("not allowed")) {
    return (
      "L’expéditeur doit être la boîte authentifiée (noreply@coverseal.com) " +
      "ou un alias avec droit « Envoyer en tant que »."
    );
  }
  return raw;
}

export function buildWeekMailHtml(v: WeekMailValues): string {
  const weekLabel = `${v.year}-S${String(v.week).padStart(2, "0")}`;
  const rows: Array<[string, number, string]> = [
    ["Tickets créés", v.demandesItHebdo, "Demandes IT — Hebdo"],
    [
      "Non résolus",
      v.demandesNonResoluesHebdo,
      "Snapshot ouvert (comme n8n)",
    ],
    ["Hors SLA clôture", v.ticketsHorsSlaCloture, "> 48 h ouvrées"],
    [
      "Hors SLA prise en charge",
      v.ticketsHorsSlaPriseEnCharge,
      "> 24 h ouvrées",
    ],
  ];

  const cells = rows
    .map(
      ([label, value, hint]) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #d7e0e5;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5f727a;">${label}</div>
          <div style="font-size:28px;font-weight:600;color:#0b3d4a;margin-top:4px;">${value}</div>
          <div style="font-size:12px;color:#7a8d95;margin-top:4px;">${hint}</div>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#e8eef2;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eef2;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #c5d0d8;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 8px 24px;background:linear-gradient(135deg,#0b3d4a 0%,#14687a 100%);">
              <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#b7d7de;">KPI·IT · Coverseal</div>
              <h1 style="margin:8px 0 0;font-size:26px;color:#ffffff;font-weight:600;">Rapport semaine ${weekLabel}</h1>
              <p style="margin:8px 0 16px;font-size:14px;color:#d2e6ea;">
                Période ${v.start} → ${v.endExclusive} (exclu)
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 8px 24px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cells}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;font-size:12px;color:#6a7a82;">
              Calculs alignés n8n : projet CSD, SLA 24h / 48h en heures ouvrées (week-ends + jours fériés BE exclus).
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildWeekMailText(v: WeekMailValues): string {
  const weekLabel = `${v.year}-S${String(v.week).padStart(2, "0")}`;
  return [
    `KPI·IT — Rapport ${weekLabel}`,
    `Période ${v.start} → ${v.endExclusive}`,
    "",
    `Tickets créés : ${v.demandesItHebdo}`,
    `Non résolus : ${v.demandesNonResoluesHebdo}`,
    `Hors SLA clôture : ${v.ticketsHorsSlaCloture}`,
    `Hors SLA prise en charge : ${v.ticketsHorsSlaPriseEnCharge}`,
  ].join("\n");
}

export async function sendWeekReport(
  values: WeekMailValues,
  options?: { to?: string[] },
): Promise<{ messageId: string; to: string[] }> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    throw new Error(
      "SMTP Office 365 non configuré. Sur Vercel : SMTP_PASS (noreply@coverseal.com) + SMTP_TO.",
    );
  }

  const to = options?.to?.length ? options.to : cfg.to;
  if (!to.length) {
    throw new Error("Aucun destinataire (SMTP_TO).");
  }

  const weekLabel = `${values.year}-S${String(values.week).padStart(2, "0")}`;
  const transport = createTransport(cfg);

  try {
    const info = await transport.sendMail({
      from: cfg.from,
      sender: cfg.user,
      to: to.join(", "),
      subject: `KPI IT — Semaine ${weekLabel}`,
      text: buildWeekMailText(values),
      html: buildWeekMailHtml(values),
    });

    return {
      messageId: info.messageId ?? "",
      to,
    };
  } catch (err) {
    throw new Error(formatSmtpError(err));
  }
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "SMTP Office 365 non configuré. Définissez SMTP_PASS + SMTP_TO (hôte par défaut smtp.office365.com, expéditeur noreply@coverseal.com).",
    };
  }
  try {
    const transport = createTransport(cfg);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatSmtpError(err),
    };
  }
}
