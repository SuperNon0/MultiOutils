import { useRef, useState, type ReactNode } from 'react';
import type { IconLibraryPublic } from '../../../../common/api';
import {
  THEME_GROUPS,
  applyStyle,
  applyTheme,
  exportFileName,
  newIconId,
  styleLook,
  svgDataUrl,
  symbolKey,
  type IconColors,
  type IconCorner,
  type IconDesign,
  type IconShadow,
  type IconShape,
  type IconTheme,
  type SymbolRef
} from '../../../../common/icons';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { artOf, designSvg, importImage, svgToPng } from './art';
import { PHOSPHOR_WEIGHTS, SymbolPicker, SymbolThumb } from './SymbolPicker';

const SHAPES: IconShape[] = ['squircle', 'rounded', 'round', 'square', 'none'];
const SHADOWS: IconShadow[] = ['none', 'soft', 'glow'];
const CORNERS: IconCorner[] = ['tl', 'tr', 'bl', 'br'];

export function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange(v: string): void; onClear?: () => void }): ReactNode {
  const [text, setText] = useState(value);
  const shown = /^#[0-9a-f]{6}$/i.test(text) && text.toLowerCase() !== value.toLowerCase() ? value : text;
  return (
    <label className="ic-color">
      <span className="lbl">{label}</span>
      <span className="ligne">
        <input type="color" value={value} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} />
        <input
          className="input mono"
          value={shown === value ? value : text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          spellCheck={false}
        />
        {onClear && (
          <button type="button" className="btn xs gh" onClick={onClear}>
            <Icon name="x" size={14} />
          </button>
        )}
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, unit = '' }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; unit?: string }): ReactNode {
  return (
    <label className="ic-slider">
      <span className="lbl">
        {label} <b className="mono">{Math.round(value * 100) / 100}{unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(min < 0 ? 0 : value)} />
    </label>
  );
}

export function ThemeSwatch({ theme, on, onClick, onRemove }: { theme: IconColors & { name: string }; on?: boolean; onClick(): void; onRemove?: () => void }): ReactNode {
  return (
    <button
      type="button"
      className={`ic-theme${on ? ' on' : ''}`}
      title={theme.name}
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onRemove) return;
        e.preventDefault();
        ui.menu({ x: e.clientX, y: e.clientY }, [{ texte: 'Supprimer', icone: 'trash', danger: true, action: onRemove }]);
      }}
      style={{ background: theme.bg2 ? `linear-gradient(135deg, ${theme.bg}, ${theme.bg2})` : theme.bg }}
    >
      <i style={{ background: theme.fg }} />
    </button>
  );
}

export function ThemeGroups({ state, current, onPick }: { state: IconLibraryPublic; current?: IconColors; onPick(t: IconTheme): void }): ReactNode {
  const all = [...state.builtinThemes, ...state.themes];
  const same = (t: IconColors): boolean => !!current && t.fg === current.fg && t.bg === current.bg && (t.bg2 ?? '') === (current.bg2 ?? '');
  return (
    <div className="ic-themes">
      {THEME_GROUPS.map((g) => {
        const list = all.filter((t) => t.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id} className="ic-theme-g">
            <span className="lbl-mono">{g.label}</span>
            <div className="ic-theme-row">
              {list.map((t) => (
                <ThemeSwatch key={t.id} theme={t} on={same(t)} onClick={() => onPick(t)} onRemove={t.builtin ? undefined : () => void window.api.icons.removeTheme(t.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Exporte une ou plusieurs icônes (PNG 144 et 288, SVG). */
export async function exportDesigns(list: IconDesign[], kind: 'png' | 'png2x' | 'svg', notify: (m: string) => void): Promise<void> {
  const files: Array<{ name: string; data: string; base64?: boolean }> = [];
  const used = new Set<string>();
  for (const d of list) {
    let base = exportFileName(d.name);
    for (let i = 2; used.has(base); i++) base = `${exportFileName(d.name)}-${i}`;
    used.add(base);
    const variants: Array<[string, boolean]> = [['', false], ...(d.off ? [['-eteint', true] as [string, boolean]] : [])];
    for (const [suffix, off] of variants) {
      if (kind === 'svg') files.push({ name: `${base}${suffix}.svg`, data: designSvg(d, 144, off) });
      else {
        const size = kind === 'png2x' ? 288 : 144;
        const png = await svgToPng(designSvg(d, size, off), size);
        files.push({ name: `${base}${suffix}${kind === 'png2x' ? '@2x' : ''}.png`, data: png.split(',')[1], base64: true });
      }
    }
  }
  const res = await window.api.icons.exportFiles(files);
  if (res.ok) notify(`${res.count} fichier(s) enregistré(s)`);
}

type PickTarget = 'main' | 'badge' | 'off' | null;
type Tab = 'symbol' | 'colors' | 'shape' | 'extras' | 'off';
const TABS: Tab[] = ['symbol', 'colors', 'shape', 'extras', 'off'];
/** Onglet gardé d'une icône à l'autre pendant la session. */
let lastTab: Tab = 'symbol';

/** Menu d'export (PNG, PNG @2x, SVG) commun à l'éditeur et à la grille. */
export function exportMenu(anchor: HTMLElement | { x: number; y: number }, list: IconDesign[]): void {
  ui.menu(anchor, [
    { texte: 'PNG', icone: 'download', action: () => void exportDesigns(list, 'png', ui.toast) },
    { texte: 'PNG @2x', icone: 'download', action: () => void exportDesigns(list, 'png2x', ui.toast) },
    { texte: 'SVG', icone: 'download', action: () => void exportDesigns(list, 'svg', ui.toast) }
  ]);
}

/** Copie l'image d'une icône (version allumée ou éteinte) dans le presse-papiers. */
export async function copyDesign(d: IconDesign, off: boolean, done: () => void): Promise<void> {
  const png = await svgToPng(designSvg(d, 288, off), 288);
  await window.api.icons.copyImage(png);
  done();
}

export function IconEditor({
  design: d,
  state,
  onChange,
  onRemove,
  onDuplicate
}: {
  design: IconDesign;
  state: IconLibraryPublic;
  onChange(d: IconDesign): void;
  onRemove(): void;
  onDuplicate(): void;
}): ReactNode {
  const { t } = useI18n();
  const [picking, setPicking] = useState<PickTarget>(null);
  const [showOff, setShowOff] = useState(false);
  const [tab, setTabState] = useState<Tab>(lastTab);
  const [nameDraft, setNameDraft] = useState(d.name);
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<IconDesign>): void => onChange({ ...d, ...patch });
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e7ebf3';
  const setTab = (next: Tab): void => {
    lastTab = next;
    setTabState(next);
    // l'onglet « Éteint » montre la version éteinte dans l'aperçu
    if (d.off) setShowOff(next === 'off');
  };

  const pick = (ref: SymbolRef): void => {
    void window.api.icons.pushRecent(symbolKey(ref));
    if (picking === 'main') set({ symbol: ref, image: undefined, imageKeep: undefined });
    else if (picking === 'badge') set({ badge: { symbol: ref, fg: d.badge?.fg ?? '#ffffff', bg: d.badge?.bg ?? '#ff3b30', corner: d.badge?.corner ?? 'tr' } });
    else if (picking === 'off') set({ off: { ...(d.off ?? {}), symbol: ref } });
    setPicking(null);
  };

  const sym = d.symbol;
  const offOn = !!d.off;
  const off = showOff && offOn;
  // L'aperçu, la copie et l'export partagent la même image : ce qu'on voit est ce qu'on copie.
  const previewSvg = designSvg(d, 288, off);

  return (
    <div className="ic-editor">
      <div className="ic-ed-head">
        <div className="ic-ed-preview">
          <img src={svgDataUrl(previewSvg)} alt="" width={112} height={112} />
          {offOn && (
            <div className="seg ic-seg">
              <button type="button" className={!showOff ? 'on' : ''} onClick={() => setShowOff(false)}>{t('icons.stateOn')}</button>
              <button type="button" className={showOff ? 'on' : ''} onClick={() => setShowOff(true)}>{t('icons.stateOff')}</button>
            </div>
          )}
        </div>
        <div className="ic-ed-meta">
          <input
            className="input ic-name"
            value={editingName ? nameDraft : d.name}
            aria-label={t('icons.name')}
            placeholder={t('icons.name')}
            maxLength={80}
            onFocus={() => { setNameDraft(d.name); setEditingName(true); }}
            onChange={(e) => { setNameDraft(e.target.value); set({ name: e.target.value }); }}
            onBlur={() => { setEditingName(false); set({ name: nameDraft.trim() || t('icons.newIcon') }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <div className="ligne">
            <select className="select" value={d.folder ?? ''} aria-label={t('icons.folders')} onChange={(e) => set({ folder: e.target.value || null })}>
              <option value="">{t('icons.noFolder')}</option>
              {state.folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button type="button" className={`btn sm ico${d.favorite ? ' pri' : ''}`} title={t('icons.favorite')} onClick={() => set({ favorite: !d.favorite })}>
              <Icon name={d.favorite ? 'starFilled' : 'star'} size={16} />
            </button>
          </div>
          <div className="ligne ic-ed-actions">
            <button type="button" className="btn xs" onClick={(e) => exportMenu(e.currentTarget, [d])}>
              <Icon name="download" size={14} /> {t('icons.export')}
            </button>
            <button type="button" className="btn xs ico" title={t('icons.copy')} onClick={() => void copyDesign(d, off, () => ui.toast(t('icons.copied')))}>
              <Icon name="copy" size={14} />
            </button>
            <button type="button" className="btn xs ico" title={t('icons.duplicate')} onClick={onDuplicate}>
              <Icon name="layers" size={14} />
            </button>
            <button type="button" className="btn xs ico dn" title={t('icons.delete')} onClick={onRemove}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="seg ic-tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`icons.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'symbol' && (
        <section className="ic-sec">
          <div className="ligne">
            <button type="button" className="btn sm ic-sym-btn" onClick={() => setPicking('main')}>
              {d.image && !sym ? <img src={d.image} alt="" width={22} height={22} /> : <SymbolThumb art={artOf(sym)} color={textColor} size={22} />}
              <span>{d.image && !sym ? t('icons.image') : sym ? (sym.lib === 'pack' ? sym.name.split('/').pop() : sym.name) : t('icons.none')}</span>
            </button>
            <button type="button" className="btn sm gh" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={15} /> {t('icons.importImage')}
            </button>
            {(sym || d.image) && (
              <button type="button" className="btn sm gh" onClick={() => set({ symbol: null, image: undefined })}>
                {t('icons.noSymbol')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importImage(f).then((image) => set({ image, imageKeep: true, symbol: null })).catch(ui.toastErr);
              }}
            />
          </div>
          {sym?.lib === 'phosphor' && (
            <div className="seg ic-seg">
              {PHOSPHOR_WEIGHTS.map((w) => (
                <button key={w} type="button" className={(sym.weight ?? 'regular') === w ? 'on' : ''} onClick={() => set({ symbol: { ...sym, weight: w } })}>
                  {t(`icons.weight.${w}`)}
                </button>
              ))}
            </div>
          )}
          {sym?.lib === 'tabler' && (
            <div className="seg ic-seg">
              <button type="button" className={sym.weight !== 'filled' ? 'on' : ''} onClick={() => set({ symbol: { lib: 'tabler', name: sym.name } })}>{t('icons.outline')}</button>
              <button type="button" className={sym.weight === 'filled' ? 'on' : ''} onClick={() => set({ symbol: { ...sym, weight: 'filled' } })}>{t('icons.filled')}</button>
            </div>
          )}
          {(d.image && !sym) || sym?.lib === 'pack' ? (
            <label className="ic-ck">
              <input type="checkbox" checked={!!d.imageKeep} onChange={(e) => set({ imageKeep: e.target.checked })} /> {t('icons.keepImageColors')}
            </label>
          ) : null}
        </section>
      )}

      {tab === 'colors' && (
        <section className="ic-sec">
          <ThemeGroups state={state} current={d} onPick={(th) => onChange(applyTheme(d, th))} />
          <div className="ic-two">
            <ColorField label={t('icons.fg')} value={d.fg} onChange={(fg) => set({ fg })} />
            <ColorField label={t('icons.bg')} value={d.bg} onChange={(bg) => set({ bg })} />
          </div>
          {d.bg2 ? (
            <div className="ic-two">
              <ColorField label={t('icons.bg2')} value={d.bg2} onChange={(bg2) => set({ bg2 })} onClear={() => set({ bg2: undefined })} />
              <Slider label={t('icons.angle')} value={d.gradientAngle} min={0} max={360} step={15} unit="°" onChange={(gradientAngle) => set({ gradientAngle })} />
            </div>
          ) : null}
          <div className="ligne">
            {!d.bg2 && (
              <button type="button" className="btn xs gh" onClick={() => set({ bg2: d.bg })}>
                <Icon name="plus" size={14} /> {t('icons.addGradient')}
              </button>
            )}
            <button
              type="button"
              className="btn xs gh"
              onClick={async () => {
                const name = await ui.demander(t('icons.saveTheme'), { label: t('icons.name'), valeur: d.name });
                if (name) await window.api.icons.saveTheme({ id: newIconId(), name, group: 'perso', fg: d.fg, bg: d.bg, ...(d.bg2 ? { bg2: d.bg2 } : {}) });
              }}
            >
              <Icon name="palette" size={14} /> {t('icons.saveTheme')}
            </button>
          </div>

          <h3 className="lbl-mono">{t('icons.styles')}</h3>
          <p className="muted petit">{t('icons.stylesHelp')}</p>
          <div className="chips">
            {state.styles.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                onClick={() => onChange(applyStyle(d, s.look))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  ui.menu({ x: e.clientX, y: e.clientY }, [{ texte: t('icons.delete'), icone: 'trash', danger: true, action: () => void window.api.icons.removeStyle(s.id) }]);
                }}
              >
                <i className="ic-chip-sw" style={{ background: s.look.bg2 ? `linear-gradient(135deg, ${s.look.bg}, ${s.look.bg2})` : s.look.bg, color: s.look.fg }} />
                {s.name}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={async () => {
                const name = await ui.demander(t('icons.saveStyle'), { label: t('icons.name') });
                if (name) await window.api.icons.saveStyle({ id: newIconId(), name, look: styleLook(d) });
              }}
            >
              <Icon name="plus" size={13} /> {t('icons.saveStyle')}
            </button>
          </div>
        </section>
      )}

      {tab === 'shape' && (
        <section className="ic-sec">
          <span className="lbl">{t('icons.shape')}</span>
          <div className="seg ic-seg">
            {SHAPES.map((s) => (
              <button key={s} type="button" className={d.shape === s ? 'on' : ''} onClick={() => set({ shape: s })}>
                {t(`icons.shape.${s}`)}
              </button>
            ))}
          </div>
          <span className="lbl">{t('icons.shadow')}</span>
          <div className="seg ic-seg">
            {SHADOWS.map((s) => (
              <button key={s} type="button" className={d.shadow === s ? 'on' : ''} onClick={() => set({ shadow: s })}>
                {t(`icons.shadow.${s}`)}
              </button>
            ))}
          </div>
          <div className="ic-two">
            <Slider label={t('icons.scale')} value={d.scale} min={0.15} max={1.2} step={0.01} onChange={(scale) => set({ scale })} />
            <Slider label={t('icons.rotate')} value={d.rotate} min={-180} max={180} step={5} unit="°" onChange={(rotate) => set({ rotate })} />
            <Slider label={t('icons.dx')} value={d.dx} min={-50} max={50} step={1} unit="%" onChange={(dx) => set({ dx })} />
            <Slider label={t('icons.dy')} value={d.dy} min={-50} max={50} step={1} unit="%" onChange={(dy) => set({ dy })} />
            {sym?.lib === 'tabler' && sym.weight !== 'filled' && (
              <Slider label={t('icons.stroke')} value={d.strokeWidth} min={0.5} max={4} step={0.25} onChange={(strokeWidth) => set({ strokeWidth })} />
            )}
          </div>
          <button type="button" className="btn xs gh" onClick={() => set({ scale: 0.56, rotate: 0, dx: 0, dy: 0 })}>
            <Icon name="undo" size={14} /> {t('icons.resetPlacement')}
          </button>
        </section>
      )}

      {tab === 'extras' && (
        <section className="ic-sec">
          <h3 className="lbl-mono">{t('icons.text')}</h3>
          <input
            className="input"
            value={d.text?.value ?? ''}
            placeholder={t('icons.textPh')}
            onChange={(e) => set({ text: e.target.value ? { size: 26, position: 'bottom', weight: 600, ...(d.text ?? {}), value: e.target.value } : undefined })}
          />
          {d.text && (
            <>
              <div className="seg ic-seg">
                {(['top', 'center', 'bottom'] as const).map((p) => (
                  <button key={p} type="button" className={d.text?.position === p ? 'on' : ''} onClick={() => d.text && set({ text: { ...d.text, position: p } })}>
                    {t(`icons.pos.${p}`)}
                  </button>
                ))}
              </div>
              <div className="ic-two">
                <Slider label={t('icons.textSize')} value={d.text.size} min={8} max={90} step={1} onChange={(size) => d.text && set({ text: { ...d.text, size } })} />
                <Slider label={t('icons.textWeight')} value={d.text.weight} min={300} max={900} step={100} onChange={(weight) => d.text && set({ text: { ...d.text, weight } })} />
              </div>
            </>
          )}

          <h3 className="lbl-mono">{t('icons.badge')}</h3>
          {d.badge ? (
            <>
              <div className="ligne">
                <button type="button" className="btn sm ic-sym-btn" onClick={() => setPicking('badge')}>
                  <SymbolThumb art={artOf(d.badge.symbol)} color={textColor} size={20} />
                  <span>{d.badge.symbol.name.split('/').pop()}</span>
                </button>
                <button type="button" className="btn xs gh" onClick={() => set({ badge: null })}>
                  <Icon name="x" size={14} /> {t('icons.removeBadge')}
                </button>
              </div>
              <div className="seg ic-seg">
                {CORNERS.map((c) => (
                  <button key={c} type="button" className={d.badge?.corner === c ? 'on' : ''} onClick={() => d.badge && set({ badge: { ...d.badge, corner: c } })}>
                    {t(`icons.corner.${c}`)}
                  </button>
                ))}
              </div>
              <div className="ic-two">
                <ColorField label={t('icons.fg')} value={d.badge.fg} onChange={(fg) => d.badge && set({ badge: { ...d.badge, fg } })} />
                <ColorField label={t('icons.bg')} value={d.badge.bg} onChange={(bg) => d.badge && set({ badge: { ...d.badge, bg } })} />
              </div>
            </>
          ) : (
            <button type="button" className="btn xs gh" onClick={() => setPicking('badge')}>
              <Icon name="plus" size={14} /> {t('icons.addBadge')}
            </button>
          )}
        </section>
      )}

      {tab === 'off' && (
        <section className="ic-sec">
          <p className="muted petit">{t('icons.offStateHelp')}</p>
          {offOn && d.off ? (
            <>
              <div className="ic-two">
                <ColorField label={t('icons.fg')} value={d.off.fg ?? d.fg} onChange={(fg) => set({ off: { ...d.off, fg } })} />
                <ColorField label={t('icons.bg')} value={d.off.bg ?? d.bg} onChange={(bg) => set({ off: { ...d.off, bg } })} />
              </div>
              <div className="ligne">
                <button type="button" className="btn sm ic-sym-btn" onClick={() => setPicking('off')}>
                  <SymbolThumb art={artOf(d.off.symbol ?? sym)} color={textColor} size={20} />
                  <span>{d.off.symbol ? d.off.symbol.name : t('icons.sameSymbol')}</span>
                </button>
                {d.off.symbol && (
                  <button type="button" className="btn xs gh" onClick={() => set({ off: { ...d.off, symbol: undefined } })}>
                    {t('icons.sameSymbol')}
                  </button>
                )}
              </div>
              <button type="button" className="btn xs gh dn" onClick={() => { set({ off: null }); setShowOff(false); }}>
                <Icon name="trash" size={14} /> {t('icons.removeOff')}
              </button>
            </>
          ) : (
            <button type="button" className="btn xs gh" onClick={() => { set({ off: { fg: d.fg, bg: '#2c2c2e' } }); setShowOff(true); }}>
              <Icon name="plus" size={14} /> {t('icons.addOff')}
            </button>
          )}
        </section>
      )}

      {picking && (
        <SymbolPicker
          current={picking === 'main' ? sym : picking === 'badge' ? (d.badge?.symbol ?? null) : (d.off?.symbol ?? sym)}
          recent={state.recent}
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
