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

### Jira

```env
JIRA_BASE_URL=https://votre-domaine.atlassian.net
JIRA_EMAIL=it@coverseal.com
JIRA_API_TOKEN=
JIRA_JQL_BASE=project = IT
```

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — vérifie COUNTIFS / YTD vs Excel (ex. S31 → 1090 demandes YTD)
- `npm run lint`
