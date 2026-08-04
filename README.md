# KPI·IT — Coverseal

Application de suivi des KPI du service IT.

## Sources de données

| Domaine | Source | Exemples d'indicateurs |
|---------|--------|------------------------|
| Tickets | **Jira** (API) | Créés, résolus, ouverts, délai moyen, SLA |
| Mises à jour appareils | **Saisie manuelle** | % conformité parc |
| Automatisations Odoo | **Saisie manuelle** | Actives, taux de succès |
| Automatisations métier | **Saisie manuelle** | Actives, heures économisées |
| Tests de phishing | **Saisie manuelle** | Taux de clic, taux de signalement |
| Maintenance production | **Saisie manuelle** | Taux réalisation, disponibilité, incidents |

Chaque chiffre affiché est **calculé** à partir de données brutes. Les formules sont documentées dans l'app (`/formules`) et dans `src/lib/formulas.ts`.

> **Note :** le fichier Excel de référence n'a pas été joint à cette session. Les formules actuelles reflètent les domaines décrits ; elles pourront être alignées exactement sur l'Excel dès qu'il sera fourni.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Configuration Jira

Copier `.env.example` vers `.env.local` :

```env
JIRA_BASE_URL=https://votre-domaine.atlassian.net
JIRA_EMAIL=it@coverseal.com
JIRA_API_TOKEN=votre_token
JIRA_JQL_BASE=project = IT
JIRA_SLA_HOURS=8
```

Sans ces variables, la page **Sync Jira** propose un mode démo (mock).

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build production
- `npm test` — tests des formules KPI
- `npm run lint` — ESLint

## Architecture

- `src/lib/formulas.ts` — formules + moteur de calcul
- `src/lib/jira.ts` — client API Jira Cloud
- `src/lib/store.ts` — persistance JSON (`data/db.json`)
- `src/app/api/*` — routes API
- Pages : tableau de bord, saisie manuelle, sync Jira, formules
