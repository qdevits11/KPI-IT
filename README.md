# KPI·IT — Coverseal / Becoflex

Tableau de bord des KPI du service IT, calqué sur `Becoflex/KPI.xlsx` (Google Drive).

## Modèle (comme l'Excel)

Granularité **hebdomadaire**. Feuille année + journaux de détail :

| Indicateur | Source | Formule |
|------------|--------|---------|
| Hors SLA clôture / prise en charge | Jira SLA | Heures ouvrées > 48h / 24h |
| Automatisations métiers | **Encodage** (date, explication, responsable) | `COUNTIFS(année, semaine)` |
| Améliorations Odoo | **Encodage** (date, explication, responsable) | `COUNTIFS(année, semaine)` |
| Échecs phishing | **Encodage** (date, nbr échecs) | `SUMIFS(Nbr échecs)` |
| Maintenances production | **Encodage** (date, explication, responsable) | `COUNTIFS(année, semaine)` |
| Demandes IT hebdo | Jira | Tickets créés |
| Demandes IT YTD | Calculé | `Σ hebdo` (L_n = K_n + L_(n-1)) |
| Non résolues hebdo / YTD | Jira / calculé | Snapshot + cumul Excel |
| Tickets par type / responsable | Jira / Excel | Ventilation |

**Encodage manuel** (`/saisie`) :
- Automatisations métiers / Odoo / maintenances (date, explication, responsable)
- Tests phishing ratés (date, nbr échecs)
- **Retour semaine** : remarque sur la fluctuation des chiffres + recommandations

**Responsables** (`/configuration`) : liste fermée (par défaut Gary, Quentin, Loic, Dominique) — sélectionnable à l’encodage, extensible dans Configuration.

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

Heures ouvrées = hors week-ends et jours fériés belges, fuseau **Europe/Brussels** (comme n8n / site Jira).

Les « non résolues » :
- **semaine en cours** → snapshot live à chaque sync
- **semaines passées** → figées le **dimanche 23:59 Europe/Brussels** par cron Vercel (`/api/jira/cron/snapshot-open`), puis conservées

Définir `CRON_SECRET` + credentials Jira (`JIRA_*`) sur Vercel. Cron UTC : `55 21 * * 0` et `55 22 * * 0` (couvre CET/CEST).

Variables d'env optionnelles : voir `.env.example`. Sur Vercel, définir `JIRA_COOKIE_SECRET`.

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — vérifie COUNTIFS / YTD vs Excel (ex. S31 → 1090 demandes YTD)
- `npm run lint`
