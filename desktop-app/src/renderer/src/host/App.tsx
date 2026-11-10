import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { AppSettings, NavAction } from '../../../common/types';
import { EncreLayer, ui, type PaletteItem } from '../encre/ui';
import { I18nProvider, translate } from '../i18n';
import { modules } from '../registry';
import { HostServicesContext, type HostServices } from './context';
import { FirstRunWizard } from './FirstRunWizard';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { settingsSections, SettingsView } from './SettingsView';
import { Brand, Sidebar } from './Sidebar';
import type { HostContext } from './types';

/** Onglets de la barre flottante (fenêtre étroite) : 3 outils + Réglages + Plus. */
const TAB_TOOLS = 3;

/**
 * L'HÔTE : menu de gauche (design « encre »), panneau actif, réglages,
 * messages et recherche rapide (Ctrl K). Aucune logique de capture ici — tout
 * vient des modules (docs/00 §0.1).
 */
export function App(): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [version, setVersion] = useState('0.0.0');
  const [active, setActive] = useState<string>(modules[0]?.id ?? 'settings');
  const [settingsSection, setSettingsSection] = useState<{ id: string; n: number } | undefined>();
  const [navCaptureId, setNavCaptureId] = useState<string | null>(null);
  const [navAction, setNavAction] = useState<NavAction>('select');
  const [plusOpen, setPlusOpen] = useState(false);
  const settingsRef = useRef<AppSettings | null>(null);
  const activatedRef = useRef(false);
  settingsRef.current = settings;

  const notify = useCallback((msg: string) => ui.toast(msg), []);

  const openSettings = useCallback((section?: string) => {
    setActive('settings');
    setSettingsSection(section ? { id: section, n: Date.now() } : undefined);
  }, []);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
    void window.api.system.version().then(setVersion);
    const unsubSettings = window.api.settings.onChanged(setSettings);
    const unsubNav = window.api.host.onNavigate((nav) => {
      if (nav.view === 'settings') {
        openSettings(nav.section);
      } else if (nav.toolId === 'ocr') {
        // Ancien onglet « Extraire le texte (OCR) » (lanceur, raccourcis) :
        // l'OCR vit désormais dans la bibliothèque des captures → on ouvre la
        // feuille « Extraire le texte » sur la dernière capture.
        setActive('screenshot');
        setNavCaptureId(nav.captureId ?? 'latest');
        setNavAction('ocr');
      } else {
        setActive(nav.toolId);
        if (nav.captureId) {
          setNavCaptureId(nav.captureId);
          setNavAction(nav.action ?? 'select');
        }
      }
    });
    // lien interne entre deux pages des Réglages (ex. Lanceur → Home Assistant)
    const onOpenSettings = (e: Event): void => openSettings((e as CustomEvent<string>).detail);
    window.addEventListener('mo:open-settings', onOpenSettings);
    return () => {
      unsubSettings();
      unsubNav();
      window.removeEventListener('mo:open-settings', onOpenSettings);
    };
  }, [openSettings]);

  // Activation des modules (une seule fois, quand les réglages sont chargés)
  useEffect(() => {
    if (!settings || activatedRef.current) return;
    activatedRef.current = true;
    const hostCtx: HostContext = {
      storage: window.api.library,
      notify,
      registerShortcut: (def) => void window.api.shortcuts.set(def.id, def.accelerator),
      openTool: setActive,
      settings: {
        get: () => settingsRef.current as AppSettings,
        set: (patch) => window.api.settings.set(patch)
      }
    };
    for (const module of modules) void module.activate(hostCtx);
  }, [settings, notify]);

  // Recherche rapide (Ctrl K) : outils, sections des réglages, actions de capture.
  const lang = settings?.language ?? 'fr';
  useEffect(() => {
    const t = (key: string, vars?: Record<string, string | number>): string =>
      translate(lang, key, vars);
    const items: PaletteItem[] = [
      ...modules.map((m) => ({
        id: `tool:${m.id}`,
        groupe: t('palette.group.tools'),
        titre: t(m.name),
        icone: m.icon,
        action: () => setActive(m.id)
      })),
      ...settingsSections(modules).map((s) => ({
        id: `settings:${s.id}`,
        groupe: t('palette.group.settings'),
        titre: t(s.title),
        sous: t(s.sub),
        icone: s.icon,
        mots: s.keywords.map((k) => t(k)).join(' '),
        action: () => openSettings(s.id)
      })),
      ...(['fullscreen', 'region', 'window', 'delayed'] as const).map((type) => ({
        id: `capture:${type}`,
        groupe: t('palette.group.actions'),
        titre:
          type === 'delayed'
            ? t('tray.capture.delayed', { s: settingsRef.current?.delayedSeconds ?? 5 })
            : t(`tray.capture.${type}`),
        icone: type === 'delayed' ? 'clock' : type,
        action: () => void window.api.capture.take(type)
      }))
    ];
    ui.palette.setItems(items);
  }, [lang, openSettings]);

  const services = useMemo<HostServices>(
    () => ({
      notify,
      openTool: setActive,
      openSettings,
      navCaptureId,
      navAction,
      consumeNavCapture: () => setNavCaptureId(null)
    }),
    [notify, openSettings, navCaptureId, navAction]
  );

  if (!settings) return null;

  const update = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const next = await window.api.settings.set(patch);
    setSettings(next);
    return next;
  };

  const activeModule = modules.find((m) => m.id === active);
  const select = (id: string): void => {
    setPlusOpen(false);
    if (id === 'settings') openSettings();
    else setActive(id);
  };
  const tabTools = modules.slice(0, TAB_TOOLS);
  const moreTools = modules.slice(TAB_TOOLS);
  const t = (key: string): string => translate(lang, key);

  return (
    <I18nProvider lang={settings.language}>
      <HostServicesContext.Provider value={services}>
        {!settings.firstRunDone ? (
          <FirstRunWizard settings={settings} onDone={update} />
        ) : (
          <>
            <div className="app">
              <Sidebar modules={modules} active={active} version={version} onSelect={select} />
              <div className="main">
                {/* Barre du haut : fenêtre étroite uniquement (le menu de gauche la remplace). */}
                <header className="top">
                  <Brand />
                  <span className="esp" />
                  <button
                    type="button"
                    className="ib"
                    aria-label={t('palette.label')}
                    onClick={() => ui.palette.open()}
                  >
                    <Icon name="search" size={20} />
                  </button>
                </header>
                <main className={`pages${active === 'settings' ? ' p-reglages' : ''}`}>
                  <section className="page on" key={active} data-page={active}>
                    {active === 'settings' ? (
                      <SettingsView
                        settings={settings}
                        version={version}
                        section={settingsSection}
                        modules={modules}
                        update={update}
                      />
                    ) : (
                      activeModule?.renderPanel()
                    )}
                  </section>
                </main>
              </div>
            </div>

            {/* Barre d'onglets flottante en verre : fenêtre étroite (< 1000 px). */}
            <nav className="tabbar" aria-label={t('sidebar.tools')}>
              {tabTools.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`tab${active === m.id ? ' on' : ''}`}
                  aria-current={active === m.id ? 'page' : undefined}
                  onClick={() => select(m.id)}
                >
                  <span className="ti">
                    <Icon name={m.icon} size={22} />
                  </span>
                  {t(m.name)}
                </button>
              ))}
              <button
                type="button"
                className={`tab${active === 'settings' ? ' on' : ''}`}
                onClick={() => select('settings')}
              >
                <span className="ti">
                  <Icon name="gear" size={22} />
                </span>
                {t('sidebar.settings')}
              </button>
              <button
                type="button"
                className={`tab${moreTools.some((m) => m.id === active) ? ' on' : ''}`}
                aria-haspopup="dialog"
                onClick={() => setPlusOpen(true)}
              >
                <span className="ti">
                  <Icon name="dots" size={22} />
                </span>
                {t('ui.more')}
              </button>
            </nav>
            {plusOpen && (
              <Feuille titre={t('ui.more')} onClose={() => setPlusOpen(false)}>
                <div className="q-tuiles plus-t">
                  {moreTools.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`qt${active === m.id ? ' on' : ''}`}
                      onClick={() => select(m.id)}
                    >
                      <Icon name={m.icon} size={22} />
                      {t(m.name)}
                    </button>
                  ))}
                </div>
                <button type="button" className="q-ext" onClick={() => {
                  setPlusOpen(false);
                  ui.palette.open();
                }}>
                  <Icon name="search" />
                  <span>{t('palette.label')}</span>
                </button>
              </Feuille>
            )}
          </>
        )}
        <EncreLayer palette={Boolean(settings.firstRunDone)} />
      </HostServicesContext.Provider>
    </I18nProvider>
  );
}
