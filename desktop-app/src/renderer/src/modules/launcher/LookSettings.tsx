/**
 * Réglages « Apparence de la barre » du lanceur, avec un aperçu en direct :
 * la vraie palette (mêmes classes et variables que la fenêtre du lanceur,
 * launcher.css + look.ts), mise à l'échelle pour tenir dans la page.
 * Les curseurs changent l'aperçu tout de suite et s'enregistrent un instant
 * après (le lanceur suit à chaud).
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_LAUNCHER_LOOK,
  LAUNCHER_LOOK_LIMITS,
  type LauncherLook,
  type LauncherLookAccent
} from '../../../../common/launcher';
import { Aide, ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSwitch } from '../../host/reglages';
import { useI18n, type TFunc } from '../../i18n';
import { lookClass, lookVars } from './look';
import './launcher.css';

const ACCENTS: LauncherLookAccent[] = ['app', 'lavande', 'or', 'ambre', 'corail', 'menthe'];
const POSITIONS: LauncherLook['position'][] = ['top', 'third', 'center'];

const aide = (t: TFunc, titre: string, cle: string): ReactNode => (
  <Aide titre={titre} texte={t(cle)} exemple={t(`${cle}.ex`)} />
);

/** Surligne le début du titre (comme les lettres trouvées dans le lanceur). */
function Hl({ text, q }: { text: string; q: string }): ReactNode {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="lz-hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** La barre du lanceur, avec de faux résultats, à l'échelle de la page. */
function Apercu({ look }: { look: LauncherLook }): ReactNode {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const full = look.width + 40;

  useLayoutEffect(() => {
    const measure = (): void =>
      setBox({ w: boxRef.current?.clientWidth ?? 0, h: innerRef.current?.offsetHeight ?? 0 });
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  const k = box.w ? Math.min(1, box.w / full) : 1;
  const q = t('launcher.look.demo.query');
  const rows: Array<[string, string]> = [
    ['grid', 'programs'],
    ['grid', 'programs'],
    ['x', 'processes'],
    ['file', 'files'],
    ['bookmark', 'bookmarks'],
    ['compass', 'websearch']
  ];

  return (
    <div className="lzr-apercu" ref={boxRef} style={{ height: box.h ? box.h * k : undefined }} aria-hidden="true">
      <div className="lzr-apercu-in" ref={innerRef} style={{ width: full, transform: `scale(${k})` }}>
        <div className="lz-shell" style={lookVars(look)}>
          <div className={`palette lz${lookClass(look)}`}>
            <div className="champ lz-champ">
              <Icon name="search" size={22} />
              <input type="text" readOnly tabIndex={-1} value={q} />
              <span className="kbd">{t('launcher.key.esc')}</span>
            </div>
            <div className="res-p lz-list">
              {rows.map(([icone, src], i) => (
                <div key={i} className={`pal-it${i === 0 ? ' on' : ''}`}>
                  <span className="ico">
                    <Icon name={icone} />
                  </span>
                  <span className="tx">
                    <b>
                      <Hl text={t(`launcher.look.demo.r${i + 1}`)} q={i === 5 ? '' : q} />
                    </b>
                    <span>{t(`launcher.look.demo.r${i + 1}s`)}</span>
                  </span>
                  {i === 0 ? (
                    <span className="lz-go">
                      <Icon name="dots" size={16} />
                      <span className="kbd">{t('launcher.key.enter')}</span>
                    </span>
                  ) : (
                    <Fragment>
                      <span className="etq lz-src">{t(`launcher.provider.${src}`)}</span>
                      <span className="kbd lz-alt">Alt {i + 1}</span>
                    </Fragment>
                  )}
                </div>
              ))}
            </div>
            <div className="pal-pied lz-pied">
              <span>
                <span className="kbd">↑↓</span> {t('launcher.hint.move')}
              </span>
              <span>
                <span className="kbd">{t('launcher.key.enter')}</span> {t('launcher.hint.open')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Curseur + valeur affichée ; le changement part un instant après. */
function Curseur({
  value,
  min,
  max,
  step,
  unite,
  label,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unite: string;
  label: string;
  onChange(v: number): void;
}): ReactNode {
  return (
    <span className="lzr-curseur">
      <input
        type="range"
        className="lzr-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="lzr-val mono">
        {value}
        {unite}
      </span>
    </span>
  );
}

export function LookSettings({
  look: saved,
  onSave
}: {
  look: LauncherLook;
  onSave(look: LauncherLook): Promise<void>;
}): ReactNode {
  const { t } = useI18n();
  const [look, setLook] = useState(saved);
  const timer = useRef<number | null>(null);
  const pending = useRef<LauncherLook | null>(null);

  // valeur venue d'ailleurs (autre fenêtre, réinitialisation) : on la reprend,
  // sauf pendant qu'un changement local attend d'être envoyé
  useEffect(() => {
    if (!pending.current) setLook(saved);
  }, [saved]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) void onSave(pending.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const change = (patch: Partial<LauncherLook>, delai = 220): void => {
    const next = { ...look, ...patch };
    setLook(next);
    pending.current = next;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = pending.current;
      pending.current = null;
      if (v) void onSave(v);
    }, delai);
  };

  const reset = (): void => {
    change({ ...DEFAULT_LAUNCHER_LOOK }, 0);
    ui.toast(t('launcher.look.resetDone'));
  };

  const L = LAUNCHER_LOOK_LIMITS;
  const estDefaut = JSON.stringify(look) === JSON.stringify(DEFAULT_LAUNCHER_LOOK);

  return (
    <div className="reg-sec lzr-look">
      <div className="lzr-sous-t">
        <span className="lbl-mono">{t('launcher.look.title')}</span>
        <button type="button" className="btn sm gh" disabled={estDefaut} onClick={reset}>
          <Icon name="undo" size={16} />
          {t('launcher.look.reset')}
        </button>
      </div>
      <p className="muted petit lzr-intro">{t('launcher.look.intro')}</p>
      <Apercu look={look} />

      <div className="reg-lignes">
        <RegLigne
          titre={t('launcher.look.width')}
          aide={aide(t, t('launcher.look.width'), 'launcher.help.look.width')}
          sous={t('launcher.look.widthDesc')}
        >
          <Curseur
            value={look.width}
            min={L.width[0]}
            max={L.width[1]}
            step={20}
            unite=" px"
            label={t('launcher.look.width')}
            onChange={(width) => change({ width })}
          />
        </RegLigne>
        <RegLigne
          titre={t('launcher.look.textSize')}
          aide={aide(t, t('launcher.look.textSize'), 'launcher.help.look.textSize')}
          sous={t('launcher.look.textSizeDesc')}
        >
          <Curseur
            value={look.textSize}
            min={L.textSize[0]}
            max={L.textSize[1]}
            step={5}
            unite=" %"
            label={t('launcher.look.textSize')}
            onChange={(textSize) => change({ textSize })}
          />
        </RegLigne>
        <RegLigne
          titre={t('launcher.look.visibleRows')}
          aide={aide(t, t('launcher.look.visibleRows'), 'launcher.help.look.visibleRows')}
          sous={t('launcher.look.visibleRowsDesc')}
        >
          <Curseur
            value={look.visibleRows}
            min={L.visibleRows[0]}
            max={L.visibleRows[1]}
            step={1}
            unite=""
            label={t('launcher.look.visibleRows')}
            onChange={(visibleRows) => change({ visibleRows })}
          />
        </RegLigne>
        <RegLigne
          titre={t('launcher.look.opacity')}
          aide={aide(t, t('launcher.look.opacity'), 'launcher.help.look.opacity')}
          sous={t('launcher.look.opacityDesc')}
        >
          <Curseur
            value={look.opacity}
            min={L.opacity[0]}
            max={L.opacity[1]}
            step={1}
            unite=" %"
            label={t('launcher.look.opacity')}
            onChange={(opacity) => change({ opacity })}
          />
        </RegLigne>
        <RegLigne
          titre={t('launcher.look.radius')}
          aide={aide(t, t('launcher.look.radius'), 'launcher.help.look.radius')}
          sous={t('launcher.look.radiusDesc')}
        >
          <Curseur
            value={look.radius}
            min={L.radius[0]}
            max={L.radius[1]}
            step={2}
            unite=" px"
            label={t('launcher.look.radius')}
            onChange={(radius) => change({ radius })}
          />
        </RegLigne>
        <RegLigne
          titre={t('launcher.look.position')}
          aide={aide(t, t('launcher.look.position'), 'launcher.help.look.position')}
          sous={t('launcher.look.positionDesc')}
        >
          <div className="seg reg-seg" role="group" aria-label={t('launcher.look.position')}>
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={look.position === p ? 'on' : ''}
                aria-pressed={look.position === p}
                onClick={() => change({ position: p }, 0)}
              >
                <span className={`lzr-ecran lzr-pos-${p}`} aria-hidden="true">
                  <i />
                </span>
                {t(`launcher.look.position.${p}`)}
              </button>
            ))}
          </div>
        </RegLigne>
        <RegSwitch
          titre={t('launcher.look.subtitles')}
          aide={aide(t, t('launcher.look.subtitles'), 'launcher.help.look.subtitles')}
          sous={t('launcher.look.subtitlesDesc')}
          checked={look.showSubtitles}
          onChange={(showSubtitles) => change({ showSubtitles }, 0)}
        />
        <RegSwitch
          titre={t('launcher.look.hotkeys')}
          aide={aide(t, t('launcher.look.hotkeys'), 'launcher.help.look.hotkeys')}
          sous={t('launcher.look.hotkeysDesc')}
          checked={look.showHotkeys}
          onChange={(showHotkeys) => change({ showHotkeys }, 0)}
        />
        <div className="reg-l lzr-accent">
          <span className="tx">
            <b>
              {t('launcher.look.accent')}
              {aide(t, t('launcher.look.accent'), 'launcher.help.look.accent')}
            </b>
          </span>
          <div className="pastilles" role="radiogroup" aria-label={t('launcher.look.accent')}>
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                className={`past${look.accent === a ? ' on' : ''}`}
                data-v={a}
                role="radio"
                aria-checked={look.accent === a}
                onClick={() => change({ accent: a }, 0)}
              >
                <i />
                {a === 'app' ? t('launcher.look.accent.app') : t(`appearance.accent.${a}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
