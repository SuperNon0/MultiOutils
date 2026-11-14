import { useEffect, useState, type ReactNode } from 'react';
import type { AiPlanZone } from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

/** Rangement proposé par l'IA : aperçu des zones, puis création d'un clic. */
export function AiPlanSheet({ onClose }: { onClose(): void }): ReactNode {
  const { t } = useI18n();
  const [plan, setPlan] = useState<AiPlanZone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const ask = (): void => {
    setPlan(null);
    setError(null);
    setOff(new Set());
    void window.api.desktop.aiPlan().then((r) => (r.ok ? setPlan(r.plan) : setError(r.error)));
  };
  useEffect(ask, []);
  const kept = (plan ?? []).filter((_, i) => !off.has(i));
  return (
    <Feuille
      titre={t('desktop.ai.title')}
      onClose={onClose}
      large
      actions={
        <button className="btn sm" disabled={!plan && !error} onClick={ask}>
          <Icon name="refresh" size={16} />
          {t('desktop.ai.again')}
        </button>
      }
    >
      <div className="bz-ai">
        <p className="muted petit" style={{ margin: 0 }}>
          {t('desktop.ai.intro')}
        </p>
        {error ? (
          <p className="dan">{error}</p>
        ) : !plan ? (
          <p className="muted">{t('desktop.ai.busy')}</p>
        ) : (
          <>
            {plan.map((z, i) => (
              <label key={i} className={`carte bz-ai-z${off.has(i) ? ' off' : ''}`}>
                <span className="ligne" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!off.has(i)}
                    onChange={() => {
                      const n = new Set(off);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      setOff(n);
                    }}
                  />
                  <b>{z.title}</b>
                  <span className="badge">{z.items.length}</span>
                </span>
                <span className="bz-ai-items">{z.items.join(' · ')}</span>
              </label>
            ))}
            <div className="br-act">
              <button className="btn" onClick={onClose}>
                {t('desktop.rules.cancel')}
              </button>
              <button
                className="btn pri"
                disabled={kept.length === 0}
                onClick={async () => {
                  await window.api.desktop.aiApply(kept);
                  ui.toast(t('desktop.ai.applied', { n: kept.length }));
                  onClose();
                }}
              >
                <Icon name="check" size={16} />
                {t('desktop.ai.apply', { n: kept.length })}
              </button>
            </div>
          </>
        )}
      </div>
    </Feuille>
  );
}
