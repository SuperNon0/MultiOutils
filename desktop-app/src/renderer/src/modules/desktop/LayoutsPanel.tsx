import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DesktopState } from '../../../../common/desktop';
import { Aide, ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';

type SnapInfo = Awaited<ReturnType<typeof window.api.desktop.layout.list>>[number];

/** Pages : pastilles cliquables, ajout, menu (renommer, déplacer, supprimer). */
export function PagesBar({ state }: { state: DesktopState }): ReactNode {
  const { t } = useI18n();
  const { pages, activePage } = state.settings;
  const menu = (id: string, anchor: HTMLElement): void => {
    const i = pages.findIndex((p) => p.id === id);
    const page = pages[i];
    if (!page) return;
    ui.menu(
      anchor,
      [
        {
          icone: 'edit',
          texte: t('desktop.menu.rename'),
          action: async () => {
            const name = await ui.demander(t('desktop.page.rename'), { valeur: page.name });
            if (name && name.trim()) void window.api.desktop.page.rename(id, name.trim());
          }
        },
        ...(i > 0 ? [{ icone: 'chevl', texte: t('desktop.tab.left'), action: () => void window.api.desktop.page.move(id, -1) }] : []),
        ...(i < pages.length - 1 ? [{ icone: 'chev', texte: t('desktop.tab.right'), action: () => void window.api.desktop.page.move(id, 1) }] : []),
        null,
        {
          icone: 'trash',
          texte: t('desktop.page.delete'),
          danger: true,
          action: async () => {
            if (pages.length < 2) return;
            const ok = await ui.confirmer(t('desktop.page.deleteConfirm', { name: page.name }), { ok: t('desktop.page.delete'), danger: true });
            if (ok) void window.api.desktop.page.delete(id);
          }
        }
      ],
      { titre: page.name }
    );
  };
  return (
    <div className="bz-pages" role="tablist" aria-label={t('desktop.page.label')}>
      {pages.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === activePage}
          className={`chip${p.id === activePage ? ' on' : ''}`}
          onClick={() => void window.api.desktop.page.switch(p.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            menu(p.id, e.currentTarget);
          }}
        >
          {p.name}
          <span className="n">{state.zones.filter((z) => !z.tabOf && (z.allPages || (z.pageId || pages[0].id) === p.id)).length}</span>
        </button>
      ))}
      <button
        className="ib"
        style={{ width: 30, height: 30 }}
        aria-label={t('desktop.page.add')}
        title={t('desktop.page.add')}
        onClick={async () => {
          const name = await ui.demander(t('desktop.page.add'), { placeholder: t('desktop.page.namePh') });
          if (name !== null) void window.api.desktop.page.add(name);
        }}
      >
        <Icon name="plus" size={16} />
      </button>
      {pages.length > 1 && (
        <button
          className="ib"
          style={{ width: 30, height: 30 }}
          aria-label={t('desktop.page.menu')}
          onClick={(e) => menu(activePage, e.currentTarget)}
        >
          <Icon name="dots" size={16} />
        </button>
      )}
    </div>
  );
}

/** Onglet « Dispositions » : écrans, instantanés, sauvegardes, fichier. */
export function LayoutsTab({ state }: { state: DesktopState }): ReactNode {
  const { t, lang } = useI18n();
  const [list, setList] = useState<SnapInfo[] | null>(null);
  const reload = useCallback(() => void window.api.desktop.layout.list().then(setList), []);
  useEffect(reload, [reload]);

  const when = (ms: number): string =>
    new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const undoToast = (msg: string): void =>
    ui.toast(msg, {
      annuler: async () => {
        await window.api.desktop.layout.undo();
        reload();
      },
      duree: 8000
    });
  const restore = async (s: SnapInfo): Promise<void> => {
    const ok = await ui.confirmer(t('desktop.layout.restoreConfirm', { name: s.name }), { ok: t('desktop.layout.restore') });
    if (!ok) return;
    if (await window.api.desktop.layout.restore(s.id)) undoToast(t('desktop.layout.restored', { name: s.name }));
  };
  const manual = (list ?? []).filter((s) => s.type === 'manual');
  const daily = (list ?? []).filter((s) => s.type === 'daily');

  const row = (s: SnapInfo): ReactNode => (
    <div key={s.id} className="li">
      <span className="li-ic">
        <Icon name={s.type === 'daily' ? 'clock' : 'bookmark'} size={18} />
      </span>
      <span className="tx" style={{ flex: 1, minWidth: 0 }}>
        <b className="br-name">{s.type === 'daily' ? when(s.at) : s.name}</b>
        <span className="br-sub">{t('desktop.layout.sub', { n: s.zones, at: when(s.at) })}</span>
      </span>
      <button className="btn xs" onClick={() => void restore(s)}>
        <Icon name="undo" size={14} />
        {t('desktop.layout.restore')}
      </button>
      {s.type === 'manual' && (
        <button
          className="ib"
          style={{ width: 32, height: 32 }}
          aria-label={t('desktop.zone.menu')}
          onClick={(e) =>
            ui.menu(
              e.currentTarget,
              [
                {
                  icone: 'edit',
                  texte: t('desktop.menu.rename'),
                  action: async () => {
                    const name = await ui.demander(t('desktop.menu.rename'), { valeur: s.name });
                    if (name && name.trim()) {
                      await window.api.desktop.layout.rename(s.id, name.trim());
                      reload();
                    }
                  }
                },
                null,
                {
                  icone: 'trash',
                  texte: t('desktop.menu.delete'),
                  danger: true,
                  action: async () => {
                    await window.api.desktop.layout.delete(s.id);
                    reload();
                  }
                }
              ],
              { titre: s.name }
            )
          }
        >
          <Icon name="dots" size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('desktop.layout.intro')}
        </p>
        <button
          className="btn sm pri"
          onClick={async () => {
            const name = await ui.demander(t('desktop.layout.save'), { placeholder: t('desktop.layout.namePh') });
            if (name === null) return;
            await window.api.desktop.layout.save(name);
            reload();
            ui.toast(t('desktop.layout.saved'));
          }}
        >
          <Icon name="bookmark" size={16} />
          {t('desktop.layout.save')}
        </button>
      </div>

      <div className="lbl-mono" style={{ margin: '4px 0 8px' }}>
        {t('desktop.layout.snapshots')}
      </div>
      {manual.length === 0 ? <p className="muted petit">{t('desktop.layout.none')}</p> : <div className="liste-r">{manual.map(row)}</div>}

      <div className="lbl-mono" style={{ margin: '18px 0 8px' }}>
        {t('desktop.layout.daily')}
      </div>
      {daily.length === 0 ? <p className="muted petit">{t('desktop.layout.noDaily')}</p> : <div className="liste-r">{daily.map(row)}</div>}

      <div className="lbl-mono" style={{ margin: '18px 0 8px' }}>
        {t('desktop.layout.screens')}
      </div>
      <div className="carte" style={{ padding: '4px 14px' }}>
        <RegSwitch
          titre={t('desktop.layout.perScreens')} aide={<Aide titre={t('desktop.layout.perScreens')} texte={t('desktop.layout.perScreens.help')} />}
          sous={t('desktop.layout.perScreensSub')}
          checked={state.settings.layoutPerScreens}
          onChange={(v) => void window.api.desktop.setSettings({ layoutPerScreens: v })}
        />
      </div>
      <div className="br-top" style={{ marginTop: 10 }}>
        <button
          className="btn sm"
          disabled={state.displays.length < 2}
          title={state.displays.length < 2 ? t('desktop.layout.oneScreen') : undefined}
          onClick={async () => {
            await window.api.desktop.layout.save(t('desktop.layout.beforeSwap'));
            await window.api.desktop.layout.swapScreens();
            reload();
            ui.toast(t('desktop.layout.swapped'));
          }}
        >
          <Icon name="rotate" size={16} />
          {t('desktop.layout.swap')}
        </button>
        <button
          className="btn sm"
          onClick={async () => {
            const file = await window.api.desktop.layout.exportFile(true);
            if (file) ui.toast(t('desktop.layout.exported'));
          }}
        >
          <Icon name="download" size={16} />
          {t('desktop.layout.export')}
        </button>
        <button
          className="btn sm"
          onClick={async () => {
            const ok = await ui.confirmer(t('desktop.layout.importConfirm'), { ok: t('desktop.layout.import') });
            if (!ok) return;
            const res = await window.api.desktop.layout.importFile();
            if (res === 'invalid') ui.toast(t('desktop.layout.invalid'), { erreur: true });
            else if (res === 'ok') undoToast(t('desktop.layout.imported'));
          }}
        >
          <Icon name="upload" size={16} />
          {t('desktop.layout.import')}
        </button>
      </div>
    </div>
  );
}
