import { useEffect, useState, type ReactNode } from 'react';
import type { AiRequestEntry, AiProviderId } from '../../../common/types';
import { Aide, ui } from '../encre/ui';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';
import { formatTokens, formatUsd } from './DepensesIA';
import { Icon } from './Icon';

export function JournalIA(): ReactNode {
  const { t, lang } = useI18n();
  const [provider, setProvider] = useState<AiProviderId | ''>('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<AiRequestEntry[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const reload = (): void => {
      const current = ++revision;
      void window.api.ai.requests(provider || undefined).then((r) => {
        if (alive && current === revision) { setRows(r); setError(false); }
      }).catch(() => { if (alive) setError(true); });
    };
    reload();
    const off = window.api.ai.onRequestsChanged(reload);
    return () => { alive = false; off(); };
  }, [provider]);
  const visible = rows.filter((r) => !status || r.status === status);
  return <div className="reg-sec ia-journal">
    <div className="lbl-mono">{t('ai.journal.title')} <Aide titre={t('ai.journal.title')} texte={t('ai.journal.help')} /></div>
    <div className="ligne ia-actions">
      <select className="select sm" value={provider} aria-label={t('ai.provider')} onChange={(e) => setProvider(e.target.value as AiProviderId | '')}>
        <option value="">{t('ai.journal.allProviders')}</option>
        {(['anthropic', 'openai', 'gemini'] as const).map((p) => <option key={p} value={p}>{t('ai.provider.' + p)}</option>)}
      </select>
      <select className="select sm" value={status} aria-label={t('ai.journal.status')} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t('ai.journal.allStatuses')}</option>
        {['running', 'success', 'error', 'interrupted'].map((s) => <option key={s} value={s}>{t('ai.journal.' + s)}</option>)}
      </select>
      <button className="btn sm gh" onClick={async () => {
        if (await ui.confirmer(t('ai.journal.clearConfirm'), { ok: t('ai.journal.clear') })) await window.api.ai.clearRequests();
      }}><Icon name="trash" size={16} />{t('ai.journal.clear')}</button>
    </div>
    <p className="muted petit">{t('ai.journal.note')}</p>
    {error && <p role="alert">{t('ai.journal.loadError')}</p>}
    {!visible.length && !error && <p className="muted petit">{t('ai.journal.empty')}</p>}
    <div className="liste-r ia-journal-list" role="log" aria-label={t('ai.journal.title')}>
      {visible.map((r) => <div className="li ia-request" key={r.id}>
        <span className="tx">
          <b>{t('ai.operation.' + r.operation)}</b>
          <small>{formatDate(r.createdAt, lang)} · {t('ai.provider.' + r.provider)} · {r.model}</small>
          <small>{r.inputTokens === null || r.outputTokens === null ? t('ai.journal.unknownUsage') : t('ai.usage.tokens', { in: formatTokens(r.inputTokens, lang), out: formatTokens(r.outputTokens, lang) })}
            {r.durationMs !== null && ' · ' + (r.durationMs / 1000).toFixed(1) + ' s'}</small>
          {r.error && <small className="err">{t('ai.error.' + r.error)}</small>}
        </span>
        <span className="ia-request-result"><span className={'badge ' + (r.status === 'error' ? 'err' : '')}>{t('ai.journal.' + r.status)}</span>
          <span className="mono">{r.costUsd === null ? t('ai.journal.unknownCost') : '≈ ' + formatUsd(r.costUsd, lang)}</span></span>
      </div>)}
    </div>
  </div>;
}
