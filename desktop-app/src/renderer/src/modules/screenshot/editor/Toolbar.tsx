import type { ReactNode } from 'react';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';
import type { ToolId } from './model';

/** Outils + raccourcis clavier (docs/00 §3). */
export const TOOLS: Array<{ id: ToolId; icon: string; key: string }> = [
  { id: 'select', icon: 'cursor', key: 'V' },
  { id: 'rect', icon: 'rectTool', key: 'R' },
  { id: 'ellipse', icon: 'ellipseTool', key: 'O' },
  { id: 'triangle', icon: 'triangleTool', key: 'G' },
  { id: 'line', icon: 'lineTool', key: 'L' },
  { id: 'arrow', icon: 'arrowTool', key: 'A' },
  { id: 'text', icon: 'textTool', key: 'T' },
  { id: 'pen', icon: 'penTool', key: 'P' },
  { id: 'highlighter', icon: 'highlightTool', key: 'H' },
  { id: 'blur', icon: 'blurTool', key: 'B' },
  { id: 'steps', icon: 'stepsTool', key: 'N' },
  { id: 'crop', icon: 'cropTool', key: 'C' },
  { id: 'eraser', icon: 'eraserTool', key: 'E' }
];

export function Toolbar({
  tool,
  onChange
}: {
  tool: ToolId;
  onChange(tool: ToolId): void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="editor-toolbar" role="toolbar" aria-orientation="vertical">
      {TOOLS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`tool-btn${tool === entry.id ? ' active' : ''}`}
          title={`${t(`editor.tool.${entry.id}`)} (${entry.key})`}
          aria-label={t(`editor.tool.${entry.id}`)}
          aria-pressed={tool === entry.id}
          onClick={() => onChange(entry.id)}
        >
          <Icon name={entry.icon} size={17} />
        </button>
      ))}
    </div>
  );
}
