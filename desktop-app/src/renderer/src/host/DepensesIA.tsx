import { useEffect, useState, type ReactNode } from 'react';
import { priceFor, validPrice } from '../../../common/aiPricing';
import type { AiPrice, AiProviderInfo, AiUsageSummary, AppSettings, Language } from '../../../common/types';
import { Aide, ui } from '../encre/ui';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';
import { RegLigne, RegSec, RegSwitch } from './reglages';

const loc = (lang: Language): string => (lang === 'fr' ? 'fr-FR' : 'en-US');

/** Coût en dollars : 4 décimales sous un centime, sinon 2. */
export function formatUsd(v: number, lang: Language): string {
  const small = v > 0 && v < 0.01;
  return new Intl.NumberFormat(loc(lang), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2
  }).format(v);
}

export function formatTokens(n: number, lang: Language): string {
  return new Intl.NumberFormat(loc(lang)).format(n);
}

/**
 * Réglages → Traduction IA → Dépenses : suivi local (aucun fournisseur ne
 * donne le solde restant avec une simple clé API), prix du modèle, offre
 * gratuite Gemini, lien vers la page de facturation et historique.
 */
export function DepensesIA({
  provider,
  model,
  settings,
  update
}: {
  provider: AiProviderInfo;
  model: string;
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t, lang } = useI18n();
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const prices = settings.aiPrices ?? {};
  const custom = prices[model];
  const known = priceFor(model);
  const [inPrice, setInPrice] = useState('');
  const [outPrice, setOutPrice] = useState('');

  const reload = (): Promise<void> => window.api.ai.getUsage(provider.id).then(setUsage);
  useEffect(() => {
    void reload();
  }, [provider.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setInPrice(custom ? String(custom.input) : '');
    setOutPrice(custom ? String(custom.output) : '');
  }, [model, custom?.input, custom?.output]); // eslint-disable-line react-hooks/exhaustive-deps

  const free = provider.id === 'gemini' && settings.aiGeminiFreeTier;

  const savePrice = (): void => {
    const parse = (v: string): number => Number(v.replace(',', '.').trim());
    const next: Record<string, AiPrice> = { ...prices };
    if (!inPrice.trim() && !outPrice.trim()) {
      if (!custom) return;
      delete next[model];
    } else {
      const p = { input: parse(inPrice || '0'), output: parse(outPrice || '0') };
      if (!validPrice(p)) return;
      if (custom && custom.input === p.input && custom.output === p.output) return;
      next[model] = p;
    }
    void update({ aiPrices: next });
  };

  const reset = async (): Promise<void> => {
    const ok = await ui.confirmer(t('ai.usage.resetConfirm', { provider: provider.label }), {
      titre: t('ai.usage.reset'),
      ok: t('ai.usage.reset'),
      danger: true
    });
    if (!ok) return;
    await window.api.ai.resetUsage(provider.id);
    await reload();
  };

  const cost = (v: number, unpriced: number): string =>
    unpriced > 0 && v === 0 ? '—' : `${unpriced > 0 ? '≥ ' : '≈ '}${formatUsd(v, lang)}`;

  return (
    <div className="reg-sec">
      <div className="lbl-mono">
        {t('ai.usage.title')}{' '}
        <Aide titre={t('ai.usage.title')} texte={t('ai.usage.help', { provider: t(`ai.company.${provider.id}`) })} />
      </div>

      {usage && (
        <div className="tuiles ia-tuiles">
          <div className="tuile">
            <div className="k">
              <Icon name="cal" size={16} />
              {t('ai.usage.month')}
            </div>
            <div className="v">{cost(usage.month.costUsd, usage.month.unpriced)}</div>
            <div className="s">{t('ai.usage.count', { n: usage.month.count })}</div>
          </div>
          <div className="tuile">
            <div className="k">
              <Icon name="chart" size={16} />
              {t('ai.usage.total')}
            </div>
            <div className="v">{cost(usage.total.costUsd, usage.total.unpriced)}</div>
            <div className="s">
              {usage.since
                ? t('ai.usage.since', {
                    n: usage.total.count,
                    date: new Intl.DateTimeFormat(loc(lang), { dateStyle: 'medium' }).format(new Date(usage.since))
                  })
                : t('ai.usage.count', { n: 0 })}
            </div>
          </div>
        </div>
      )}
      {free && <p className="muted petit reg-note">{t('ai.usage.freeNote')}</p>}
      {usage && usage.total.unpriced > 0 && !free && (
        <p className="muted petit reg-note">{t('ai.usage.unpricedNote')}</p>
      )}

      <div className="ligne ia-actions">
        <a className="btn sm" href={provider.billingUrl} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} />
          {t('ai.usage.balance')}
        </a>
        {usage && usage.total.count > 0 && (
          <button type="button" className="btn sm dn" onClick={() => void reset()}>
            <Icon name="trash" size={16} />
            {t('ai.usage.reset')}
          </button>
        )}
      </div>

      <RegSec>
        {provider.id === 'gemini' && (
          <RegSwitch
            titre={t('ai.usage.geminiFree')}
            sous={t('ai.usage.geminiFree.sub')}
            checked={settings.aiGeminiFreeTier}
            onChange={(v) => void update({ aiGeminiFreeTier: v })}
          />
        )}
        {!free && (
          <RegLigne
            titre={t('ai.usage.price')}
            sous={
              custom
                ? t('ai.usage.price.custom', { model })
                : known
                  ? t('ai.usage.price.known', { model })
                  : t('ai.usage.price.unknown', { model })
            }
          >
            <div className="ia-prix">
              <input
                className="input mono"
                inputMode="decimal"
                value={inPrice}
                placeholder={known ? String(known.input) : t('ai.usage.price.in')}
                aria-label={t('ai.usage.price.in')}
                title={t('ai.usage.price.in')}
                onChange={(e) => setInPrice(e.target.value)}
                onBlur={savePrice}
              />
              <input
                className="input mono"
                inputMode="decimal"
                value={outPrice}
                placeholder={known ? String(known.output) : t('ai.usage.price.out')}
                aria-label={t('ai.usage.price.out')}
                title={t('ai.usage.price.out')}
                onChange={(e) => setOutPrice(e.target.value)}
                onBlur={savePrice}
              />
            </div>
          </RegLigne>
        )}
      </RegSec>

      {usage && usage.recent.length > 0 && (
        <>
          <div className="lbl-mono ia-histo-t">{t('ai.usage.history')}</div>
          <div className="liste-r ia-histo">
            {usage.recent.map((e) => (
              <div key={e.id} className="li">
                <span className="tx">
                  {formatDate(e.createdAt, lang)}
                  <small className="mono">
                    {e.model} · {t('ai.usage.tokens', {
                      in: formatTokens(e.inputTokens, lang),
                      out: formatTokens(e.outputTokens, lang)
                    })}
                  </small>
                </span>
                <span className="v mono">{e.costUsd === null ? '—' : formatUsd(e.costUsd, lang)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
