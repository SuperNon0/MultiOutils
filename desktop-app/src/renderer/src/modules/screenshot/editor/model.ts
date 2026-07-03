/**
 * Modèle des annotations de l'éditeur (docs/00 §2). Sérialisé en JSON dans la
 * colonne `captures.annotations` pour la ré-édition ; l'export produit une
 * image aplatie.
 */

export type ToolId =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pen'
  | 'highlighter'
  | 'blur'
  | 'steps'
  | 'crop'
  | 'eraser';

export interface BaseObject {
  id: string;
  type: string;
  opacity: number;
  rotation?: number;
}

export interface RectObject extends BaseObject {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
}

export interface EllipseObject extends BaseObject {
  type: 'ellipse';
  x: number; // centre
  y: number;
  radiusX: number;
  radiusY: number;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
}

export interface TriangleObject extends BaseObject {
  type: 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
}

export interface LineObject extends BaseObject {
  type: 'line';
  points: number[]; // [x1, y1, x2, y2]
  stroke: string;
  strokeWidth: number;
}

export interface ArrowObject extends BaseObject {
  type: 'arrow';
  points: number[];
  stroke: string;
  strokeWidth: number;
  /** Taille de la pointe (docs/00 §2.1). */
  headSize: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  fill: string;
  /** Contour du texte (null = aucun). */
  stroke: string | null;
  /** Fond derrière le texte (null = aucun). */
  background: string | null;
}

export interface PenObject extends BaseObject {
  type: 'pen' | 'highlighter';
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface BlurObject extends BaseObject {
  type: 'blur';
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'blur' | 'pixelate';
  strength: number; // rayon de flou / taille de pixel
}

export interface StepObject extends BaseObject {
  type: 'step';
  x: number;
  y: number;
  radius: number;
  value: number;
  fill: string;
  textColor: string;
}

export type AnnoObject =
  | RectObject
  | EllipseObject
  | TriangleObject
  | LineObject
  | ArrowObject
  | TextObject
  | PenObject
  | BlurObject
  | StepObject;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorDoc {
  version: 1;
  crop: CropRect | null;
  objects: AnnoObject[];
}

export const EMPTY_DOC: EditorDoc = { version: 1, crop: null, objects: [] };

export function parseDoc(json: string | null): EditorDoc {
  if (!json) return structuredClone(EMPTY_DOC);
  try {
    const parsed = JSON.parse(json) as EditorDoc;
    if (parsed && Array.isArray(parsed.objects)) {
      return { version: 1, crop: parsed.crop ?? null, objects: parsed.objects };
    }
  } catch {
    // JSON corrompu : on repart d'un document vide (l'image reste intacte)
  }
  return structuredClone(EMPTY_DOC);
}

/** Style « courant » appliqué aux prochains objets (panneau de propriétés). */
export interface StyleState {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillOn: boolean;
  fill: string;
  headSize: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  textStrokeOn: boolean;
  textBackgroundOn: boolean;
  blurMode: 'blur' | 'pixelate';
  blurStrength: number;
}

export const DEFAULT_STYLE: StyleState = {
  stroke: '#e8c547',
  strokeWidth: 3,
  opacity: 1,
  fillOn: false,
  fill: '#e8c547',
  headSize: 12,
  fontSize: 24,
  fontFamily: 'DM Mono',
  bold: false,
  italic: false,
  textStrokeOn: false,
  textBackgroundOn: false,
  blurMode: 'pixelate',
  blurStrength: 12
};

export const PALETTE = [
  '#e8c547', // doré (accent)
  '#e85c47', // danger
  '#4ecb71',
  '#4e9fcb',
  '#a78bfa',
  '#f0ede6',
  '#1c1f25',
  '#000000'
];

export const FONT_FAMILIES = ['DM Mono', 'DM Serif Display', 'Arial', 'Segoe UI'];

/** Prochain numéro d'étape : max existant + 1 (docs/00 §2.1). */
export function nextStepValue(doc: EditorDoc): number {
  let max = 0;
  for (const object of doc.objects) {
    if (object.type === 'step' && object.value > max) max = object.value;
  }
  return max + 1;
}
