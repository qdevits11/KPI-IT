# KPI·IT — Coverseal / Becoflex

Tableau de bord des KPI du service IT, calqué sur `Becoflex/KPI.xlsx` (Google Drive).

## Modèle (comme l'Excel)

Granularité **hebdomadaire**. Feuille année + journaux de détail :

| Indicateur | Source | Formule |
|------------|--------|---------|
| Hors SLA clôture / prise en charge | Manuel (ou Jira SLA) | Valeur saisie |
| Automatisations métiers | Journal | `COUNTIFS(année, semaine)` |
| Améliorations Odoo | Journal | `COUNTIFS(année, semaine)` |
| Échecs phishing | Journal | `SUMIFS(Nbr échecs)` |
| Maintenances production | Journal | `COUNTIFS(année, semaine)` |
| Demandes IT hebdo | Jira / saisie | Tickets créés |
| Demandes IT YTD | Calculé | `Σ hebdo` (L_n = K_n + L_(n-1)) |
| Non résolues hebdo / YTD | Jira / calculé | Snapshot + cumul Excel |
| Tickets par type / responsable | Jira / Excel | Ventilation |

Données initiales importées depuis `data/seed-from-excel.json` (extrait de KPI.xlsx).

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) — semaine 31 (2026) préchargée.

### Réimporter l'Excel

1. Remplacer `data/KPI.xlsx` puis régénérer le seed :
   ```bash
   python3 scripts/export-seed.py
   ```
2. Ou dans l'UI **Sync Jira** → « Réimporter KPI.xlsx » (recharge depuis `seed-from-excel.json`).

### Jira (aligné workflow n8n)

Dans l'UI **Sync Jira** : URL du site + email Atlassian + [API token](https://id.atlassian.com/manage-profile/security/api-tokens).

| KPI | Règle (comme n8n) |
|-----|-------------------|
| Demandes IT | `project = CSD AND created >= startOfWeek(-1) AND created < startOfWeek()` |
| Non résolues | `status NOT IN (Partenaire, Canceled, Done)` (snapshot) |
| Hors SLA prise en charge | `Date Prise en Charge` ∈ semaine + **> 24 h ouvrées** |
| Hors SLA clôture | `resolutiondate` ∈ semaine + **> 48 h ouvrées** |

Heures ouvrées = hors week-ends et jours fériés belges (liste n8n).

Variables d'env optionnelles : voir `.env.example`. Sur Vercel, définir `JIRA_COOKIE_SECRET`.

### Email SMTP (remplace l'envoi n8n)

Sur Vercel, renseigner votre serveur SMTP existant :

| Variable | Exemple |
|----------|---------|
| `SMTP_HOST` | `smtp.coverseal.com` |
| `SMTP_PORT` | `587` (ou `465` + `SMTP_SECURE=true`) |
| `SMTP_USER` / `SMTP_PASS` | compte d'envoi |
| `SMTP_FROM` | `KPI IT <noreply@coverseal.com>` |
| `SMTP_TO` | `it@coverseal.com` (plusieurs : séparés par `,`) |
| `CRON_SECRET` | token pour `/api/mail/cron` |

Depuis **Sync Jira** : choisir année/semaine → **Envoyer le rapport**.  
Cron Vercel : lundi 07:00 UTC → sync semaine précédente + email (`vercel.json`).

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — vérifie COUNTIFS / YTD vs Excel (ex. S31 → 1090 demandes YTD)
- `npm run lint`
