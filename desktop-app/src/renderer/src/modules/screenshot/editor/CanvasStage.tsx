import Konva from 'konva';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Image as KImage,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer
} from 'react-konva';
import { useI18n } from '../../../i18n';
import type {
  AnnoObject,
  BlurObject,
  CropRect,
  EditorDoc,
  StyleState,
  TextObject,
  ToolId
} from './model';
import { nextStepValue } from './model';

export interface StageHandle {
  /** Rend l'image aplatie (objets + crop) au format demandé. */
  flatten(mimeType: string, quality?: number): string | null;
}

interface Props {
  image: HTMLImageElement;
  doc: EditorDoc;
  tool: ToolId;
  zoom: number;
  style: StyleState;
  selectedId: string | null;
  cropDraft: CropRect | null;
  onSelect(id: string | null): void;
  onCommit(next: EditorDoc): void;
  onCropDraft(rect: CropRect): void;
  onToolDone(): void;
  onStyleFromObject(obj: AnnoObject): void;
}

let objectSeq = 0;
const newId = (): string => `o${Date.now().toString(36)}_${++objectSeq}`;

/** Coordonnées du pointeur dans le repère de l'image (px naturels). */
function pointerInImage(
  stage: Konva.Stage,
  zoom: number,
  origin: { x: number; y: number }
): { x: number; y: number } | null {
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  return { x: pos.x / zoom + origin.x, y: pos.y / zoom + origin.y };
}

export const CanvasStage = forwardRef<StageHandle, Props>(function CanvasStage(
  {
    image,
    doc,
    tool,
    zoom,
    style,
    selectedId,
    cropDraft,
    onSelect,
    onCommit,
    onCropDraft,
    onToolDone,
    onStyleFromObject
  },
  ref
): ReactNode {
  const { t } = useI18n();
  const stageRef = useRef<Konva.Stage>(null);
  const uiLayerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const cropTrRef = useRef<Konva.Transformer>(null);
  const cropRectRef = useRef<Konva.Rect>(null);
  const [draft, setDraft] = useState<AnnoObject | null>(null);
  const drawingRef = useRef(false);
  const [editingText, setEditingText] = useState<{
    id: string;
    value: string;
  } | null>(null);

  const cropMode = tool === 'crop';
  const crop = cropMode ? null : doc.crop; // en mode crop on montre l'image entière
  const origin = { x: crop?.x ?? 0, y: crop?.y ?? 0 };
  const docW = crop?.width ?? image.naturalWidth;
  const docH = crop?.height ?? image.naturalHeight;
  const viewW = Math.max(1, Math.round(docW * zoom));
  const viewH = Math.max(1, Math.round(docH * zoom));

  useImperativeHandle(ref, () => ({
    flatten(mimeType, quality) {
      const stage = stageRef.current;
      if (!stage) return null;
      const ui = uiLayerRef.current;
      ui?.visible(false);
      const exportCrop = doc.crop;
      const exportOrigin = cropMode
        ? { x: exportCrop?.x ?? 0, y: exportCrop?.y ?? 0 }
        : origin;
      const w = (exportCrop?.width ?? image.naturalWidth) * zoom;
      const h = (exportCrop?.height ?? image.naturalHeight) * zoom;
      const x = (exportOrigin.x - origin.x) * zoom;
      const y = (exportOrigin.y - origin.y) * zoom;
      const dataUrl = stage.toDataURL({
        x,
        y,
        width: w,
        height: h,
        pixelRatio: 1 / zoom,
        mimeType,
        quality
      });
      ui?.visible(true);
      return dataUrl;
    }
  }));

  // Transformer attaché au nœud sélectionné
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, doc, tool, zoom]);

  // Transformer du rectangle de recadrage
  useEffect(() => {
    if (!cropMode) return;
    const tr = cropTrRef.current;
    const rect = cropRectRef.current;
    if (tr && rect) {
      tr.nodes([rect]);
      tr.getLayer()?.batchDraw();
    }
  }, [cropMode, cropDraft]);

  const selectedObj = doc.objects.find((o) => o.id === selectedId) ?? null;

  const updateObject = (id: string, patch: Partial<AnnoObject>): void => {
    onCommit({
      ...doc,
      objects: doc.objects.map((o) =>
        o.id === id ? ({ ...o, ...patch } as AnnoObject) : o
      )
    });
  };

  const removeObject = (id: string): void => {
    onSelect(null);
    onCommit({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
  };

  // ── Dessin ────────────────────────────────────────────────────────────
  const startDraw = (): void => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = pointerInImage(stage, zoom, origin);
    if (!p) return;

    if (cropMode) return; // géré par le rect de crop

    if (tool === 'select') {
      return; // sélection gérée par les nœuds / clic vide
    }
    if (tool === 'text') {
      const obj: TextObject = {
        id: newId(),
        type: 'text',
        x: p.x,
        y: p.y,
        text: t('editor.textPlaceholder'),
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        bold: style.bold,
        italic: style.italic,
        fill: style.stroke,
        stroke: style.textStrokeOn ? '#0e0f11' : null,
        background: style.textBackgroundOn ? '#0e0f11' : null,
        opacity: style.opacity
      };
      onCommit({ ...doc, objects: [...doc.objects, obj] });
      onSelect(obj.id);
      setEditingText({ id: obj.id, value: obj.text });
      onToolDone();
      return;
    }
    if (tool === 'steps') {
      const obj: AnnoObject = {
        id: newId(),
        type: 'step',
        x: p.x,
        y: p.y,
        radius: Math.max(14, style.fontSize * 0.75),
        value: nextStepValue(doc),
        fill: style.stroke,
        textColor: '#0e0f11',
        opacity: style.opacity
      };
      onCommit({ ...doc, objects: [...doc.objects, obj] });
      return;
    }
    if (tool === 'eraser') return;

    drawingRef.current = true;
    const common = { id: newId(), opacity: style.opacity };
    if (tool === 'rect' || tool === 'triangle') {
      setDraft({
        ...common,
        type: tool,
        x: p.x,
        y: p.y,
        width: 1,
        height: 1,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        fill: style.fillOn ? style.fill : null
      } as AnnoObject);
    } else if (tool === 'ellipse') {
      setDraft({
        ...common,
        type: 'ellipse',
        x: p.x,
        y: p.y,
        radiusX: 1,
        radiusY: 1,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        fill: style.fillOn ? style.fill : null
      } as AnnoObject);
    } else if (tool === 'line') {
      setDraft({
        ...common,
        type: 'line',
        points: [p.x, p.y, p.x, p.y],
        stroke: style.stroke,
        strokeWidth: style.strokeWidth
      } as AnnoObject);
    } else if (tool === 'arrow') {
      setDraft({
        ...common,
        type: 'arrow',
        points: [p.x, p.y, p.x, p.y],
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        headSize: style.headSize
      } as AnnoObject);
    } else if (tool === 'pen' || tool === 'highlighter') {
      setDraft({
        ...common,
        type: tool,
        points: [p.x, p.y],
        stroke: style.stroke,
        strokeWidth:
          tool === 'highlighter' ? Math.max(10, style.strokeWidth * 4) : style.strokeWidth,
        opacity: tool === 'highlighter' ? 0.45 : style.opacity
      } as AnnoObject);
    } else if (tool === 'blur') {
      setDraft({
        ...common,
        type: 'blur',
        x: p.x,
        y: p.y,
        width: 1,
        height: 1,
        mode: style.blurMode,
        strength: style.blurStrength,
        opacity: 1
      } as AnnoObject);
    }
  };

  const moveDraw = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!drawingRef.current || !draft) return;
    const stage = stageRef.current;
    if (!stage) return;
    const p = pointerInImage(stage, zoom, origin);
    if (!p) return;
    const shift = event.evt.shiftKey;

    setDraft((d) => {
      if (!d) return d;
      if (d.type === 'rect' || d.type === 'triangle' || d.type === 'blur') {
        let w = p.x - d.x;
        let h = p.y - d.y;
        if (shift) {
          const s = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * s;
          h = Math.sign(h || 1) * s;
        }
        return { ...d, width: w, height: h } as AnnoObject;
      }
      if (d.type === 'ellipse') {
        let rx = Math.abs(p.x - d.x);
        let ry = Math.abs(p.y - d.y);
        if (shift) rx = ry = Math.max(rx, ry);
        return { ...d, radiusX: rx, radiusY: ry } as AnnoObject;
      }
      if (d.type === 'line' || d.type === 'arrow') {
        let x2 = p.x;
        let y2 = p.y;
        if (shift) {
          // angles contraints à 45° (docs/00 §2.1)
          const dx = x2 - d.points[0];
          const dy = y2 - d.points[1];
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          x2 = d.points[0] + Math.cos(angle) * len;
          y2 = d.points[1] + Math.sin(angle) * len;
        }
        return { ...d, points: [d.points[0], d.points[1], x2, y2] } as AnnoObject;
      }
      if (d.type === 'pen' || d.type === 'highlighter') {
        return { ...d, points: [...d.points, p.x, p.y] } as AnnoObject;
      }
      return d;
    });
  };

  const endDraw = (): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const d = draft;
    setDraft(null);
    if (!d) return;

    // normalise + valide la taille minimale
    let obj: AnnoObject | null = d;
    if (d.type === 'rect' || d.type === 'triangle' || d.type === 'blur') {
      const x = Math.min(d.x, d.x + d.width);
      const y = Math.min(d.y, d.y + d.height);
      const width = Math.abs(d.width);
      const height = Math.abs(d.height);
      obj = width < 3 || height < 3 ? null : ({ ...d, x, y, width, height } as AnnoObject);
    } else if (d.type === 'ellipse') {
      obj = d.radiusX < 2 || d.radiusY < 2 ? null : d;
    } else if (d.type === 'line' || d.type === 'arrow') {
      const [x1, y1, x2, y2] = d.points;
      obj = Math.hypot(x2 - x1, y2 - y1) < 3 ? null : d;
    } else if (d.type === 'pen' || d.type === 'highlighter') {
      obj = d.points.length < 4 ? null : d;
    }
    if (obj) {
      onCommit({ ...doc, objects: [...doc.objects, obj] });
      onSelect(obj.id);
    }
  };

  const onStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = stageRef.current;
    // clic dans le vide → désélection (outil sélection)
    if (tool === 'select' && event.target === stage) {
      onSelect(null);
      return;
    }
    if (event.target === stage || event.target.name() === 'base-image') {
      startDraw();
    } else if (tool !== 'select' && tool !== 'eraser' && !cropMode) {
      // dessiner par-dessus un objet existant
      startDraw();
    }
  };

  const objectHandlers = (obj: AnnoObject): Record<string, unknown> => ({
    id: obj.id,
    opacity: obj.opacity,
    rotation: obj.rotation ?? 0,
    draggable: tool === 'select',
    listening: tool === 'select' || tool === 'eraser',
    onMouseDown: () => {
      if (tool === 'eraser') {
        removeObject(obj.id);
      } else if (tool === 'select') {
        onSelect(obj.id);
        onStyleFromObject(obj);
      }
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'pen' || obj.type === 'highlighter') {
        // reporte le déplacement dans les points, position remise à zéro
        const dx = node.x();
        const dy = node.y();
        node.position({ x: 0, y: 0 });
        const pts = (obj as { points: number[] }).points.map((v, i) =>
          i % 2 === 0 ? v + dx : v + dy
        );
        updateObject(obj.id, { points: pts } as Partial<AnnoObject>);
      } else {
        updateObject(obj.id, { x: node.x(), y: node.y() } as Partial<AnnoObject>);
      }
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      const rotation = node.rotation();
      if (obj.type === 'rect' || obj.type === 'triangle' || obj.type === 'blur') {
        updateObject(obj.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(3, (obj as { width: number }).width * sx),
          height: Math.max(3, (obj as { height: number }).height * sy),
          rotation: obj.type === 'blur' ? 0 : rotation
        } as Partial<AnnoObject>);
      } else if (obj.type === 'ellipse') {
        updateObject(obj.id, {
          x: node.x(),
          y: node.y(),
          radiusX: Math.max(2, obj.radiusX * sx),
          radiusY: Math.max(2, obj.radiusY * sy),
          rotation
        } as Partial<AnnoObject>);
      } else if (obj.type === 'text') {
        updateObject(obj.id, {
          x: node.x(),
          y: node.y(),
          fontSize: Math.max(6, obj.fontSize * sy),
          rotation
        } as Partial<AnnoObject>);
      } else if (obj.type === 'step') {
        updateObject(obj.id, {
          x: node.x(),
          y: node.y(),
          radius: Math.max(8, obj.radius * sx),
          rotation: 0
        } as Partial<AnnoObject>);
      } else {
        // lignes / flèches / tracés : reporte l'échelle dans les points
        const dx = node.x();
        const dy = node.y();
        node.position({ x: 0, y: 0 });
        node.rotation(0);
        const src = (obj as { points: number[] }).points;
        const pts = src.map((v, i) => (i % 2 === 0 ? v * sx + dx : v * sy + dy));
        updateObject(obj.id, { points: pts, rotation: 0 } as Partial<AnnoObject>);
      }
    }
  });

  const renderObject = (obj: AnnoObject, isDraft = false): ReactNode => {
    const h = isDraft ? { listening: false, opacity: obj.opacity } : objectHandlers(obj);
    switch (obj.type) {
      case 'rect':
        return (
          <Rect
            key={obj.id}
            {...h}
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill ?? undefined}
            cornerRadius={2}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            key={obj.id}
            {...h}
            x={obj.x}
            y={obj.y}
            radiusX={Math.abs(obj.radiusX)}
            radiusY={Math.abs(obj.radiusY)}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill ?? undefined}
          />
        );
      case 'triangle': {
        const pts = [
          obj.width / 2,
          0,
          obj.width,
          obj.height,
          0,
          obj.height
        ];
        return (
          <Line
            key={obj.id}
            {...h}
            x={obj.x}
            y={obj.y}
            points={pts}
            closed
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill ?? undefined}
          />
        );
      }
      case 'line':
        return (
          <Line
            key={obj.id}
            {...h}
            points={obj.points}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            lineCap="round"
            hitStrokeWidth={Math.max(12, obj.strokeWidth)}
          />
        );
      case 'arrow':
        return (
          <Arrow
            key={obj.id}
            {...h}
            points={obj.points}
            stroke={obj.stroke}
            fill={obj.stroke}
            strokeWidth={obj.strokeWidth}
            pointerLength={obj.headSize}
            pointerWidth={obj.headSize}
            lineCap="round"
            hitStrokeWidth={Math.max(12, obj.strokeWidth)}
          />
        );
      case 'pen':
      case 'highlighter':
        return (
          <Line
            key={obj.id}
            {...h}
            points={obj.points}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.4}
            hitStrokeWidth={Math.max(14, obj.strokeWidth)}
            globalCompositeOperation={
              obj.type === 'highlighter' ? 'multiply' : 'source-over'
            }
          />
        );
      case 'blur':
        return (
          <BlurShape key={obj.id} obj={obj} image={image} handlers={h} />
        );
      case 'text': {
        const fontStyle =
          `${obj.bold ? 'bold' : ''} ${obj.italic ? 'italic' : ''}`.trim() || 'normal';
        const textNode = (
          <Text
            text={obj.text}
            fontSize={obj.fontSize}
            fontFamily={obj.fontFamily}
            fontStyle={fontStyle}
            fill={obj.fill}
            stroke={obj.stroke ?? undefined}
            strokeWidth={obj.stroke ? Math.max(1, obj.fontSize / 20) : 0}
            fillAfterStrokeEnabled
            padding={obj.background ? 6 : 0}
          />
        );
        return (
          <Label
            key={obj.id}
            {...h}
            x={obj.x}
            y={obj.y}
            visible={editingText?.id !== obj.id}
            onDblClick={() => {
              if (tool === 'select') setEditingText({ id: obj.id, value: obj.text });
            }}
          >
            {obj.background ? <Tag fill={obj.background} cornerRadius={4} /> : null}
            {textNode}
          </Label>
        );
      }
      case 'step':
        return (
          <Group key={obj.id} {...h} x={obj.x} y={obj.y}>
            <Circle radius={obj.radius} fill={obj.fill} />
            <Text
              text={String(obj.value)}
              fontSize={obj.radius * 1.1}
              fontFamily="DM Mono"
              fontStyle="bold"
              fill={obj.textColor}
              width={obj.radius * 2}
              height={obj.radius * 2}
              offsetX={obj.radius}
              offsetY={obj.radius}
              align="center"
              verticalAlign="middle"
            />
          </Group>
        );
      default:
        return null;
    }
  };

  // ── Édition de texte (textarea HTML par-dessus le canvas) ────────────
  const textareaStyle = ((): React.CSSProperties | null => {
    if (!editingText) return null;
    const stage = stageRef.current;
    const node = stage?.findOne(`#${editingText.id}`);
    const obj = doc.objects.find((o) => o.id === editingText.id) as
      | TextObject
      | undefined;
    if (!stage || !node || !obj) return null;
    const abs = node.getAbsolutePosition();
    const box = stage.container().getBoundingClientRect();
    return {
      position: 'fixed',
      left: box.left + abs.x,
      top: box.top + abs.y,
      fontSize: obj.fontSize * zoom,
      fontFamily: obj.fontFamily,
      fontWeight: obj.bold ? 'bold' : 'normal',
      fontStyle: obj.italic ? 'italic' : 'normal',
      color: obj.fill,
      transform: `rotate(${obj.rotation ?? 0}deg)`,
      transformOrigin: 'left top'
    };
  })();

  const commitText = (): void => {
    if (!editingText) return;
    const value = editingText.value.trim();
    const obj = doc.objects.find((o) => o.id === editingText.id);
    setEditingText(null);
    if (!obj) return;
    if (!value) {
      removeObject(obj.id);
    } else if ((obj as TextObject).text !== value) {
      updateObject(obj.id, { text: value } as Partial<AnnoObject>);
    }
  };

  // ── Recadrage ─────────────────────────────────────────────────────────
  const effectiveCropDraft = cropDraft ?? {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight
  };

  return (
    <div className="editor-stage-inner" style={{ width: viewW, height: viewH }}>
      <Stage
        ref={stageRef}
        width={viewW}
        height={viewH}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={onStageMouseDown}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
      >
        <Layer>
          <Group x={-origin.x} y={-origin.y}>
            <KImage
              name="base-image"
              image={image}
              width={image.naturalWidth}
              height={image.naturalHeight}
            />
            {doc.objects.map((obj) => renderObject(obj))}
            {draft && renderObject(draft, true)}
          </Group>
        </Layer>
        <Layer ref={uiLayerRef}>
          <Group x={-origin.x} y={-origin.y}>
            {tool === 'select' && (
              <Transformer
                ref={trRef}
                rotateEnabled={selectedObj?.type !== 'blur' && selectedObj?.type !== 'step'}
                keepRatio={false}
                anchorStroke="#e8c547"
                anchorFill="#16181c"
                anchorSize={8}
                borderStroke="#e8c547"
                borderDash={[4, 3]}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4
                    ? oldBox
                    : newBox
                }
              />
            )}
            {cropMode && (
              <>
                <CropVeil
                  imageW={image.naturalWidth}
                  imageH={image.naturalHeight}
                  rect={effectiveCropDraft}
                />
                <Rect
                  ref={cropRectRef}
                  x={effectiveCropDraft.x}
                  y={effectiveCropDraft.y}
                  width={effectiveCropDraft.width}
                  height={effectiveCropDraft.height}
                  stroke="#e8c547"
                  strokeWidth={1.5 / zoom}
                  draggable
                  onDragEnd={(e) =>
                    onCropDraft({
                      ...effectiveCropDraft,
                      x: e.target.x(),
                      y: e.target.y()
                    })
                  }
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const sx = node.scaleX();
                    const sy = node.scaleY();
                    node.scale({ x: 1, y: 1 });
                    onCropDraft({
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(8, effectiveCropDraft.width * sx),
                      height: Math.max(8, effectiveCropDraft.height * sy)
                    });
                  }}
                />
                <Transformer
                  ref={cropTrRef}
                  rotateEnabled={false}
                  keepRatio={false}
                  anchorStroke="#e8c547"
                  anchorFill="#16181c"
                  anchorSize={9}
                  borderEnabled={false}
                />
              </>
            )}
          </Group>
        </Layer>
      </Stage>

      {editingText && textareaStyle && (
        <textarea
          className="editor-text-input"
          style={textareaStyle}
          value={editingText.value}
          autoFocus
          spellCheck={false}
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            setEditingText((s) => (s ? { ...s, value: e.target.value } : s))
          }
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditingText(null);
            }
          }}
        />
      )}
    </div>
  );
});

/** Zone floutée / pixellisée : image recadrée + filtre Konva, mise en cache. */
function BlurShape({
  obj,
  image,
  handlers
}: {
  obj: BlurObject;
  image: HTMLImageElement;
  handlers: Record<string, unknown>;
}): ReactNode {
  const nodeRef = useRef<Konva.Image>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.cache();
    node.getLayer()?.batchDraw();
    return () => {
      node.clearCache();
    };
  }, [obj.x, obj.y, obj.width, obj.height, obj.mode, obj.strength, image]);

  const w = Math.max(1, Math.abs(obj.width));
  const h = Math.max(1, Math.abs(obj.height));
  const cropX = Math.max(0, Math.min(obj.x, image.naturalWidth - 1));
  const cropY = Math.max(0, Math.min(obj.y, image.naturalHeight - 1));

  return (
    <KImage
      ref={nodeRef}
      {...handlers}
      image={image}
      x={obj.x}
      y={obj.y}
      width={w}
      height={h}
      crop={{
        x: cropX,
        y: cropY,
        width: Math.min(w, image.naturalWidth - cropX),
        height: Math.min(h, image.naturalHeight - cropY)
      }}
      filters={
        obj.mode === 'blur' ? [Konva.Filters.Blur] : [Konva.Filters.Pixelate]
      }
      blurRadius={obj.mode === 'blur' ? obj.strength * 2 : 0}
      pixelSize={obj.mode === 'pixelate' ? Math.max(2, obj.strength) : 1}
      stroke="#e8c547"
      strokeWidth={1}
      dash={[4, 3]}
    />
  );
}

/** Assombrit tout sauf le rectangle de recadrage. */
function CropVeil({
  imageW,
  imageH,
  rect
}: {
  imageW: number;
  imageH: number;
  rect: CropRect;
}): ReactNode {
  const fill = 'rgba(8, 9, 10, 0.55)';
  return (
    <>
      <Rect listening={false} x={0} y={0} width={imageW} height={rect.y} fill={fill} />
      <Rect
        listening={false}
        x={0}
        y={rect.y + rect.height}
        width={imageW}
        height={Math.max(0, imageH - rect.y - rect.height)}
        fill={fill}
      />
      <Rect listening={false} x={0} y={rect.y} width={rect.x} height={rect.height} fill={fill} />
      <Rect
        listening={false}
        x={rect.x + rect.width}
        y={rect.y}
        width={Math.max(0, imageW - rect.x - rect.width)}
        height={rect.height}
        fill={fill}
      />
    </>
  );
}
