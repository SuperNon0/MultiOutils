import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HaPickerData, HaPickerEntity } from '../../../../../common/api';
import { Icon } from '../../../host/Icon';
import './ha-picker.css';

/** Noms français des types d'entités. */
export const HA_DOMAINS: Record<string, string> = {
  light: 'Lumières', switch: 'Interrupteurs', fan: 'Ventilateurs', cover: 'Volets', climate: 'Thermostats', media_player: 'Lecteurs',
  scene: 'Scènes', script: 'Scripts', automation: 'Automatisations', sensor: 'Capteurs', binary_sensor: 'Détecteurs', lock: 'Serrures',
  camera: 'Caméras', input_boolean: 'Boutons marche/arrêt', input_select: 'Listes', select: 'Listes', input_number: 'Nombres', number: 'Nombres',
  button: 'Boutons', input_button: 'Boutons', vacuum: 'Aspirateurs', person: 'Personnes', weather: 'Météo', alarm_control_panel: 'Alarmes',
  humidifier: 'Humidificateurs', siren: 'Sirènes', valve: 'Vannes', water_heater: 'Chauffe-eau', update: 'Mises à jour', device_tracker: 'Localisation'
};

const STATES: Record<string, string> = {
  on: 'Allumé', off: 'Éteint', open: 'Ouvert', closed: 'Fermé', opening: 'Ouverture', closing: 'Fermeture', unavailable: 'Indisponible',
  unknown: 'Inconnu', playing: 'Lecture', paused: 'Pause', idle: 'Inactif', locked: 'Verrouillé', unlocked: 'Déverrouillé', home: 'Maison',
  not_home: 'Absent', heat: 'Chauffe', cool: 'Clim', auto: 'Auto', standby: 'Veille', scening: 'Scène'
};

const ON = new Set(['on', 'open', 'playing', 'home', 'heat', 'cool', 'unlocked', 'opening', 'auto']);
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function stateText(e: HaPickerEntity): string {
  if (e.domain === 'scene' || e.domain === 'script' || e.domain === 'button' || e.domain === 'input_button') return '';
  const n = Number(e.state);
  if (e.state !== '' && Number.isFinite(n)) return `${n.toLocaleString('fr', { maximumFractionDigits: 1 })}${e.unit ? ` ${e.unit}` : ''}`;
  return STATES[e.state] ?? e.state;
}

export function HaPicker(): ReactNode {
  const [data, setData] = useState<HaPickerData | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [area, setArea] = useState<string>('');
  const [domain, setDomain] = useState('');

  const load = (): void => {
    setError('');
    window.api.haPicker
      .data()
      .then((d) => {
        setData(d);
        // on ouvre directement sur la pièce de l'entité actuelle
        const cur = d.entities.find((e) => e.id === d.current);
        setArea(cur ? (cur.area ?? '') : '*');
        setDomain('');
        setQ('');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    load();
    const off = window.api.haPicker.onRefresh(load);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.haPicker.choose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const base = useMemo(() => {
    if (!data) return [];
    const allowed = new Set(data.domains);
    return data.entities.filter((e) => !allowed.size || allowed.has(e.domain));
  }, [data]);

  const rooms = useMemo(() => {
    if (!data) return [];
    const count = new Map<string, number>();
    for (const e of base) count.set(e.area ?? '', (count.get(e.area ?? '') ?? 0) + 1);
    const floorName = new Map(data.floors.map((f) => [f.id, f.name]));
    const floorLevel = new Map(data.floors.map((f) => [f.id, f.level ?? 0]));
    return data.areas
      .filter((a) => count.get(a.id))
      .map((a) => ({ ...a, count: count.get(a.id) ?? 0, floorName: a.floor ? floorName.get(a.floor) : undefined, level: a.floor ? (floorLevel.get(a.floor) ?? 0) : 99 }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr'))
      .concat(count.get('') ? [{ id: '', name: 'Sans pièce', count: count.get('') ?? 0, floorName: undefined, level: 100 }] : []);
  }, [data, base]);

  const domains = useMemo(() => [...new Set(base.map((e) => e.domain))].sort((a, b) => (HA_DOMAINS[a] ?? a).localeCompare(HA_DOMAINS[b] ?? b, 'fr')), [base]);

  const searching = q.trim().length > 0;
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return base
      .filter((e) => (searching ? true : area === '*' || (e.area ?? '') === area))
      .filter((e) => !domain || e.domain === domain)
      .filter((e) => {
        if (!words.length) return true;
        const hay = norm(`${e.name} ${e.id} ${e.areaName ?? ''} ${e.floorName ?? ''} ${HA_DOMAINS[e.domain] ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .slice(0, 400);
  }, [base, q, area, domain, searching]);

  if (error)
    return (
      <div className="hp hp-vide">
        <p>Home Assistant ne répond pas : {error}</p>
        <div className="ligne">
          <button type="button" className="btn sm" onClick={load}>Réessayer</button>
          <button type="button" className="btn sm gh" onClick={() => window.api.haPicker.choose(null)}>Fermer</button>
        </div>
      </div>
    );
  if (!data) return <div className="hp hp-vide"><p>Chargement des entités…</p></div>;

  let lastFloor: string | undefined = '§';
  const roomName = area === '*' ? 'Toutes les pièces' : (rooms.find((r) => r.id === area)?.name ?? 'Sans pièce');

  return (
    <div className="hp">
      <header className="hp-top">
        <div className="hp-titre">
          <h1>Choisir une entité</h1>
          {data.title && <span>{data.title}</span>}
        </div>
        <label className="champ hp-q">
          <Icon name="search" size={17} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans toute la maison : salon, lampe, température…" />
        </label>
        <button type="button" className="btn sm gh" onClick={() => window.api.haPicker.choose(null)}>Annuler</button>
      </header>

      <div className="hp-corps">
        <nav className="hp-pieces" aria-label="Pièces">
          <button type="button" className={area === '*' && !searching ? 'on' : ''} onClick={() => { setArea('*'); setQ(''); }}>
            <span>Toutes les pièces</span><span className="n">{base.length}</span>
          </button>
          {rooms.map((r) => {
            const head = r.floorName !== lastFloor && r.floorName ? <span className="hp-etage">{r.floorName}</span> : null;
            lastFloor = r.floorName;
            return (
              <div key={r.id || 'none'}>
                {head}
                <button type="button" className={area === r.id && !searching ? 'on' : ''} onClick={() => { setArea(r.id); setQ(''); }}>
                  <span>{r.name}</span><span className="n">{r.count}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <main className="hp-liste">
          <div className="hp-sous">
            <h2>{searching ? `Résultats pour « ${q.trim()} »` : roomName}</h2>
            {domains.length > 1 && (
              <div className="chips">
                <button type="button" className={`chip${!domain ? ' on' : ''}`} onClick={() => setDomain('')}>Tout</button>
                {domains.map((d) => (
                  <button key={d} type="button" className={`chip${domain === d ? ' on' : ''}`} onClick={() => setDomain(d)}>
                    {HA_DOMAINS[d] ?? d}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!list.length ? (
            <p className="hp-rien">Aucune entité ici.</p>
          ) : (
            <div className="hp-grille">
              {list.map((e) => {
                const path = e.icon ? data.icons[e.icon] : undefined;
                const st = stateText(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`hp-carte${e.id === data.current ? ' actuelle' : ''}${ON.has(e.state) ? ' allume' : ''}${e.state === 'unavailable' ? ' hs' : ''}`}
                    title={e.id}
                    onClick={() => window.api.haPicker.choose(e.id)}
                  >
                    <span className="hp-ic">
                      <svg viewBox="0 0 24 24" aria-hidden="true">{path ? <path d={path} /> : <circle cx="12" cy="12" r="5" />}</svg>
                    </span>
                    <span className="hp-txt">
                      <b>{e.name}</b>
                      <span>{[searching || area === '*' ? e.areaName : '', HA_DOMAINS[e.domain]?.replace(/s$/, '') ?? e.domain].filter(Boolean).join(' · ')}</span>
                    </span>
                    {st && <span className="hp-etat">{st}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
