import { app, Menu, nativeImage, Tray } from 'electron';
import trayIconPath from '../../resources/tray.png?asset';
import type { MainHostContext, MainModuleRegistry } from './module-registry';
import { showMainWindow, toggleMainWindow } from './windows';

/**
 * Icône de la zone de notification (docs/00 §5.1) : clic gauche =
 * ouvrir/masquer, clic droit = menu construit à partir des contributions des
 * modules + des entrées fixes de l'hôte.
 */
export class TrayController {
  private tray: Tray | null = null;

  create(ctx: MainHostContext, registry: MainModuleRegistry): void {
    const icon = nativeImage.createFromPath(trayIconPath);
    this.tray = new Tray(icon);
    this.tray.setToolTip(ctx.i18n.t('tray.tooltip'));
    this.tray.on('click', () => toggleMainWindow());
    this.refresh(ctx, registry);

    ctx.events.on('tray-refresh', () => this.refresh(ctx, registry));
    ctx.events.on('tray-tooltip', (text: unknown) => {
      this.tray?.setToolTip(typeof text === 'string' ? text : ctx.i18n.t('tray.tooltip'));
    });
  }

  refresh(ctx: MainHostContext, registry: MainModuleRegistry): void {
    if (!this.tray) return;
    const { t } = ctx.i18n;
    const moduleItems = registry.trayItems(ctx);

    const template: Electron.MenuItemConstructorOptions[] = [
      ...moduleItems,
      { type: 'separator' },
      { label: t('tray.settings'), click: () => showMainWindow({ view: 'settings' }) },
      {
        label: t('tray.checkUpdates'),
        click: () => showMainWindow({ view: 'settings', section: 'updates' })
      },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => {
          app.quit();
        }
      }
    ];

    this.tray.setToolTip(t('tray.tooltip'));
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
