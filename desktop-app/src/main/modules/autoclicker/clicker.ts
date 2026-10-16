import type { AutoclickButton } from '../../../common/types';

/**
 * Clic système RÉEL sous Windows via `user32!mouse_event`, appelé par FFI
 * (koffi — binaire précompilé, aucune recompilation node-gyp, un seul binaire
 * par plateforme compatible Node ET Electron).
 *
 * Chargement PARESSEUX et DÉGRADATION gracieuse : si la plateforme n'est pas
 * Windows ou si le binaire natif est indisponible, l'autoclic se signale
 * « indisponible » — il ne fait JAMAIS planter l'app (docs/00 §0.6).
 *
 * Le clic est émis à la position actuelle du curseur (on n'envoie pas de
 * déplacement), ce qui est le comportement attendu d'un autoclic.
 */

// Drapeaux mouse_event (winuser.h) : bas + haut = un clic complet.
const BTN: Record<AutoclickButton, { down: number; up: number }> = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 }
};

type MouseEventFn = (
  flags: number,
  dx: number,
  dy: number,
  data: number,
  extra: number
) => void;

let mouseEvent: MouseEventFn | null = null;
let initPromise: Promise<void> | null = null;
let initError: string | null = null;

async function init(): Promise<void> {
  if (process.platform !== 'win32') {
    initError = 'platform';
    return;
  }
  try {
    // import paresseux (comme l'OCR avec tesseract) : koffi n'est chargé qu'au
    // premier démarrage de l'autoclic.
    const mod = (await import('koffi')) as unknown as {
      default?: unknown;
      load?: unknown;
    };
    // koffi exporte en CommonJS (`export =`) : selon l'interop, l'objet est
    // sur `.default` ou directement le module.
    const koffi = (mod.default ?? mod) as {
      load(name: string): { func(prototype: string): MouseEventFn };
    };
    const user32 = koffi.load('user32.dll');
    mouseEvent = user32.func(
      'void __stdcall mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, uint32 dwData, size_t dwExtraInfo)'
    );
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    mouseEvent = null;
  }
}

/** Prépare le clic natif (idempotent). Retourne true s'il est disponible. */
export async function ensureClicker(): Promise<boolean> {
  if (!initPromise) initPromise = init();
  await initPromise;
  return mouseEvent !== null;
}

export function clickerAvailable(): boolean {
  return mouseEvent !== null;
}

export function clickerError(): string | null {
  return initError;
}

/** Émet un clic (ou double-clic) du bouton demandé à la position du curseur. */
export function performClick(button: AutoclickButton, double: boolean): void {
  const fn = mouseEvent;
  if (!fn) return;
  const b = BTN[button];
  fn(b.down, 0, 0, 0, 0);
  fn(b.up, 0, 0, 0, 0);
  if (double) {
    fn(b.down, 0, 0, 0, 0);
    fn(b.up, 0, 0, 0, 0);
  }
}
