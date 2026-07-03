# 01 · Architecture technique — MultiOutils

## 1. Vue d'ensemble

Trois briques dans **un seul dépôt GitHub public** (monorepo) :

```
┌─────────────────┐  push captures (API + jeton)   ┌──────────────────┐
│  desktop-app    │ ──────────────────────────────▶ │     server       │
│  (Electron/TS)  │                                 │ (Express+SQLite) │
│  capture/édit./ │                                 │  API + web UI    │
│  bibliothèque   │                                 └────────┬─────────┘
└───────▲─────────┘                                          │ HTTPS
        │ WebSocket/HTTP localhost                           │ (Cloudflare Tunnel)
┌───────┴─────────┐                                 ┌────────▼─────────┐
│ streamdeck-plugin│                                │  navigateur      │
│  (JS/HTML Elgato)│                                │  (à distance)    │
└─────────────────┘                                 └──────────────────┘
```

- L'app fonctionne **seule** (le serveur est optionnel).
- L'app **pousse** vers le serveur ; on **consulte** à distance via le web.
- Le plugin Stream Deck parle **uniquement à l'app locale**.

---

## 2. Le système de modules (point crucial)

> La capture d'écran est **le premier outil**, pas le seul. L'app est un **hôte** qui
> charge des **modules (outils)**. On doit pouvoir ajouter un outil **sans toucher aux
> autres**.

### 2.1 Contrat d'un module (TypeScript)

```ts
export interface ToolModule {
  id: string;                 // "screenshot", "color-picker", ...
  name: string;               // libellé affiché
  icon: string;               // nom d'icône
  order: number;              // position dans la barre latérale
  // Cycle de vie
  activate(ctx: HostContext): void | Promise<void>;
  deactivate?(): void;
  // UI
  renderPanel(): ReactNode;   // vue principale de l'outil
  // Optionnel : contributions à l'hôte
  trayMenu?(): TrayMenuItem[];        // entrées ajoutées au menu du tray
  globalShortcuts?(): ShortcutDef[];  // raccourcis globaux de l'outil
  settingsPanel?(): ReactNode;        // page de réglages de l'outil
}
```

```ts
export interface HostContext {
  storage: StorageApi;   // accès à la base + fichiers
  notify(msg: string): void;
  registerShortcut(def: ShortcutDef): void;
  openTool(id: string): void;
  settings: SettingsApi;
}
```

- **Enregistrement** : chaque module s'inscrit dans un **registre** au démarrage. L'hôte
  lit le registre pour construire la barre latérale, le menu du tray et les raccourcis.
- **Isolation** : un module ne référence jamais un autre module directement ; tout passe
  par `HostContext`.
- **Ajout d'un outil** = créer un dossier `modules/<mon-outil>/`, exporter un `ToolModule`,
  l'ajouter au registre. Rien d'autre à modifier.

Modules prévus : `screenshot` (MVP), `color-picker` (Bonus), `ocr` (Bonus), puis d'autres.

---

## 3. Arborescence du monorepo

```
MultiOutils/
├── CDC.md · CDC.html
├── docs/                         # cette documentation
├── install/                      # scripts d'installation serveur (Proxmox, Docker)
├── package.json                  # workspaces (npm/pnpm)
│
├── packages/
│   └── shared/                   # types partagés app ↔ serveur (TS)
│       └── src/types.ts          # Capture, Folder, Tag, ApiContracts...
│
├── desktop-app/
│   ├── src/
│   │   ├── main/                 # process principal Electron (Node)
│   │   │   ├── index.ts          # création fenêtre, tray, autostart
│   │   │   ├── shortcuts.ts      # raccourcis globaux
│   │   │   ├── capture/          # capture native (plein écran/zone/fenêtre)
│   │   │   ├── storage/          # SQLite (better-sqlite3) + fichiers
│   │   │   ├── updater.ts        # electron-updater (GitHub)
│   │   │   ├── remote.ts         # client API du serveur
│   │   │   └── local-service.ts  # service localhost pour Stream Deck
│   │   ├── preload/              # pont contextBridge (IPC sécurisé)
│   │   ├── renderer/             # UI (React + thème)
│   │   │   ├── host/             # coquille : barre latérale, tray, réglages
│   │   │   └── modules/          # LES OUTILS
│   │   │       ├── screenshot/   # module capture (galerie + éditeur)
│   │   │       ├── color-picker/ # bonus
│   │   │       └── ocr/          # bonus
│   │   └── registry.ts           # enregistrement des modules
│   ├── electron-builder.yml      # build .exe + config publish GitHub
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── index.ts              # bootstrap Express
│   │   ├── db.ts                 # SQLite
│   │   ├── auth.ts               # sessions + jetons d'API
│   │   ├── routes/               # /api/... (voir 04-api-serveur.md)
│   │   ├── web/                  # interface web (galerie distante)
│   │   └── update.ts             # bouton "mettre à jour le site"
│   ├── data/                     # (créé au run) images + base SQLite
│   └── package.json
│
├── streamdeck-plugin/            # plugin Elgato (manifest + actions)
│
└── .github/workflows/
    ├── build-desktop.yml         # build .exe à chaque tag → GitHub Release
    └── ci.yml                    # lint + tests
```

---

## 4. Modèle de données

### 4.1 Base locale de l'app (SQLite, via better-sqlite3)

```sql
CREATE TABLE captures (
  id            TEXT PRIMARY KEY,           -- uuid
  filename      TEXT NOT NULL,              -- nom affiché
  path          TEXT NOT NULL,              -- chemin du fichier image
  created_at    TEXT NOT NULL,              -- ISO 8601
  width         INTEGER, height INTEGER,
  size_bytes    INTEGER,
  folder_id     TEXT REFERENCES folders(id),
  favorite      INTEGER NOT NULL DEFAULT 0, -- 0/1
  annotations   TEXT,                       -- JSON des objets (ré-édition)
  remote_state  TEXT NOT NULL DEFAULT 'none', -- none|sent|error
  remote_id     TEXT,                       -- id côté serveur si envoyée
  deleted_at    TEXT                        -- corbeille (NULL = actif)
);

CREATE TABLE folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES folders(id),   -- imbrication
  color      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE capture_tags (
  capture_id TEXT REFERENCES captures(id),
  tag_id     TEXT REFERENCES tags(id),
  PRIMARY KEY (capture_id, tag_id)
);

CREATE TABLE settings (               -- clé/valeur (raccourcis, options…)
  key TEXT PRIMARY KEY, value TEXT
);
```

### 4.2 Base du serveur (SQLite)

```sql
CREATE TABLE users (                 -- admin(s)
  id TEXT PRIMARY KEY, username TEXT UNIQUE,
  password_hash TEXT NOT NULL, created_at TEXT
);
CREATE TABLE api_tokens (            -- jetons pour connecter les apps
  id TEXT PRIMARY KEY, name TEXT,
  token_hash TEXT NOT NULL, created_at TEXT, last_used_at TEXT, revoked INTEGER DEFAULT 0
);
CREATE TABLE captures (              -- captures reçues
  id TEXT PRIMARY KEY, filename TEXT, path TEXT, created_at TEXT,
  width INTEGER, height INTEGER, size_bytes INTEGER,
  folder TEXT, tags TEXT             -- dossier + tags (miroir de l'app)
);
```

Les **fichiers image** sont stockés dans `server/data/uploads/` ; la base ne contient que
les métadonnées et le chemin.

---

## 5. Process Electron & IPC

- **main** (Node) : fenêtres, tray, raccourcis globaux, capture native, SQLite, updater,
  client serveur, service localhost pour Stream Deck.
- **preload** : expose une API **restreinte** au renderer via `contextBridge`
  (`window.api.*`), pas d'accès Node direct dans l'UI (`contextIsolation: true`,
  `nodeIntegration: false`).
- **renderer** (React) : l'hôte + les modules.

**Canaux IPC (exemples) :**

| Canal | Sens | Rôle |
|---|---|---|
| `capture:take` | renderer→main | déclenche une capture (`{type}`) |
| `capture:done` | main→renderer | notifie une nouvelle capture |
| `library:list` / `library:update` | renderer↔main | lire/écrire la base |
| `remote:send` | renderer→main | envoyer une capture au serveur |
| `remote:test` | renderer→main | tester la connexion serveur |
| `update:check` / `update:install` | renderer→main | mises à jour |
| `settings:get` / `settings:set` | renderer↔main | réglages |

---

## 6. Dépendances de référence (indicatif)

| Brique | Techno / librairies |
|---|---|
| App | Electron, TypeScript, React, Vite, **Konva** (canvas édition), **better-sqlite3**, **electron-updater**, electron-store, uuid |
| Capture native | API Electron (`desktopCapturer`) + complément natif Windows si besoin pour zone/fenêtre |
| Serveur | Node.js, Express, better-sqlite3, **argon2** (hash), multer (upload), helmet, express-session |
| Web UI serveur | même thème sombre (voir `../CDC.html`), responsive |
| Stream Deck | SDK Elgato (`@elgato/streamdeck`), WebSocket vers l'app |
| CI/CD | GitHub Actions + electron-builder (publish GitHub Releases) |

---

## 7. Build & distribution

- **electron-builder** produit un installeur Windows (`.exe`, NSIS) et publie les
  artefacts sur **GitHub Releases** lors d'un tag `vX.Y.Z`.
- `electron-updater` lit ces Releases pour la **mise à jour à la demande** (§5.3 de la
  spec).
- Le serveur se met à jour par `git pull` (voir `02-demarrage.md` §5).
