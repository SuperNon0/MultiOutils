/**
 * Dessin des touches Home Assistant (SVG 144×144) : icône, couleur selon
 * l'état, nom, valeur, jauge, indicateur de connexion, image (caméra,
 * pochette). Même allure que les autres touches MultiOutils.
 */

export type KeyStyle = 'accent' | 'plein' | 'symbole' | 'teinte';

export interface KeyLook {
  style: KeyStyle;
  /** Fond de l'app (#rrggbb) et thème. */
  background: string;
  dark: boolean;
  /** Couleur active (#rrggbb). */
  color: string;
  /** Allumé / actif. */
  on: boolean;
  /** Tracé SVG 24×24 de l'icône (Material Design), ou glyphe de secours. */
  iconPath?: string | null;
  /** Glyphe de secours en traits (24×24). */
  fallback?: string;
  title?: string;
  value?: string;
  textColor?: string;
  /** Jauge de 0 à 100. */
  gauge?: number | null;
  /** Indisponible (entité) ou hors ligne (connexion). */
  unavailable?: boolean;
  offline?: boolean;
  /** Image de fond (caméra, pochette) en data URL. */
  image?: string | null;
  /** Clignotement : phase éteinte. */
  dimmed?: boolean;
  /** Bandeau de confirmation. */
  confirm?: string;
}

const esc = (s: string): string => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] as string);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const alpha = (hex: string, a: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Texte tronqué pour tenir sur la touche. */
function fit(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export function renderKey(k: KeyLook): string {
  const fg0 = k.dark ? '#f0ede6' : '#1b1d22';
  const muted = k.dark ? '#8a94aa' : '#666b77';
  let bg = k.background;
  let glyph = k.color;
  let text = fg0;
  let bgExtra = '';
  const active = k.on && !k.unavailable;

  switch (k.style) {
    case 'plein':
      bg = active ? k.color : alpha(k.color, k.dark ? 0.28 : 0.22);
      glyph = active ? (luminance(k.color) > 0.62 ? '#15161a' : '#ffffff') : k.dark ? '#ffffff' : '#1b1d22';
      text = glyph;
      break;
    case 'teinte':
      bgExtra = `<rect width="144" height="144" rx="22" fill="url(#t)"/>`;
      glyph = active ? k.color : alpha(k.color, 0.7);
      break;
    case 'symbole':
      bg = k.dark ? '#0c0d10' : '#ffffff';
      glyph = active ? k.color : alpha(k.color, 0.5);
      break;
    default:
      // « comme l'app » : fond de l'app, symbole coloré, atténué à l'arrêt
      glyph = active ? k.color : muted;
  }
  if (k.unavailable) glyph = muted;

  const hasTitle = !!k.title;
  const hasValue = !!k.value;
  // place de l'icône selon le texte autour
  const iconSize = hasTitle && hasValue ? 52 : hasTitle || hasValue ? 62 : 76;
  const iconY = hasValue && !k.image ? 44 : 22;
  const iconTop = hasTitle ? Math.min(iconY, 104 - iconSize - 4) : (144 - iconSize) / 2;
  const scale = iconSize / 24;
  const ix = (144 - iconSize) / 2;

  let icon = '';
  if (!k.image) {
    if (k.iconPath) icon = `<path transform="translate(${ix} ${iconTop}) scale(${scale})" d="${esc(k.iconPath)}" fill="${glyph}"/>`;
    else if (k.fallback)
      icon = `<g transform="translate(${ix} ${iconTop}) scale(${scale})" fill="none" stroke="${glyph}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${k.fallback}</g>`;
  }

  const parts: string[] = [];
  parts.push(
    `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${alpha(k.color, active ? 0.5 : 0.22)}"/><stop offset="1" stop-color="${alpha(k.color, active ? 0.16 : 0.06)}"/></linearGradient>` +
      `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.78)"/></linearGradient>` +
      `<clipPath id="c"><rect width="144" height="144" rx="22"/></clipPath></defs>`
  );
  parts.push(`<rect width="144" height="144" rx="22" fill="${bg}"/>`);
  if (bgExtra) parts.push(bgExtra);
  if (k.image) {
    parts.push(`<image href="${k.image}" width="144" height="144" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/>`);
    parts.push(`<rect width="144" height="144" rx="22" fill="url(#s)"/>`);
    text = '#ffffff';
  }
  if (k.textColor && /^#[0-9a-f]{6}$/i.test(k.textColor)) text = k.textColor;
  if (active && (k.style === 'symbole' || k.style === 'teinte')) parts.push(`<rect x="2" y="2" width="140" height="140" rx="20" fill="none" stroke="${alpha(k.color, 0.75)}" stroke-width="3"/>`);
  parts.push(icon);

  if (hasValue) {
    const v = fit(k.value as string, 11);
    const size = v.length <= 5 ? 30 : v.length <= 8 ? 24 : 19;
    const y = k.image ? 30 : 34;
    parts.push(`<text x="72" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${text}">${esc(v)}</text>`);
  }
  if (hasTitle) {
    const t = fit(k.title as string, 14);
    const size = t.length <= 9 ? 21 : t.length <= 12 ? 18 : 16;
    parts.push(`<text x="72" y="${k.gauge != null ? 122 : 128}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="600" fill="${text}" opacity="${k.unavailable ? 0.6 : 0.95}">${esc(t)}</text>`);
  }
  if (k.gauge != null && Number.isFinite(k.gauge)) {
    const w = Math.round((Math.max(0, Math.min(100, k.gauge)) / 100) * 104);
    const track = k.style === 'plein' && active ? 'rgba(255,255,255,.3)' : alpha(k.color, 0.22);
    const fill = k.style === 'plein' && active ? glyph : k.color;
    parts.push(`<rect x="20" y="131" width="104" height="6" rx="3" fill="${track}"/><rect x="20" y="131" width="${w}" height="6" rx="3" fill="${fill}"/>`);
  }
  if (k.offline) parts.push(`<circle cx="18" cy="18" r="8" fill="#efb36b" stroke="${k.background}" stroke-width="3"/>`);
  else if (k.unavailable) parts.push(`<circle cx="18" cy="18" r="8" fill="#ef7d6b" stroke="${k.background}" stroke-width="3"/>`);
  if (k.confirm) {
    parts.push(`<rect width="144" height="144" rx="22" fill="rgba(191,63,44,.92)"/>`);
    parts.push(`<text x="72" y="66" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="${k.textColor && /^#[0-9a-f]{6}$/i.test(k.textColor) ? k.textColor : '#ffffff'}">${esc(fit(k.confirm, 12))}</text>`);
    parts.push(`<text x="72" y="96" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="${k.textColor && /^#[0-9a-f]{6}$/i.test(k.textColor) ? k.textColor : '#ffffff'}" opacity=".9">Rappuie</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"${k.dimmed ? ' opacity="0.35"' : ''}>${parts.join('')}</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/** Glyphes de secours (traits 24×24) quand l'icône Material Design n'est pas disponible. */
export const FALLBACK: Record<string, string> = {
  light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  switch: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
  cover: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M4 8h16M4 12h16M4 16h16"/>',
  scene: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/>',
  sensor: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/>',
  media_player: '<path d="M8 5.5v13l10.5-6.5z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  camera: '<path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13" r="3.5"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  pclock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  shutdown: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  template: '<path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2"/>',
  event: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/>'
};

export function fallbackFor(domain: string): string {
  if (FALLBACK[domain]) return FALLBACK[domain];
  if (['input_boolean', 'fan', 'automation', 'siren', 'humidifier'].includes(domain)) return FALLBACK.switch;
  if (['script', 'button', 'input_button'].includes(domain)) return FALLBACK.scene;
  if (['binary_sensor', 'number', 'input_number', 'weather'].includes(domain)) return FALLBACK.sensor;
  return FALLBACK.home;
}
