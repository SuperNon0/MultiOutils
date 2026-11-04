/**
 * Préparation de l'image envoyée à l'IA (logique pure, testée).
 *
 * Limites des API : ~5 Mo par image (encodée en base64, donc ~3,75 Mo de
 * fichier) et 8000 px de côté au plus. On envoie le fichier de la capture
 * tel quel si possible ; sinon on le réduit (nativeImage, voir ./index.ts).
 */
export const MAX_IMAGE_BYTES = 3_700_000;
export const MAX_IMAGE_EDGE = 8000;
/** Tailles (plus grand côté) essayées tour à tour quand il faut réduire. */
export const RESIZE_EDGES = [2560, 1920, 1440, 1024];

export interface ImageFacts {
  width: number;
  height: number;
  bytes: number;
  png: boolean;
}

/** Le fichier peut-il partir tel quel ? */
export function canSendAsIs(img: ImageFacts): boolean {
  return img.png && img.bytes <= MAX_IMAGE_BYTES && Math.max(img.width, img.height) <= MAX_IMAGE_EDGE;
}

/**
 * Dimensions à essayer, de la plus grande à la plus petite : d'abord la
 * taille d'origine (si elle respecte la limite de côté), puis les paliers
 * de RESIZE_EDGES plus petits que l'image. Jamais d'agrandissement.
 */
export function candidateSizes(width: number, height: number): Array<{ width: number; height: number }> {
  const long = Math.max(width, height, 1);
  const sizes: Array<{ width: number; height: number }> = [];
  if (long <= MAX_IMAGE_EDGE) sizes.push({ width, height });
  for (const edge of RESIZE_EDGES) {
    if (edge >= long) continue;
    const k = edge / long;
    sizes.push({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) });
  }
  if (sizes.length === 0) sizes.push({ width, height });
  return sizes;
}
