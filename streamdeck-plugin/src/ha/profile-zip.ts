/**
 * Fabrique le fichier .streamDeckProfile du panneau lumière (une archive zip
 * sans compression), au même format que les profils fournis par d'autres
 * plugins que Stream Deck installe : un dossier <UUID>.sdProfile avec un
 * manifest.json et un dossier vide par touche.
 */
import { panelLayout, profileManifest } from './light-panel';

export const PROFILE_UUID = '6F1D2C3B-4A5E-4F60-9B7A-2C4D6E8F0A1B';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive zip « stockée » (sans compression), date fixe pour un fichier stable. */
export function zipStore(files: Array<{ name: string; data?: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 24;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data ?? new Uint8Array(0);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // noms en UTF-8
    lv.setUint16(8, 0, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, f.name.endsWith('\\') || f.name.endsWith('/') ? 0x10 : 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** Octets du fichier « MultiOutils Lumière.streamDeckProfile ». */
export function buildLightProfile(): Uint8Array {
  const root = `${PROFILE_UUID}.sdProfile\\`;
  const files: Array<{ name: string; data?: Uint8Array }> = [{ name: root }];
  const keys = panelLayout()
    .map((k) => `${k.col},${k.row}`)
    .sort();
  for (const k of keys) files.push({ name: `${root}${k}\\` });
  files.push({ name: `${root}manifest.json`, data: new TextEncoder().encode(JSON.stringify(profileManifest())) });
  return zipStore(files);
}
