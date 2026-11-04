import { useEffect, useState, type ReactNode } from 'react';
import type {
  AiConfig,
  AiProviderId,
  AiSimpleResult,
  AppSettings
} from '../../../common/types';
import { Aide, ui } from '../encre/ui';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { RegLigne, RegSec } from './reglages';

/** Langues proposées pour la traduction (champ libre accepté en plus). */
export const COMMON_TARGET_LANGS = [
  'Français',
  'English',
  'Español',
  'Deutsch',
  'Italiano',
  'Português',
  'Nederlands',
  'Polski',
  'Русский',
  'Türkçe',
  'العربية',
  '中文',
  '日本語',
  '한국어'
];

/**
 * Réglages → Traduction IA : fournisseur (Claude, OpenAI, Gemini), modèle,
 * langue cible et clé API. La clé est envoyée UNE fois au process main, qui
 * la chiffre (safeStorage) : elle n'est jamais relue en clair ici.
 */
export function TraductionSection({
  settings,
  update
}: {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t } = useI18n();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiSimpleResult | null>(null);
  const [target, setTarget] = useState(settings.aiTargetLang);
  const providerId = settings.aiProvider;
  const [modelInput, setModelInput] = useState(settings.aiModels[providerId] ?? '');

  const reload = (): Promise<void> => window.api.ai.getConfig().then(setConfig);
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    setModelInput(settings.aiModels[providerId] ?? '');
    setKeyInput('');
    setResult(null);
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return null;
  const provider = config.providers.find((p) => p.id === providerId) ?? config.providers[0];
  const hasKey = config.hasKey[provider.id];
  const model = settings.aiModels[provider.id] || provider.defaultModel;

  const setModel = (id: string): void => {
    void update({ aiModels: { ...settings.aiModels, [provider.id]: id } });
  };

  const saveKey = async (): Promise<boolean> => {
    if (!keyInput.trim()) return true;
    const res = await window.api.ai.setKey(provider.id, keyInput);
    if (!res.ok) {
      setResult(res);
      return false;
    }
    setKeyInput('');
    await reload();
    ui.toast(t('ai.key.saved'));
    return true;
  };

  const test = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    if (await saveKey()) setResult(await window.api.ai.testKey(provider.id));
    setTesting(false);
  };

  const clearKey = async (): Promise<void> => {
    const ok = await ui.confirmer(t('ai.key.clearConfirm', { provider: provider.label }), {
      titre: t('ai.key.clear'),
      ok: t('ai.key.clear'),
      danger: true
    });
    if (!ok) return;
    await window.api.ai.setKey(provider.id, '');
    setResult(null);
    await reload();
  };

  return (
    <>
      <p className="intro">{t('ai.intro')}</p>

      <RegSec>
        <RegLigne titre={t('ai.provider')}>
          <div className="seg reg-seg" role="group" aria-label={t('ai.provider')}>
            {config.providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === provider.id ? 'on' : ''}
                aria-pressed={p.id === provider.id}
                onClick={() => void update({ aiProvider: p.id as AiProviderId })}
              >
                {t(`ai.provider.${p.id}`)}
              </button>
            ))}
          </div>
        </RegLigne>

        {provider.fixedModels ? (
          <RegLigne titre={t('ai.model')}>
            <select
              className="select reg-select"
              value={model}
              aria-label={t('ai.model')}
              onChange={(e) => setModel(e.target.value)}
            >
              {provider.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.hint ? ` — ${t(m.hint)}` : ''}
                  {m.id === provider.defaultModel ? ` (${t('ai.model.default')})` : ''}
                </option>
              ))}
            </select>
          </RegLigne>
        ) : (
          <RegLigne
            titre={
              <>
                {t('ai.model')}{' '}
                <Aide titre={t('ai.model')} texte={t(`ai.model.help.${provider.id}`)} />
              </>
            }
            sous={t('ai.model.free', { model: provider.defaultModel })}
          >
            <input
              className="input mono reg-select"
              list={`ai-modeles-${provider.id}`}
              value={modelInput}
              spellCheck={false}
              placeholder={provider.defaultModel}
              aria-label={t('ai.model')}
              onChange={(e) => setModelInput(e.target.value)}
              onBlur={() => setModel(modelInput.trim())}
            />
            <datalist id={`ai-modeles-${provider.id}`}>
              {provider.models.map((m) => (
                <option key={m.id} value={m.id} />
              ))}
            </datalist>
          </RegLigne>
        )}

        <RegLigne titre={t('ai.target')} sous={t('ai.target.sub')}>
          <input
            className="input reg-select"
            list="ai-langues"
            value={target}
            aria-label={t('ai.target')}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={() => {
              const v = target.trim() || 'Français';
              setTarget(v);
              if (v !== settings.aiTargetLang) void update({ aiTargetLang: v });
            }}
          />
          <datalist id="ai-langues">
            {COMMON_TARGET_LANGS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </RegLigne>
      </RegSec>

      <div className="reg-sec">
        <div className="lbl-mono">
          {t('ai.key', { provider: provider.label })}{' '}
          <Aide titre={t('ai.privacy.title')} texte={t('ai.privacy.body', { provider: t(`ai.company.${provider.id}`) })} />
        </div>
        <div className="form">
          {!config.encryptionAvailable && (
            <p className="bandeau-c">
              <Icon name="alert" size={16} />
              <span>{t('ai.error.encryptionUnavailable')}</span>
            </p>
          )}
          <input
            id="ai-cle"
            className="input mono"
            type="password"
            autoComplete="off"
            value={keyInput}
            disabled={!config.encryptionAvailable}
            placeholder={hasKey ? t('ai.key.replace') : t(`ai.key.placeholder.${provider.id}`)}
            aria-label={t('ai.key', { provider: provider.label })}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
            onBlur={() => keyInput && void saveKey()}
          />
          {hasKey && (
            <p className="statut ok reg-note">
              <Icon name="lock" size={16} /> {t('ai.key.stored')}
            </p>
          )}
          <div className="ligne">
            <button
              type="button"
              className={`btn pri${testing ? ' occupe' : ''}`}
              disabled={testing || (!hasKey && !keyInput.trim()) || !config.encryptionAvailable}
              onClick={() => void test()}
            >
              <Icon name="key" />
              {t('ai.key.test')}
            </button>
            {hasKey && (
              <button type="button" className="btn dn" onClick={() => void clearKey()}>
                <Icon name="trash" />
                {t('ai.key.clear')}
              </button>
            )}
            <a className="lien" href={provider.keyUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} />
              {t('ai.key.create')}
            </a>
          </div>
          {result && (
            <p className={`statut ${result.ok ? 'ok' : 'err'}`} role="status">
              <Icon name={result.ok ? 'check' : 'alert'} size={16} />{' '}
              {result.ok ? t('ai.key.ok') : t(`ai.error.${result.error}`)}
            </p>
          )}
          {result && !result.ok && result.message && (
            <p className="muted petit mono">{result.message}</p>
          )}
        </div>
      </div>
    </>
  );
}
