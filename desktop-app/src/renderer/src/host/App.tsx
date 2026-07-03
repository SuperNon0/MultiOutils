import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { AppSettings } from '../../../common/types';
import { I18nProvider } from '../i18n';
import { modules } from '../registry';
import { HostServicesContext, type HostServices } from './context';
import { FirstRunWizard } from './FirstRunWizard';
import { SettingsView } from './SettingsView';
import { Sidebar } from './Sidebar';
import type { HostContext } from './types';

interface Toast {
  id: number;
  msg: string;
}

let toastSeq = 0;

/**
 * L'HÔTE : barre latérale d'outils + panneau actif + paramètres + toasts.
 * Aucune logique de capture ici — tout vient des modules (docs/00 §0.1).
 */
export function App(): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [version, setVersion] = useState('0.0.0');
  const [active, setActive] = useState<string>(modules[0]?.id ?? 'settings');
  const [settingsSection, setSettingsSection] = useState<string | undefined>();
  const [navCaptureId, setNavCaptureId] = useState<string | null>(null);
  const [navAction, setNavAction] = useState<'select' | 'edit'>('select');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const settingsRef = useRef<AppSettings | null>(null);
  const activatedRef = useRef(false);
  settingsRef.current = settings;

  const notify = useCallback((msg: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
    void window.api.system.version().then(setVersion);
    const unsubSettings = window.api.settings.onChanged(setSettings);
    const unsubNav = window.api.host.onNavigate((nav) => {
      if (nav.view === 'settings') {
        setActive('settings');
        setSettingsSection(nav.section);
      } else {
        setActive(nav.toolId);
        if (nav.captureId) {
          setNavCaptureId(nav.captureId);
          setNavAction(nav.action ?? 'select');
        }
      }
    });
    return () => {
      unsubSettings();
      unsubNav();
    };
  }, []);

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

  const services = useMemo<HostServices>(
    () => ({
      notify,
      openTool: setActive,
      navCaptureId,
      navAction,
      consumeNavCapture: () => setNavCaptureId(null)
    }),
    [notify, navCaptureId, navAction]
  );

  if (!settings) return null;

  const update = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const next = await window.api.settings.set(patch);
    setSettings(next);
    return next;
  };

  const activeModule = modules.find((m) => m.id === active);

  return (
    <I18nProvider lang={settings.language}>
      <HostServicesContext.Provider value={services}>
        {!settings.firstRunDone ? (
          <FirstRunWizard settings={settings} onDone={update} />
        ) : (
          <div className="app-shell">
            <Sidebar
              modules={modules}
              active={active}
              version={version}
              onSelect={(id) => {
                setActive(id);
                if (id !== 'settings') setSettingsSection(undefined);
              }}
            />
            <main className="content">
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
            </main>
          </div>
        )}
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              {toast.msg}
            </div>
          ))}
        </div>
      </HostServicesContext.Provider>
    </I18nProvider>
  );
}
