décrivant tous les endpoints
- Configuration Orval (`orval.config.ts`) en mode `single` → génère `lib/api-zod/src/generated/api.ts`
- Les Zod schemas partagés (`RegisterBody`, `LoginBody`, `CreateTradeBody`, `ImportTradesBody`, etc.) sont utilisés à la fois côté serveur (validation) et côté client (typage)

### Étape 3 — Backend complet

Dans l'ordre de développement des routes :

1. `routes/health.ts` → `/api/healthz` (vérification de vie)
2. `routes/auth.ts` → register, login, me, regenerate-token
3. `routes/trades.ts` → CRUD complet + import avec normalisation des champs
4. `routes/stats.ts` → summary, equity curve, calendar, by-symbol, insights comportementaux
5. `routes/bridge.ts` → download script, ping, status

### Étape 4 — Frontend complet

Via subagent Design spécialisé :

1. Setup Vite + React 18 + Tailwind + shadcn/ui en thème dark
2. `AuthContext.tsx` avec gestion token localStorage
3. `custom-fetch.ts` pour injecter automatiquement le token dans toutes les requêtes
4. Pages : Login, Register, Dashboard, Trades, Calendar, Analytics, Settings
5. Composants : AppLayout (sidebar), KPI cards, Equity LineChart, Calendar heatmap, Symbol BarChart

### Étape 5 — Corrections de bugs

| Bug | Cause | Correction |
|-----|-------|------------|
| Login redirige vers login après succès | `useGetMe` (React Query) avait un cache obsolète au démarrage | Remplacé par `fetch()` natif dans `AuthContext` |
| 401 sur toutes les requêtes | Frontend envoyait `Bearer` mais backend n'acceptait que `Token` | Backend modifié pour accepter les deux formats |
| `data.user` sans `token` après login | Login passait `data.user` à `login()` sans le token | Corrigé pour passer `data.token` séparément |

### Étape 6 — Seed de démonstration

Création du compte `demo` / `demo1234` avec 20 trades MT5-like sur 4 symboles (EURUSD, GBPUSD, XAUUSD, USDJPY) couvrant 3 mois, avec mix de trades gagnants/perdants pour illustrer tous les graphiques.

### Étape 7 — Bridge MT5

1. Script Python complet intégré comme string dans `routes/bridge.ts`
2. Endpoint de téléchargement avec header `Content-Disposition: attachment`
3. Endpoint ping (heartbeat) → update `last_sync_at`
4. Page `Bridge.tsx` : instructions étape par étape, statut en temps réel, bouton de téléchargement, commande avec token pré-rempli

### Étape 8 — Renommage

Remplacement de "TradJ" par **"Jnayen Trading"** dans :
- Page Login (titre)
- Page Register (titre)
- Sidebar (header + mobile header)

---

## 10. Bugs rencontrés et corrections

### Bug 1 : Race condition AuthContext

**Symptôme :** Après login, l'utilisateur était immédiatement redirigé vers `/login`.

**Cause :** `useGetMe` (hook React Query généré) utilisait un cache partagé. Lors du montage de `AuthContext`, React Query retournait `status: 'loading'` avant d'avoir le token dans localStorage, ce qui déclenchait une redirection prématurée.

**Correction :** Remplacement de `useGetMe` par un `fetch('/api/auth/me')` direct dans un `useEffect`, avec gestion manuelle du token via `getAuthToken()`.

---

### Bug 2 : 401 sur toutes les requêtes authentifiées

**Symptôme :** Dashboard affichait "Unauthorized" après connexion réussie.

**Cause :** `custom-fetch.ts` envoyait `Authorization: Bearer <token>`, mais le middleware `requireAuth` ne reconnaissait que le format `Token <token>`.

**Correction :** Le middleware `requireAuth` accepte maintenant les deux formats :
```typescript
if (authHeader.startsWith("Token ")) token = authHeader.slice(6);
else if (authHeader.startsWith("Bearer ")) token = authHeader.slice(7);
```

---

### Bug 3 : Token non transmis après login

**Symptôme :** `login()` était appelé avec `data.user` uniquement, sans le token.

**Cause :** Le composant Login passait `data.user` au lieu de `{ token: data.token, user: data.user }`.

**Correction :** Login.tsx et Register.tsx modifiés pour appeler `login(data.token, data.user)`.

---

### Bug 4 : Conflit d'exports dans api-zod

**Symptôme :** Erreur TypeScript `Duplicate identifier` après codegen Orval.

**Cause :** La config Orval en mode split générait `api.ts`, `api.schemas.ts` et `types.ts`, avec des exports en doublon.

**Correction :** Config Orval repassée en `mode: "single"` → un seul fichier `generated/api.ts`. Le barrel `lib/api-zod/src/index.ts` n'exporte que depuis `./generated/api`.

---

## 11. Structure des fichiers

```
artifacts/
├── api-server/
│   ├── src/
│   │   ├── index.ts                   ← Point d'entrée serveur
│   │   ├── app.ts                     ← Express app setup
│   │   ├── lib/
│   │   │   ├── auth.ts                ← bcrypt, token, middleware requireAuth
│   │   │   └── logger.ts              ← Pino singleton
│   │   └── routes/
│   │       ├── index.ts               ← Mount routes sous /api
│   │       ├── auth.ts                ← register / login / me / regenerate-token
│   │       ├── trades.ts              ← CRUD trades + import avec alias normalization
│   │       ├── stats.ts               ← summary / equity / calendar / by-symbol / insights
│   │       ├── bridge.ts              ← download / ping / status + script Python intégré
│   │       └── health.ts              ← /healthz
│   ├── build.mjs                      ← Build esbuild
│   └── package.json
│
└── trading-journal/
    ├── src/
    │   ├── main.tsx                   ← Entrée React
    │   ├── App.tsx                    ← Routes wouter
    │   ├── contexts/
    │   │   └── AuthContext.tsx        ← Token auth, session, login/logout
    │   ├── lib/
    │   │   └── custom-fetch.ts        ← Fetch wrapper avec token auto-inject
    │   ├── components/
    │   │   └── layout/
    │   │       └── AppLayout.tsx      ← Sidebar + header mobile
    │   └── pages/
    │       ├── Login.tsx
    │       ├── Register.tsx
    │       ├── Dashboard.tsx          ← KPIs + Equity curve + Summary
    │       ├── Trades.tsx             ← Liste trades, pagination, filtres, import
    │       ├── Calendar.tsx           ← Heatmap mensuelle
    │       ├── Analytics.tsx          ← Stats par symbole + insights comportementaux
    │       ├── Bridge.tsx             ← Setup MT5 bridge + statut
    │       └── Settings.tsx           ← Profil + régénération token
    └── package.json

lib/
├── db/
│   ├── src/
│   │   ├── index.ts                   ← Export db + tables
│   │   └── schema/
│   │       ├── users.ts               ← usersTable + Zod insert schema
│   │       └── trades.ts              ← tradesTable + Zod insert schema
│   └── package.json
│
└── api-zod/
    ├── src/
    │   ├── index.ts                   ← Re-export depuis ./generated/api
    │   └── generated/
    │       └── api.ts                 ← Généré par Orval (schemas Zod partagés)
    └── package.json

lib/api-spec/
├── openapi.yaml                       ← Spec OpenAPI complète
├── orval.config.ts                    ← Config codegen (mode single)
└── package.json
```

---

## 12. Endpoints API complets

**Base URL :** `/api`

### Authentification

| Méthode | Endpoint | Auth | Corps | Description |
|---------|----------|------|-------|-------------|
| POST | `/auth/register` | Non | `{ username, password }` | Créer un compte |
| POST | `/auth/login` | Non | `{ username, password }` | Se connecter |
| GET | `/auth/me` | Oui | — | Profil utilisateur courant |
| POST | `/auth/regenerate-token` | Oui | — | Nouveau token API |

### Trades

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/trades` | Oui | Liste paginée (`?page&pageSize&symbol&side&search`) |
| POST | `/trades` | Oui | Créer un trade |
| GET | `/trades/:id` | Oui | Détail d'un trade |
| DELETE | `/trades/:id` | Oui | Supprimer un trade |
| POST | `/trades/import` | Oui | Import batch `{ trades: [...] }` |

### Statistiques

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/stats/summary` | Oui | KPIs globaux (winRate, PF, expectancy…) |
| GET | `/stats/equity` | Oui | Courbe d'équité chronologique |
| GET | `/stats/calendar` | Oui | P&L par jour (`?year=&month=`) |
| GET | `/stats/by-symbol` | Oui | Performance par symbole |
| GET | `/stats/insights` | Oui | Score + findings comportementaux |

### Bridge

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/bridge/download` | Oui | Télécharger `tradj_bridge.py` |
| POST | `/bridge/ping` | Oui | Heartbeat du bridge (update `last_sync_at`) |
| GET | `/bridge/status` | Oui | `{ lastSyncAt }` |

### Santé

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/healthz` | Non | `{ ok: true }` |

---

## 13. Compte de démonstration

Un compte seed est disponible pour tester toutes les fonctionnalités :

| Champ | Valeur |
|-------|--------|
| Username | `demo` |
| Password | `demo1234` |

Le compte contient **20 trades** couvrant 3 mois sur 4 symboles : EURUSD, GBPUSD, XAUUSD, USDJPY. Ils incluent un mix de trades gagnants et perdants pour illustrer tous les graphiques et déclencher certains insights (ex. revenge trading détecté).

---

## 14. Déploiement

L'application est déployée sur **Replit** via le système de publishing natif.

- **Production** : domaine `.replit.app` (HTTPS automatique)
- **Base de données** : PostgreSQL Replit (variable `DATABASE_URL` injectée automatiquement)
- **Secret session** : variable `SESSION_SECRET` configurée dans les secrets Replit
- **Routing** : proxy inversé Replit → `/api` → api-server, `/` → trading-journal (Vite SPA)

### Workflows configurés

| Workflow | Commande |
|----------|----------|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Trading Journal (web) | `pnpm --filter @workspace/trading-journal run dev` |

### Prérequis pour le bridge MT5

- Windows avec **MetaTrader 5** installé et connecté à un compte
- Python 3.8+
- `pip install MetaTrader5 requests`
- Connexion internet pour atteindre l'API

---

*Documentation générée le 2 mai 2026 — Jnayen Trading v1.0*
