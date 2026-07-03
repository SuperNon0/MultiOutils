import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { Capture } from '@multioutils/shared';
import { useHost } from '../../../host/context';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';
import { CanvasStage, type StageHandle } from './CanvasStage';
import { ExportDialog, type ExportFormat } from './ExportDialog';
import { useHistory } from './history';
import {
  DEFAULT_STYLE,
  parseDoc,
  type AnnoObject,
  type CropRect,
  type StyleState,
  type ToolId
} from './model';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar, TOOLS } from './Toolbar';

const STYLE_KEY = 'multioutils.editor.style';
const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
};

function loadStyle(): StyleState {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    return raw ? { ...DEFAULT_STYLE, ...(JSON.parse(raw) as StyleState) } : { ...DEFAULT_STYLE };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

/**
 * Éditeur / annotation (docs/00 §2) : canvas Konva, barre d'outils à gauche,
 * propriétés à droite, barre haute fichier / undo-redo / export.
 */
export function EditorView({
  capture,
  onClose
}: {
  capture: Capture;
  onClose(): void;
}): ReactNode {
  const { t } = useI18n();
  const host = useHost();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const history = useHistory(parseDoc(capture.annotations));
  const { doc } = history;
  const [tool, setToolState] = useState<ToolId>('select');
  const [style, setStyle] = useState<StyleState>(loadStyle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const [zoom, setZoom] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const stageHandle = useRef<StageHandle>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const savedJson = useRef(JSON.stringify(parseDoc(capture.annotations)));
  const clipboardObj = useRef<AnnoObject | null>(null);

  // Charge l'image ORIGINALE (les annotations restent vectorielles ; le
  // fichier de la bibliothèque peut déjà être aplati — voir docs/06).
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void fetch(`mo-media://original/${capture.id}`)
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (!cancelled) setImage(img);
        };
        img.src = url;
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [capture.id]);

  // Zoom initial : ajuster à la fenêtre
  const fitZoom = useCallback((): number => {
    const wrap = wrapRef.current;
    if (!wrap || !image) return 1;
    const w = doc.crop?.width ?? image.naturalWidth;
    const h = doc.crop?.height ?? image.naturalHeight;
    return Math.min((wrap.clientWidth - 24) / w, (wrap.clientHeight - 24) / h, 1);
  }, [image, doc.crop]);

  useEffect(() => {
    if (image) setZoom(Math.max(0.05, fitZoom()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // persistance du style courant
  useEffect(() => {
    localStorage.setItem(STYLE_KEY, JSON.stringify(style));
  }, [style]);

  const setTool = (next: ToolId): void => {
    if (next === 'crop') {
      setCropDraft(
        doc.crop ?? {
          x: 0,
          y: 0,
          width: image?.naturalWidth ?? 100,
          height: image?.naturalHeight ?? 100
        }
      );
      setSelectedId(null);
    } else {
      setCropDraft(null);
    }
    setToolState(next);
  };

  const selected = doc.objects.find((o) => o.id === selectedId) ?? null;

  /** Un changement de propriété s'applique au style ET à l'objet sélectionné. */
  const changeStyle = (patch: Partial<StyleState>): void => {
    const nextStyle = { ...style, ...patch };
    setStyle(nextStyle);
    if (!selected) return;
    const objPatch: Record<string, unknown> = {};
    if (patch.stroke !== undefined) {
      if (selected.type === 'text' || selected.type === 'step') objPatch.fill = patch.stroke;
      else if ('stroke' in selected) objPatch.stroke = patch.stroke;
    }
    if (patch.strokeWidth !== undefined && 'strokeWidth' in selected) {
      objPatch.strokeWidth = patch.strokeWidth;
    }
    if (patch.opacity !== undefined && selected.type !== 'blur') {
      objPatch.opacity = patch.opacity;
    }
    if (
      (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'triangle') &&
      (patch.fillOn !== undefined || patch.fill !== undefined)
    ) {
      objPatch.fill = nextStyle.fillOn ? nextStyle.fill : null;
    }
    if (patch.headSize !== undefined && selected.type === 'arrow') {
      objPatch.headSize = patch.headSize;
    }
    if (selected.type === 'text') {
      if (patch.fontSize !== undefined) objPatch.fontSize = patch.fontSize;
      if (patch.fontFamily !== undefined) objPatch.fontFamily = patch.fontFamily;
      if (patch.bold !== undefined) objPatch.bold = patch.bold;
      if (patch.italic !== undefined) objPatch.italic = patch.italic;
      if (patch.textStrokeOn !== undefined) {
        objPatch.stroke = patch.textStrokeOn ? '#0e0f11' : null;
      }
      if (patch.textBackgroundOn !== undefined) {
        objPatch.background = patch.textBackgroundOn ? '#0e0f11' : null;
      }
    }
    if (selected.type === 'blur') {
      if (patch.blurMode !== undefined) objPatch.mode = patch.blurMode;
      if (patch.blurStrength !== undefined) objPatch.strength = patch.blurStrength;
    }
    if (Object.keys(objPatch).length > 0) {
      history.commit({
        ...doc,
        objects: doc.objects.map((o) =>
          o.id === selected.id ? ({ ...o, ...objPatch } as AnnoObject) : o
        )
      });
    }
  };

  /** À la sélection d'un objet, le panneau reflète ses propriétés. */
  const styleFromObject = (obj: AnnoObject): void => {
    const patch: Partial<StyleState> = { opacity: obj.opacity };
    if ('stroke' in obj && typeof obj.stroke === 'string' && obj.type !== 'text') {
      patch.stroke = obj.stroke;
    }
    if ('strokeWidth' in obj) patch.strokeWidth = obj.strokeWidth;
    if (obj.type === 'text') {
      patch.stroke = obj.fill;
      patch.fontSize = obj.fontSize;
      patch.fontFamily = obj.fontFamily;
      patch.bold = obj.bold;
      patch.italic = obj.italic;
      patch.textStrokeOn = obj.stroke != null;
      patch.textBackgroundOn = obj.background != null;
    }
    if (obj.type === 'step') patch.stroke = obj.fill;
    if (obj.type === 'arrow') patch.headSize = obj.headSize;
    if (obj.type === 'blur') {
      patch.blurMode = obj.mode;
      patch.blurStrength = obj.strength;
    }
    if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'triangle') {
      patch.fillOn = obj.fill != null;
      if (obj.fill) patch.fill = obj.fill;
    }
    setStyle((s) => ({ ...s, ...patch }));
  };

  const dirty = JSON.stringify(doc) !== savedJson.current;

  const flatten = (format: ExportFormat = 'png', quality = 90): string | null =>
    stageHandle.current?.flatten(MIME[format], quality / 100) ?? null;

  const save = async (): Promise<void> => {
    const dataUrl = flatten();
    if (!dataUrl) return;
    const annotations =
      doc.objects.length > 0 || doc.crop ? JSON.stringify(doc) : null;
    await window.api.editor.save({ id: capture.id, annotations, dataUrl });
    savedJson.current = JSON.stringify(doc);
    host.notify(t('editor.saved'));
  };

  const exportAs = async (format: ExportFormat, quality: number): Promise<void> => {
    setExportOpen(false);
    const dataUrl = flatten(format, quality);
    if (dataUrl) {
      await window.api.editor.exportAs({ id: capture.id, dataUrl, ext: format });
    }
  };

  const copyFlat = (): void => {
    const dataUrl = flatten();
    if (dataUrl) void window.api.editor.copy(dataUrl);
  };

  const close = (): void => {
    if (dirty && !window.confirm(t('editor.confirmClose'))) return;
    onClose();
  };

  const applyCrop = (): void => {
    if (!cropDraft || !image) return;
    const full =
      Math.round(cropDraft.x) <= 0 &&
      Math.round(cropDraft.y) <= 0 &&
      Math.round(cropDraft.width) >= image.naturalWidth &&
      Math.round(cropDraft.height) >= image.naturalHeight;
    history.commit({
      ...doc,
      crop: full
        ? null
        : {
            x: Math.max(0, Math.round(cropDraft.x)),
            y: Math.max(0, Math.round(cropDraft.y)),
            width: Math.round(cropDraft.width),
            height: Math.round(cropDraft.height)
          }
    });
    setTool('select');
  };

  const deleteSelected = useCallback((): void => {
    if (!selectedId) return;
    setSelectedId(null);
    history.commit({ ...doc, objects: doc.objects.filter((o) => o.id !== selectedId) });
  }, [doc, history, selectedId]);

  // ── Raccourcis clavier de l'éditeur (docs/00 §3) ─────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          history.undo();
        } else if (key === 'y') {
          event.preventDefault();
          history.redo();
        } else if (key === 's') {
          event.preventDefault();
          if (event.shiftKey) void exportAs('png', 90);
          else void save();
        } else if (key === 'c' && selected) {
          event.preventDefault();
          clipboardObj.current = structuredClone(selected);
        } else if (key === 'v' && clipboardObj.current) {
          event.preventDefault();
          const src = structuredClone(clipboardObj.current);
          src.id = `p${Date.now().toString(36)}`;
          if ('x' in src) {
            (src as { x: number; y: number }).x += 16;
            (src as { x: number; y: number }).y += 16;
          } else if ('points' in src) {
            (src as { points: number[] }).points = (
              src as { points: number[] }
            ).points.map((v) => v + 16);
          }
          history.commit({ ...doc, objects: [...doc.objects, src] });
          setSelectedId(src.id);
        } else if (key === '0') {
          event.preventDefault();
          setZoom(Math.max(0.05, fitZoom()));
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelected();
        return;
      }
      if (event.key === 'Escape') {
        if (tool === 'crop') setTool('select');
        else setSelectedId(null);
        return;
      }
      if (event.key === '+' || event.key === '=') {
        setZoom((z) => Math.min(8, z * 1.2));
        return;
      }
      if (event.key === '-') {
        setZoom((z) => Math.max(0.05, z / 1.2));
        return;
      }
      const toolEntry = TOOLS.find(
        (entry) => entry.key.toLowerCase() === event.key.toLowerCase()
      );
      if (toolEntry) setTool(toolEntry.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, history, selected, selectedId, tool, fitZoom, deleteSelected]);

  // Ctrl + molette = zoom (docs/00 §2.2)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((z) =>
        Math.min(8, Math.max(0.05, event.deltaY < 0 ? z * 1.12 : z / 1.12))
      );
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="editor-root">
      <header className="editor-top">
        <button type="button" className="btn" onClick={close}>
          <Icon name="back" size={14} />
          {t('editor.back')}
        </button>
        <div className="editor-title" title={capture.filename}>
          {capture.filename}
          {dirty ? ' •' : ''}
        </div>
        <div className="editor-top-actions">
          <button
            type="button"
            className="btn btn-icon"
            disabled={!history.canUndo}
            title={t('editor.undo')}
            aria-label={t('editor.undo')}
            onClick={history.undo}
          >
            <Icon name="undo" size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            disabled={!history.canRedo}
            title={t('editor.redo')}
            aria-label={t('editor.redo')}
            onClick={history.redo}
          >
            <Icon name="redo" size={15} />
          </button>
          <span className="editor-zoom">
            <button
              type="button"
              className="btn btn-icon"
              aria-label="-"
              onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
            >
              <Icon name="zoomOut" size={14} />
            </button>
            <button
              type="button"
              className="btn zoom-value"
              title={t('editor.zoomFit')}
              onClick={() => setZoom(Math.max(0.05, fitZoom()))}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="+"
              onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
            >
              <Icon name="zoomIn" size={14} />
            </button>
          </span>
          <button type="button" className="btn" onClick={copyFlat}>
            <Icon name="copy" size={14} />
            {t('gallery.copy')}
          </button>
          <button type="button" className="btn" onClick={() => setExportOpen(true)}>
            <Icon name="export" size={14} />
            {t('editor.export.title')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            <Icon name="check" size={14} />
            {t('common.save')}
          </button>
        </div>
      </header>

      <div className="editor-main">
        <Toolbar tool={tool} onChange={setTool} />

        <div className="editor-canvas-wrap" ref={wrapRef}>
          {image ? (
            <CanvasStage
              ref={stageHandle}
              image={image}
              doc={doc}
              tool={tool}
              zoom={zoom}
              style={style}
              selectedId={selectedId}
              cropDraft={cropDraft}
              onSelect={setSelectedId}
              onCommit={history.commit}
              onCropDraft={setCropDraft}
              onToolDone={() => setToolState('select')}
              onStyleFromObject={styleFromObject}
            />
          ) : (
            <div className="muted editor-loading">{t('common.loading')}</div>
          )}

          {tool === 'crop' && (
            <div className="crop-bar card">
              <button type="button" className="btn btn-primary" onClick={applyCrop}>
                {t('editor.crop.apply')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  history.commit({ ...doc, crop: null });
                  setTool('select');
                }}
              >
                {t('editor.crop.reset')}
              </button>
              <button type="button" className="btn" onClick={() => setTool('select')}>
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>

        <PropertiesPanel
          tool={tool}
          selected={selected}
          style={style}
          onChange={changeStyle}
        />
      </div>

      {exportOpen && (
        <ExportDialog
          onExport={(format, quality) => void exportAs(format, quality)}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
