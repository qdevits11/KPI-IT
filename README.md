# KPI·IT — Coverseal / Becoflex

Tableau de bord des KPI du service IT (Jira + encodage manuel).

## Navigation

### Utilisateur

| Menu | Route | Contenu |
|------|-------|---------|
| **Semaine** | `/semaine` | KPI hebdo, sélecteur de semaine, statut live / sync |
| **Tickets** | `/tickets-ouverts` | Tickets ouverts live + actions Jira |
| **Analyse** | `/analyse` | KPI année + stats tickets (assigné / demandeur / type) |
| **Encodage** | `/saisie` | Saisie manuelle (métier, Odoo, maintenance, phishing, retour) |

### Admin

| Sous-menu | Route | Contenu |
|-----------|-------|---------|
| Vue d’ensemble | `/admin` | Santé stockage, statut Jira |
| Personnes & droits | `/admin/personnes` | Accès + responsables d’encodage |
| Intégration Jira | `/admin/jira` | Credentials, JQL, champs, SLA |
| Opérations données | `/admin/operations` | Sync semaine, import ventilations |
| Documentation | `/admin/documentation` | Formules & sources des KPI |

Anciennes URLs (`/`, `/vue`, `/statistiques`, `/configuration`, `/jira`, `/formules`) redirigent vers les nouvelles.

## Modèle de données

Granularité **hebdomadaire**. Document JSON unique (`AppDatabase`) avec :

- `schemaVersion` / `revision`
- lignes semaine (KPI Jira + retour)
- journaux d’encodage (métier, Odoo, phishing, maintenances)
- ventilations tickets (type / assigné / demandeur)

| Indicateur | Source |
|------------|--------|
| Hors SLA clôture / prise en charge | Jira SLA (heures ouvrées) |
| Automatisations métiers / Odoo / Maintenances | Encodage manuel |
| Échecs phishing | Encodage manuel |
| Demandes IT hebdo / YTD | Jira / cumul |
| Non résolues hebdo / YTD | Jira snapshot / cumul |

**Responsables d'encodage** (`/admin/personnes`) : liste pour l’encodage manuel — **sans lien** avec les assignés Jira.

Les données ne sont plus importées depuis Excel : démarrage sur base vide, peuplement via sync Jira et encodage.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

### Jira (aligné workflow n8n)

Dans **Admin → Intégration Jira** : URL du site + email Atlassian + [API token](https://id.atlassian.com/manage-profile/security/api-tokens).

**Admin → Opérations** : sync semaine ou import ventilations (plage).

| KPI | Règle (comme n8n) |
|-----|-------------------|
| Demandes IT | `project = CSD AND created >= startOfWeek(-1) AND created < startOfWeek()` |
| Non résolues | `status NOT IN (Partenaire, Canceled, Done)` (snapshot) |
| Hors SLA prise en charge | `Date Prise en Charge` ∈ semaine + **> 24 h ouvrées** |
| Hors SLA clôture | `resolutiondate` ∈ semaine + **> 48 h ouvrées** |

Heures ouvrées = hors week-ends et jours fériés belges, fuseau **Europe/Brussels**.

Les « non résolues » :
- **semaine en cours** → snapshot live à chaque sync
- **semaines passées** → figées le **dimanche 23:59 Europe/Brussels** par cron Vercel (`/api/jira/cron/snapshot-open`), puis conservées

Définir `CRON_SECRET` + credentials Jira (`JIRA_*`) sur Vercel. Cron UTC : `55 21 * * 0` et `55 22 * * 0` (couvre CET/CEST).

Variables d'env optionnelles : voir `.env.example`. Sur Vercel, définir `JIRA_COOKIE_SECRET` (chiffrement) + `SUPABASE_*`. Le compte Jira (email + token ou OAuth) est stocké chiffré dans Supabase (`kpi_jira_connection`), partagé entre périphériques.

Pour modifier tickets (statut, assigné, catégorie) : créez une app OAuth 2.0 sur [developer.atlassian.com](https://developer.atlassian.com/console/myapps/) avec scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`, callback `https://VOTRE_DOMAINE/api/jira/oauth/callback`, puis `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET`. Sur Admin → Intégration Jira → « Se connecter avec Microsoft / Atlassian ».

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — formules COUNT / YTD + stats
- `npm run lint`
