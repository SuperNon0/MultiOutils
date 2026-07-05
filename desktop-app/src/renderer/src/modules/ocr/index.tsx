import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { OcrPanel } from './OcrPanel';

/** Module « OCR » (docs/00 §9.1) — troisième outil de l'hôte. */
export const ocrModule: ToolModule = {
  id: 'ocr',
  name: 'ocr.title',
  icon: 'textScan',
  order: 3,

  activate(): void {
    // l'extraction (Tesseract) tourne côté main
  },

  renderPanel(): ReactNode {
    return <OcrPanel />;
  }
};
