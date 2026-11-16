import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CURATED,
  searchVariants,
  svgDataUrl,
  symbolKey,
  type StreamDeckPackInfo,
  type SymbolArt,
  type SymbolCatalog,
  type SymbolLib,
  type SymbolRef
} from '../../../../common/icons';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { artOf, requestArts, useArtVersion } from './art';

const PAGE = 240;
const catalogs = new Map<string, Promise<SymbolCatalog>>();
const loadCatalog = (lib: SymbolLib, pack?: string): Promise<SymbolCatalog> => {
  const key = lib === 'pack' ? `pack:${pack}` : lib;
  let p = catalogs.get(key);
  if (!p) {
    p = window.api.icons.catalog(lib, pack);
    if (lib !== 'pack') catalogs.set(key, p);
  }
  return p;
};

export const PHOSPHOR_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Relit une clé de symbole (récents) : « lib:pack/nom@graisse ». */
export function parseSymbolKey(key: string): SymbolRef | null {
  const m = /^(phosphor|tabler|mdi|pack):(.+)$/.exec(key);
  if (!m) return null;
  const lib = m[1] as SymbolLib;
  let rest = m[2];
  let weight: string | undefined;
  const at = rest.lastIndexOf('@');
  if (at > 0) {
    weight = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  if (lib === 'pack') {
    const slash = rest.indexOf('/');
    if (slash < 0) return null;
    return { lib, pack: rest.slice(0, slash), name: rest.slice(slash + 1), ...(weight ? { weight } : {}) };
  }
  return { lib, name: rest, ...(weight ? { weight } : {}) };
}

/** Petit aperçu d'un symbole (dans une <img> : rien ne s'exécute). */
export function SymbolThumb({ art, color, size = 28 }: { art: SymbolArt | null | undefined; color: string; size?: number }): ReactNode {
  if (art === undefined) return <span className="ic-sym-wait" style={{ width: size, height: size }} />;
  if (art === null) return <span className="ic-sym-wait miss" style={{ width: size, height: size }} />;
  if (art.image) return <img src={art.image} alt="" width={size} height={size} draggable={false} />;
  const paint = art.paint === 'stroke' ? `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` : `fill="${color}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}" ${paint}>${art.body.replace(/currentColor/g, color)}</svg>`;
  return <img src={svgDataUrl(svg)} alt="" width={size} height={size} draggable={false} />;
}

type Source = 'selection' | 'recent' | SymbolLib | `pack:${string}`;

export function SymbolPicker({
  current,
  recent,
  onPick,
  onClose
}: {
  current: SymbolRef | null;
  recent: string[];
  onPick(ref: SymbolRef): void;
  onClose(): void;
}): ReactNode {
  const { t } = useI18n();
  useArtVersion();
  const [source, setSource] = useState<Source>(current?.lib === 'pack' && current.pack ? `pack:${current.pack}` : current ? 'selection' : 'selection');
  const [packs, setPacks] = useState<StreamDeckPackInfo[]>([]);
  const [catalog, setCatalog] = useState<SymbolCatalog | null>(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [weight, setWeight] = useState<string>(current?.lib === 'phosphor' && current.weight ? current.weight : 'fill');
  const [tablerFilled, setTablerFilled] = useState(current?.lib === 'tabler' && current.weight === 'filled');
  const color = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e7ebf3', []);

  useEffect(() => {
    void window.api.icons.packs().then(setPacks);
  }, []);

  const lib: SymbolLib = source === 'selection' || source === 'recent' ? 'phosphor' : source.startsWith('pack:') ? 'pack' : (source as SymbolLib);
  const packId = source.startsWith('pack:') ? source.slice(5) : undefined;

  useEffect(() => {
    setCat('');
    setLimit(PAGE);
    if (source === 'recent') return setCatalog(null);
    // la sélection cherche dans tout Phosphor quand on tape
    let alive = true;
    void loadCatalog(lib, packId).then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, [source]);

  useEffect(() => setLimit(PAGE), [q, cat]);

  const refFor = (name: string): SymbolRef =>
    lib === 'phosphor'
      ? { lib, name, weight }
      : lib === 'tabler'
        ? { lib, name, ...(tablerFilled ? { weight: 'filled' } : {}) }
        : lib === 'pack'
          ? { lib, name, pack: packId }
          : { lib, name };

  const { list, total } = useMemo((): { list: SymbolRef[]; total: number } => {
    if (source === 'recent') {
      const refs = recent.map(parseSymbolKey).filter((r): r is SymbolRef => !!r);
      return { list: refs, total: refs.length };
    }
    const needle = norm(q.trim());
    if (source === 'selection' && !needle) {
      const folders = cat ? CURATED.filter((c) => c.id === cat) : CURATED;
      const names = [...new Set(folders.flatMap((c) => c.names))];
      return { list: names.map(refFor), total: names.length };
    }
    if (!catalog) return { list: [], total: 0 };
    let entries = catalog.entries;
    if (cat && source !== 'selection') entries = entries.filter((e) => e.cat === cat);
    if (lib === 'tabler' && tablerFilled) entries = entries.filter((e) => e.tags[0] === 'filled');
    if (needle) {
      // chaque mot peut être tapé en français (« lampe » cherche aussi « lamp »)
      const words = needle.split(/\s+/).map(searchVariants);
      // mot tapé : début d'un mot du nom ou des étiquettes ; traduction : mot entier
      entries = entries.filter((e) => {
        const tokens = norm(`${e.name} ${e.tags.join(' ')}`).split(/[\s\-_/]+/);
        return words.every(([typed, ...alts]) => tokens.some((tk) => tk.startsWith(typed) || alts.includes(tk)));
      });
      // les noms qui commencent par la recherche d'abord
      const first = words[0];
      const rank = (n: string): number => (first.some((w) => norm(n).startsWith(w)) ? 0 : 1);
      entries = [...entries].sort((a, b) => rank(a.name) - rank(b.name));
    }
    return { list: entries.slice(0, limit).map((e) => refFor(e.name)), total: entries.length };
  }, [source, catalog, cat, q, limit, weight, tablerFilled, recent]);

  useEffect(() => requestArts(list), [list]);

  const cats: Array<{ id: string; label: string; count: number }> =
    source === 'selection' ? CURATED.map((c) => ({ id: c.id, label: c.label, count: c.names.length })) : (catalog?.categories ?? []);

  const sources: Array<{ id: Source; label: string }> = [
    { id: 'selection', label: t('icons.src.selection') },
    { id: 'recent', label: t('icons.src.recent') },
    { id: 'phosphor', label: 'Phosphor' },
    { id: 'tabler', label: 'Tabler' },
    { id: 'mdi', label: 'Material' },
    ...packs.map((p) => ({ id: `pack:${p.id}` as Source, label: p.name }))
  ];

  const curKey = current ? symbolKey(current) : '';

  return (
    <Feuille titre={t('icons.pickSymbol')} onClose={onClose} large className="ic-picker">
      <div className="ic-pk-top">
        <div className="chips">
          {sources.map((s) => (
            <button key={s.id} type="button" className={`chip${source === s.id ? ' on' : ''}`} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="ligne">
          <label className="champ ic-pk-q">
            <Icon name="search" size={16} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('icons.searchSymbol')} />
          </label>
          {lib === 'phosphor' && source !== 'recent' && (
            <div className="seg ic-seg">
              {PHOSPHOR_WEIGHTS.map((w) => (
                <button key={w} type="button" className={weight === w ? 'on' : ''} onClick={() => setWeight(w)} title={t(`icons.weight.${w}`)}>
                  {t(`icons.weight.${w}`)}
                </button>
              ))}
            </div>
          )}
          {lib === 'tabler' && (
            <div className="seg ic-seg">
              <button type="button" className={!tablerFilled ? 'on' : ''} onClick={() => setTablerFilled(false)}>{t('icons.outline')}</button>
              <button type="button" className={tablerFilled ? 'on' : ''} onClick={() => setTablerFilled(true)}>{t('icons.filled')}</button>
            </div>
          )}
        </div>
      </div>
      <div className="ic-pk-body">
        {source !== 'recent' && (
          <nav className="ic-pk-cats">
            <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>
              {t('icons.allCats')}
            </button>
            {cats.map((c) => (
              <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                <span>{c.label}</span>
                <span className="n">{c.count}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="ic-pk-grid-wrap">
          {source === 'selection' && q.trim() && <p className="muted petit">{t('icons.searchAllPhosphor')}</p>}
          {!list.length && <p className="vide">{source === 'recent' ? t('icons.noRecent') : catalog || source === 'selection' ? t('icons.noResult') : t('icons.loading')}</p>}
          <div className="ic-pk-grid">
            {list.map((r) => {
              const k = symbolKey(r);
              const label = r.lib === 'pack' ? r.name.replace(/\.[a-z]+$/i, '').split('/').pop() : r.name;
              return (
                <button key={k} type="button" className={`ic-pk-it${k === curKey ? ' on' : ''}`} title={label} onClick={() => onPick(r)}>
                  <SymbolThumb art={artOf(r)} color={color} size={30} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {total > list.length && source !== 'recent' && (
            <button type="button" className="btn sm gh ic-pk-more" onClick={() => setLimit((l) => l + PAGE)}>
              {t('icons.showMore', { n: String(total - list.length) })}
            </button>
          )}
        </div>
      </div>
    </Feuille>
  );
}
