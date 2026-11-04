import { useEffect, useState, type ReactNode } from 'react';
import type { CaptureListItem } from '../../../../common/types';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { formatDate } from '../../lib/format';

/**
 * OCR : choisir une capture (via l'API bibliothèque de l'hôte), extraire le
 * texte (FR/EN), l'afficher et le copier.
 */
export function OcrPanel(): ReactNode {
  const { t, lang } = useI18n();
  const host = useHost();
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ocrLang, setOcrLang] = useState<'fra' | 'eng'>(lang === 'fr' ? 'fra' : 'eng');
  const [working, setWorking] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    const items = await window.api.library.list({ view: 'library', sort: 'date' });
    setCaptures(items.slice(0, 24));
  };

  useEffect(() => {
    void refresh();
    return window.api.library.onChanged(() => void refresh());
  }, []);

  const extract = async (): Promise<void> => {
    if (!selectedId) return;
    setWorking(true);
    setText(null);
    setError(null);
    const result = await window.api.ocr.extract(selectedId, ocrLang);
    setWorking(false);
    if (result.ok) {
      setText(result.text);
      if (!result.text) setError(t('ocr.empty'));
    } else {
      setError(t('ocr.error', { msg: result.error }));
    }
  };

  const copy = async (): Promise<void> => {
    if (!text) return;
    await window.api.system.copyText(text);
    host.notify(t('ocr.copied'));
  };

  const selected = captures.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="panel">
      <div className="page-h">
        <h1 className="page-t">{t('ocr.title')}</h1>
        <div className="ligne capture-bar">
          <select
            className="select sm"
            value={ocrLang}
            aria-label={t('ocr.lang')}
            onChange={(e) => setOcrLang(e.target.value as 'fra' | 'eng')}
          >
            <option value="fra">Français</option>
            <option value="eng">English</option>
          </select>
          <button
            type="button"
            className={`btn pri${working ? ' occupe' : ''}`}
            disabled={!selectedId || working}
            onClick={() => void extract()}
          >
            <Icon name="textScan" />
            {working ? t('ocr.working') : t('ocr.extract')}
          </button>
        </div>
      </div>
      <p className="intro-p">{t('ocr.firstUse')}</p>

      <div className="ocr-layout">
        <section className="ocr-pick">
          <div className="sec-h">
            <h2 className="sec-t">{t('ocr.pickCapture')}</h2>
          </div>
          {captures.length === 0 ? (
            <div className="vide">
              <Icon name="camera" />
              <span>{t('ocr.noCaptures')}</span>
            </div>
          ) : (
            <div className="ocr-grid anim-in">
              {captures.map((capture) => (
                <button
                  key={capture.id}
                  type="button"
                  className={`ocr-item${selectedId === capture.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(capture.id)}
                  title={capture.filename}
                >
                  <img src={`mo-media://thumb/${capture.id}`} alt="" loading="lazy" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ocr-result">
          <div className="sec-h">
            <h2 className="sec-t">{t('ocr.result')}</h2>
            {selected && (
              <span className="muted petit ocr-src">
                {selected.filename} · {formatDate(selected.createdAt, lang)}
              </span>
            )}
          </div>
          {error && (
            <p className="statut err">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
          <textarea
            className="input ocr-text"
            readOnly
            value={text ?? ''}
            placeholder={working ? t('ocr.working') : ''}
          />
          <div className="ligne">
            <button
              type="button"
              className="btn"
              disabled={!text}
              onClick={() => void copy()}
            >
              <Icon name="copy" />
              {t('ocr.copy')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
