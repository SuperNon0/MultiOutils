/**
 * Une action Stream Deck par modèle de touche Home Assistant. Toutes partagent
 * le même code et le même panneau (ui/ha.html), qui s'adapte au modèle :
 * types d'entités proposés, réglages de départ, modèles prêts.
 */
import type { HaKeySettings } from './settings';

export interface HaKind {
  id: string;
  uuid: string;
  /** Types d'entités proposés (vide = tous). */
  domains: string[];
  /** Réglages posés sur une touche neuve. */
  defaults: Partial<HaKeySettings>;
}

const U = 'com.supernon0.multioutils.ha';

export const HA_KINDS: HaKind[] = [
  { id: 'light', uuid: `${U}.light`, domains: ['light'], defaults: { mode: 'toggle', gauge: true } },
  { id: 'switch', uuid: `${U}.switch`, domains: ['switch', 'input_boolean', 'fan', 'humidifier', 'siren', 'valve', 'lock', 'vacuum'], defaults: { mode: 'toggle' } },
  { id: 'cover', uuid: `${U}.cover`, domains: ['cover'], defaults: { mode: 'toggle', gauge: true } },
  { id: 'climate', uuid: `${U}.climate`, domains: ['climate', 'water_heater'], defaults: { mode: 'auto', valueMode: 'show' } },
  { id: 'sensor', uuid: `${U}.sensor`, domains: ['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'input_number', 'number'], defaults: { mode: 'display', valueMode: 'show' } },
  { id: 'media', uuid: `${U}.media`, domains: ['media_player'], defaults: { mode: 'media', media: 'play_pause', art: true } },
  { id: 'scene', uuid: `${U}.scene`, domains: ['scene', 'script', 'automation', 'button', 'input_button'], defaults: { mode: 'auto', style: 'plein' } },
  { id: 'camera', uuid: `${U}.camera`, domains: ['camera'], defaults: { mode: 'camera', refresh: 5, titleMode: 'none' } },
  // l'action d'origine reste : tous les types, tous les modes (service libre, événement…)
  { id: 'all', uuid: U, domains: [], defaults: {} }
];

export const kindOf = (uuid: string): HaKind => HA_KINDS.find((k) => k.uuid === uuid) ?? HA_KINDS[HA_KINDS.length - 1];
