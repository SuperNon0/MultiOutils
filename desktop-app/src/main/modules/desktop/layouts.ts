/**
 * Dispositions du module Bureau (étape 3) :
 * - une disposition par configuration d'écrans, rétablie au branchement ;
 * - instantanés nommés, sauvegarde quotidienne (7 jours), export / import ;
 * - « annuler » la dernière restauration.
 */
import { app, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyLayout,
  layoutOf,
  parseBundle,
  pruneDaily,
  screensKey,
  type DesktopBundle,
  type DesktopPage,
  type DisplayLike,
  type Layout,
  type Rule,
  type Snapshot,
  type Zone
} from '../../../common/desktop';

const LAYOUTS_KEY = 'desktop.layouts';
const SNAPSHOTS_KEY = 'desktop.snapshots';
const UNDO_KEY = 'desktop.layoutUndo';

export interface LayoutDeps {
  kvGet<T>(key: string, fallback: T): T;
  kvSet(key: string, value: unknown): void;
  zones(): Zone[];
  pages(): DesktopPage[];
  rules(): Rule[];
  /** Remplace zones et pages (et règles si fournies). */
  restore(bundle: DesktopBundle): void;
}

export interface SnapshotInfo {
  id: string;
  name: string;
  at: number;
  type: Snapshot['type'];
  zones: number;
}

export function createLayoutStore(deps: LayoutDeps) {
  let layouts = deps.kvGet<Record<string, Layout>>(LAYOUTS_KEY, {});
  let snapshots = deps.kvGet<Snapshot[]>(SNAPSHOTS_KEY, []).filter((s) => s && s.bundle && Array.isArray(s.bundle.zones));
  let currentKey = '';

  const bundle = (withRules = false): DesktopBundle => ({
    app: 'MultiOutils',
    kind: 'desktop-layout',
    version: 1,
    at: Date.now(),
    zones: deps.zones(),
    pages: deps.pages(),
    rules: withRules ? deps.rules() : undefined
  });
  const saveSnapshots = (): void => deps.kvSet(SNAPSHOTS_KEY, snapshots);
  const info = (s: Snapshot): SnapshotInfo => ({ id: s.id, name: s.name, at: s.at, type: s.type, zones: s.bundle.zones.length });

  /** Avant toute restauration : on garde de quoi revenir en arrière. */
  const keepUndo = (): void => deps.kvSet(UNDO_KEY, bundle(true));
  const restore = (b: DesktopBundle): void => {
    keepUndo();
    deps.restore(b);
  };

  return {
    /* -------- une disposition par configuration d'écrans */
    setScreens(displays: DisplayLike[]): void {
      currentKey = screensKey(displays);
    },
    /** Note les positions actuelles pour la configuration d'écrans en cours. */
    remember(zones: Zone[]): void {
      if (!currentKey) return;
      layouts[currentKey] = layoutOf(zones);
      // garder la taille raisonnable : 12 configurations au plus
      const keys = Object.keys(layouts);
      if (keys.length > 12) delete layouts[keys[0]];
      deps.kvSet(LAYOUTS_KEY, layouts);
    },
    /**
     * Les écrans ont changé : renvoie les zones replacées selon la disposition
     * connue pour la nouvelle configuration (null si inconnue ou inchangée).
     */
    screensChanged(displays: DisplayLike[], zones: Zone[]): Zone[] | null {
      const key = screensKey(displays);
      if (key === currentKey) return null;
      currentKey = key;
      const known = layouts[key];
      return known ? applyLayout(zones, known) : null;
    },
    forgetLayouts(): void {
      layouts = {};
      deps.kvSet(LAYOUTS_KEY, layouts);
    },

    /* -------- instantanés et sauvegardes */
    list(): SnapshotInfo[] {
      return [...snapshots].sort((a, b) => b.at - a.at).map(info);
    },
    save(name: string): SnapshotInfo {
      const s: Snapshot = { id: randomUUID(), name: name.trim().slice(0, 60) || 'Instantané', at: Date.now(), type: 'manual', bundle: bundle(false) };
      snapshots.push(s);
      saveSnapshots();
      return info(s);
    },
    rename(id: string, name: string): void {
      const s = snapshots.find((o) => o.id === id);
      if (!s || !name.trim()) return;
      s.name = name.trim().slice(0, 60);
      saveSnapshots();
    },
    remove(id: string): void {
      snapshots = snapshots.filter((o) => o.id !== id);
      saveSnapshots();
    },
    restore(id: string): boolean {
      const s = snapshots.find((o) => o.id === id);
      if (!s) return false;
      restore(s.bundle);
      return true;
    },
    /** Revient à l'état d'avant la dernière restauration ou importation. */
    undo(): boolean {
      const prev = parseBundle(deps.kvGet<unknown>(UNDO_KEY, null));
      if (!prev) return false;
      deps.kvSet(UNDO_KEY, null);
      deps.restore(prev);
      return true;
    },
    /** Une sauvegarde par jour, les 7 derniers jours. */
    daily(): void {
      const today = new Date().toISOString().slice(0, 10);
      const has = snapshots.some((s) => s.type === 'daily' && new Date(s.at).toISOString().slice(0, 10) === today);
      if (!has && deps.zones().length > 0) {
        snapshots.push({ id: randomUUID(), name: today, at: Date.now(), type: 'daily', bundle: bundle(true) });
      }
      snapshots = pruneDaily(snapshots, 7);
      saveSnapshots();
    },

    /* -------- export / import */
    async exportFile(withRules: boolean): Promise<string | null> {
      const res = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `MultiOutils-bureau-${new Date().toISOString().slice(0, 10)}.json`),
        filters: [{ name: 'MultiOutils', extensions: ['json'] }]
      });
      if (res.canceled || !res.filePath) return null;
      await fs.promises.writeFile(res.filePath, JSON.stringify(bundle(withRules), null, 2), 'utf8');
      return res.filePath;
    },
    async importFile(): Promise<'ok' | 'cancel' | 'invalid'> {
      const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'MultiOutils', extensions: ['json'] }] });
      if (res.canceled || !res.filePaths[0]) return 'cancel';
      let parsed: DesktopBundle | null = null;
      try {
        parsed = parseBundle(JSON.parse(await fs.promises.readFile(res.filePaths[0], 'utf8')));
      } catch {
        parsed = null;
      }
      if (!parsed) return 'invalid';
      restore(parsed);
      return 'ok';
    }
  };
}

export type LayoutStore = ReturnType<typeof createLayoutStore>;
