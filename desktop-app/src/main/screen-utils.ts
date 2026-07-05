import { BrowserWindow, desktopCapturer, screen } from 'electron';
import type { Display, NativeImage } from 'electron';

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Taille physique (px réels) d'un écran, mise à l'échelle DPI comprise. */
export function physicalSize(display: Display): { width: number; height: number } {
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  };
}

/** Capture un écran donné à sa résolution native. */
export async function captureDisplay(display: Display): Promise<NativeImage> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: physicalSize(display)
  });
  const byId = sources.find((s) => s.display_id === String(display.id));
  if (byId) return byId.thumbnail;
  // Repli : certains environnements ne renseignent pas display_id — on
  // s'appuie alors sur l'ordre des écrans.
  const index = screen.getAllDisplays().findIndex((d) => d.id === display.id);
  const source = sources[index] ?? sources[0];
  if (!source) throw new Error('no screen source available');
  return source.thumbnail;
}

/**
 * Masque les fenêtres visibles de l'app avant une capture (pour ne pas se
 * capturer soi-même) et rend une fonction qui les réaffiche.
 */
export async function hideAppWindows(): Promise<() => void> {
  const visible = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isVisible()
  );
  for (const win of visible) win.hide();
  if (visible.length > 0) await delay(200);
  return () => {
    for (const win of visible) {
      if (!win.isDestroyed()) win.showInactive();
    }
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
