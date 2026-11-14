import type { HaEntity, HaWidgetAction } from '../../../../common/desktop';
import { isOn, type HaState } from './homeassistant';

export function widgetEntity(st: HaState): HaEntity {
  const a = st.attributes ?? {};
  const features = typeof a.supported_features === 'number' ? a.supported_features : 0;
  const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
  const domain = st.entity_id.split('.')[0];
  const supportsBrightness = domain === 'light' && (typeof a.brightness === 'number' || modes.some((m) => ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white'].includes(String(m))));
  return {
    id: st.entity_id, name: String(a.friendly_name ?? st.entity_id), domain, state: st.state, on: isOn(st),
    unit: typeof a.unit_of_measurement === 'string' ? a.unit_of_measurement : undefined,
    deviceClass: typeof a.device_class === 'string' ? a.device_class : undefined,
    brightness: typeof a.brightness === 'number' ? Math.round(Math.min(255, Math.max(0, a.brightness)) / 255 * 100) : undefined,
    supportsBrightness,
    mediaTitle: typeof a.media_title === 'string' ? a.media_title : undefined,
    mediaArtist: typeof a.media_artist === 'string' ? a.media_artist : undefined,
    mediaControls: domain === 'media_player' ? {
      previous: !!(features & 16), next: !!(features & 32),
      playPause: st.state === 'playing' ? !!(features & 1) : !!(features & 16384)
    } : undefined
  };
}

/** Only expose controls explicitly supported by the real HA entity. */
export function widgetCommand(st: HaState, action: HaWidgetAction, value?: number): { domain: string; service: string; data: Record<string, unknown> } {
  if (['unavailable', 'unknown'].includes(st.state)) throw new Error('Entity unavailable');
  const entity = widgetEntity(st);
  if (action === 'brightness' && entity.supportsBrightness && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
    return { domain: 'light', service: 'turn_on', data: { entity_id: st.entity_id, brightness_pct: Math.round(value) } };
  }
  const mediaService = { previous: 'media_previous_track', next: 'media_next_track', playPause: 'media_play_pause' };
  if (action !== 'brightness' && entity.mediaControls?.[action]) {
    return { domain: 'media_player', service: mediaService[action], data: { entity_id: st.entity_id } };
  }
  throw new Error('Unsupported widget control');
}
