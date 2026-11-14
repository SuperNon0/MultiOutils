import type { ReactNode } from 'react';
import { onActivePage, ZONE_MIN_WIDTH, ZONE_MIN_HEIGHT, type Zone, type DesktopState } from '../../../../common/desktop';
import { topRow } from '../../../../common/zone-layout';
import { Aide, ui } from '../../encre/ui';
import { useI18n } from '../../i18n';

export function ZoneGeometry({ zone, state }: { zone: Zone; state: DesktopState }): ReactNode {
  const { t } = useI18n();
  if (zone.tabOf) return null;
  const screen = state.displays.find((d) => d.id === zone.bounds.displayId) ?? state.displays.find((d) => d.primary) ?? state.displays[0];
  if (!screen) return null;
  const area = screen.workArea;
  const save = (field: 'x' | 'y' | 'width' | 'height', value: string): void => {
    if (!value.trim() || !Number.isFinite(Number(value))) return;
    const b = { ...zone.bounds, displayId: screen.id, [field]: Math.round(Number(value)) };
    b.width = Math.min(area.width, Math.max(ZONE_MIN_WIDTH, b.width));
    b.height = Math.min(area.height, Math.max(ZONE_MIN_HEIGHT, b.height));
    b.x = Math.min(area.width - b.width, Math.max(0, b.x));
    b.y = Math.min(area.height - b.height, Math.max(0, b.y));
    void window.api.desktop.updateZone(zone.id, { bounds: b });
  };
  const arrange = async (): Promise<void> => {
    const targets = state.zones.filter((z) => !z.tabOf && z.enabled && !z.locked &&
      (z.bounds.displayId === screen.id || (!state.displays.some((d) => d.id === z.bounds.displayId) && screen.primary)) &&
      onActivePage(z, state.settings)).sort((a, b) => a.bounds.x - b.bounds.x);
    const rects = topRow(targets.length, area.width, area.height, state.settings.gap, zone.bounds.height);
    if (!rects) { ui.toast(t('desktop.geometry.noSpace')); return; }
    const previous = targets.map((z) => ({ id: z.id, bounds: z.bounds }));
    await Promise.all(targets.map((z, i) => window.api.desktop.updateZone(z.id, { bounds: { displayId: screen.id, ...rects[i] } })));
    ui.toast(t('desktop.geometry.done'), { annuler: async () => {
      await Promise.all(previous.map((z) => window.api.desktop.updateZone(z.id, { bounds: z.bounds })));
    } });
  };
  return <div className="bz-geometry">
    <div className="lbl-mono">{t('desktop.geometry.title')} <Aide titre={t('desktop.geometry.title')} texte={t('desktop.geometry.help')} /></div>
    <p className="muted petit">{screen.label} · {area.width} × {area.height} px</p>
    <div className="bz-geometry-fields">
      {(['width', 'height', 'x', 'y'] as const).map((field) => <label key={field}>
        {t('desktop.geometry.' + field)}
        <input key={String(zone.bounds[field])} className="input mono" type="number" step={1}
          min={field === 'width' ? ZONE_MIN_WIDTH : field === 'height' ? ZONE_MIN_HEIGHT : 0}
          max={field === 'width' || field === 'x' ? area.width : area.height}
          defaultValue={zone.bounds[field]} disabled={zone.locked}
          onBlur={(e) => save(field, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </label>)}
    </div>
    {zone.locked && <p className="muted petit">{t('desktop.geometry.unlock')}</p>}
    <button className="btn sm" disabled={zone.locked} onClick={() => void arrange()}>{t('desktop.geometry.arrange')}</button>
    <p className="muted petit">{t('desktop.geometry.arrangeHelp')}</p>
  </div>;
}
