import { useState, type ReactNode } from 'react';
import { CHANGELOG, type ChangelogEntry } from '../../../common/changelog';
import { useI18n } from '../i18n';
import { Feuille } from './Feuille';
import { Icon } from './Icon';

/** Nombre de versions affichées avant « Afficher les versions plus anciennes ». */
const PREMIERES = 8;

function formatDate(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/** Nouveautés puis corrections d'une version. */
function Points({ entry }: { entry: ChangelogEntry }): ReactNode {
  const { t } = useI18n();
  return (
    <div className="histo-points">
      {entry.nouveautes?.length ? (
        <div className="histo-groupe">
          <div className="histo-g">
            <Icon name="sparkle" size={14} />
            {t('changelog.new')}
          </div>
          <ul>
            {entry.nouveautes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {entry.corrections?.length ? (
        <div className="histo-groupe">
          <div className="histo-g">
            <Icon name="wrench" size={14} />
            {t('changelog.fixes')}
          </div>
          <ul>
            {entry.corrections.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function VersionTete({ entry, current }: { entry: ChangelogEntry; current: string }): ReactNode {
  const { t, lang } = useI18n();
  return (
    <>
      <span className="histo-v">
        {entry.depuis ? `${entry.depuis} – ${entry.version}` : entry.version}
      </span>
      <span className="histo-tx">
        <span className="histo-titre">{entry.titre}</span>
        <span className="histo-date">{formatDate(entry.date, lang)}</span>
      </span>
      {entry.version === current && <span className="badge histo-badge">{t('changelog.installed')}</span>}
    </>
  );
}

/**
 * Fenêtre « Quoi de neuf » montrée une fois après une mise à jour : la
 * nouvelle version et celles sautées entre-temps.
 */
export function NouveautesFeuille({
  entries,
  current,
  onClose,
  onHistory
}: {
  entries: ChangelogEntry[];
  current: string;
  onClose(): void;
  onHistory(): void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <Feuille
      titre={
        <>
          <Icon name="sparkle" size={20} /> {t('changelog.whatsNew', { v: current })}
        </>
      }
      onClose={onClose}
      className="nouveautes"
    >
      <p className="muted petit nouveautes-intro">
        {entries.length > 1
          ? t('changelog.updatedMany', { n: entries.length })
          : t('changelog.updatedOne')}
      </p>
      <div className="nouveautes-liste">
        {entries.map((e) => (
          <section key={e.version} className="nouveautes-v">
            <div className="histo-tete">
              <VersionTete entry={e} current={current} />
            </div>
            <Points entry={e} />
          </section>
        ))}
      </div>
      <div className="ligne nouveautes-actions">
        <button type="button" className="btn" onClick={onHistory}>
          <Icon name="clock" />
          {t('changelog.seeAll')}
        </button>
        <span className="esp" />
        <button type="button" className="btn pri" onClick={onClose}>
          <Icon name="check" />
          {t('changelog.ok')}
        </button>
      </div>
    </Feuille>
  );
}

/** Réglages → Mises à jour : toutes les versions, la plus récente dépliée. */
export function HistoriqueVersions({ current }: { current: string }): ReactNode {
  const { t } = useI18n();
  const [tout, setTout] = useState(false);
  const visibles = tout ? CHANGELOG : CHANGELOG.slice(0, PREMIERES);
  return (
    <>
      <div className="lbl-mono sd-titre">
        <Icon name="clock" size={14} />
        {t('changelog.history')}
      </div>
      <p className="intro reg-note">{t('changelog.historyHow')}</p>
      <div className="histo">
        {visibles.map((e, i) => (
          <details key={e.version} open={i === 0}>
            <summary className="histo-tete">
              <VersionTete entry={e} current={current} />
              <Icon name="chev" size={16} className="chev" />
            </summary>
            <Points entry={e} />
          </details>
        ))}
      </div>
      {!tout && CHANGELOG.length > PREMIERES && (
        <div className="ligne histo-plus">
          <button type="button" className="btn" onClick={() => setTout(true)}>
            <Icon name="chevd" />
            {t('changelog.older', { n: CHANGELOG.length - PREMIERES })}
          </button>
        </div>
      )}
    </>
  );
}
