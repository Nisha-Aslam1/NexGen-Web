import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Stage,
  Layer,
  Line,
  Rect,
  Ellipse,
  Arrow,
  Text,
  Group,
  Image as KonvaImage,
  Transformer
} from 'react-konva';
import type Konva from 'konva';
import {
  MousePointer2,
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle,
  ArrowUpRight,
  Minus,
  Type,
  StickyNote,
  ImagePlus,
  Undo2,
  Redo2,
  Trash2,
  Download,
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  Maximize,
  Minimize2,
  Users,
  Shield,
  SlidersHorizontal,
  X,
  Check,
  MonitorPlay,
  Layers,
  Link as LinkIcon
} from 'lucide-react';

export interface WhiteboardElement {
  id: string;
  type: 'stroke' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'sticky' | 'image';
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  points?: number[];
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  text?: string;
  fontSize?: number;
  tool?: 'pen' | 'highlighter' | 'eraser';
  src?: string;
  locked?: boolean;
  zLayer?: 'image' | 'draw';
}

export interface WhiteboardSnapshot {
  elements: WhiteboardElement[];
  background: 'light' | 'grid' | 'dark';
  lockDrawingToHost: boolean;
  presentedByHost: boolean;
  updatedAt: number;
}

export type WhiteboardTool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'sticky';

interface RemoteLiveState {
  actorIdentity: string;
  authorName: string;
  cursor?: { x: number; y: number } | null;
  stroke?: WhiteboardElement | null;
  lastSeenAt: number;
}

type HistoryEntry =
  | { kind: 'add'; element: WhiteboardElement }
  | { kind: 'update'; before: WhiteboardElement; after: WhiteboardElement; order?: 'front' | 'back' }
  | { kind: 'delete'; elements: WhiteboardElement[] }
  | { kind: 'clear'; target: 'drawings' | 'all'; cleared: WhiteboardElement[] };

export interface MeetingWhiteboardProps {
  meetingId: string;
  meetingCode?: string;
  identity: string;
  displayName: string;
  isHost: boolean;
  buildHeaders: (withJson?: boolean) => Record<string, string>;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  initialSnapshot?: WhiteboardSnapshot | null;
  externalEvent?: { seq: number; payload: any } | null;
  splitVideoMode: 'split' | 'full';
  onToggleSplitVideoMode: () => void;
  onClose: () => void;
}

const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 900;

const COLOR_PALETTE = [
  { label: 'Ink Slate', value: '#0F172A' },
  { label: 'Pure White', value: '#FFFFFF' },
  { label: 'Royal Blue', value: '#2563EB' },
  { label: 'Crimson', value: '#DC2626' },
  { label: 'Emerald', value: '#16A34A' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Violet', value: '#7C3AED' }
];

const STROKE_WIDTHS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'Bold', value: 10 },
  { label: 'Marker', value: 18 }
];

const CURSOR_COLORS = ['#2563EB', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#0891B2'];

function pickAuthorColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function makeElementId(identity: string): string {
  const prefix = (identity || 'usr').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'usr';
  return `wb_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Compress / normalize image files client-side before syncing in real-time
async function prepareImageDataUrl(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new window.Image();
      img.onerror = () => reject(new Error('Invalid or unsupported image file.'));
      img.onload = () => {
        const naturalW = img.naturalWidth || 800;
        const naturalH = img.naturalHeight || 600;
        const maxDim = 1280;
        let outW = naturalW;
        let outH = naturalH;
        if (naturalW > maxDim || naturalH > maxDim) {
          const ratio = Math.min(maxDim / naturalW, maxDim / naturalH);
          outW = Math.max(24, Math.round(naturalW * ratio));
          outH = Math.max(24, Math.round(naturalH * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ src: rawUrl, width: outW, height: outH });
          return;
        }
        ctx.drawImage(img, 0, 0, outW, outH);
        const isPng = file.type === 'image/png' || file.type === 'image/webp';
        let compressed = isPng
          ? canvas.toDataURL('image/webp', 0.88)
          : canvas.toDataURL('image/jpeg', 0.86);

        if (compressed.length > 2_400_000) {
          compressed = canvas.toDataURL('image/jpeg', 0.72);
        }
        resolve({ src: compressed, width: outW, height: outH });
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

// Individual Konva Image Node with async loading + clean error fallback
const CanvasImageNode: React.FC<{
  element: WhiteboardElement;
  listening: boolean;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onRegisterNode: (id: string, node: Konva.Image | null) => void;
  onTransformChange: (id: string, patch: Partial<WhiteboardElement>) => void;
}> = ({ element, listening, draggable, onSelect, onRegisterNode, onTransformChange }) => {
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!element.src) return;
    let cancelled = false;
    setLoadFailed(false);

    const img = new window.Image();
    if (!element.src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (!cancelled) {
        setLoadedImg(img);
        setLoadFailed(false);
      }
    };
    img.onerror = () => {
      // Retry without crossOrigin if external host blocks CORS headers
      if (!element.src?.startsWith('data:') && img.crossOrigin) {
        const retryImg = new window.Image();
        retryImg.onload = () => {
          if (!cancelled) {
            setLoadedImg(retryImg);
            setLoadFailed(false);
          }
        };
        retryImg.onerror = () => {
          if (!cancelled) setLoadFailed(true);
        };
        retryImg.src = element.src || '';
      } else if (!cancelled) {
        setLoadFailed(true);
      }
    };
    img.src = element.src;

    return () => {
      cancelled = true;
    };
  }, [element.src]);

  const x = element.x ?? 120;
  const y = element.y ?? 80;
  const width = element.width ?? 480;
  const height = element.height ?? 320;
  const rotation = element.rotation ?? 0;
  const opacity = element.opacity ?? 1;

  if (!loadedImg) {
    return (
      <Group x={x} y={y} rotation={rotation} listening={listening} onClick={onSelect} onTap={onSelect}>
        <Rect
          width={width}
          height={height}
          fill={loadFailed ? '#FEF2F2' : '#F1F5F9'}
          stroke={loadFailed ? '#EF4444' : '#94A3B8'}
          strokeWidth={2}
          dash={[8, 6]}
          cornerRadius={8}
        />
        <Text
          x={16}
          y={Math.max(12, height / 2 - 12)}
          width={Math.max(60, width - 32)}
          align="center"
          text={loadFailed ? 'Image could not be loaded' : 'Loading shared image...'}
          fontSize={16}
          fill={loadFailed ? '#DC2626' : '#475569'}
        />
      </Group>
    );
  }

  return (
    <KonvaImage
      ref={(node) => onRegisterNode(element.id, node)}
      image={loadedImg}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      opacity={opacity}
      listening={listening}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        onTransformChange(element.id, {
          x: Math.round(e.target.x() * 100) / 100,
          y: Math.round(e.target.y() * 100) / 100
        });
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformChange(element.id, {
          x: Math.round(node.x() * 100) / 100,
          y: Math.round(node.y() * 100) / 100,
          width: Math.max(32, Math.round(node.width() * scaleX * 100) / 100),
          height: Math.max(32, Math.round(node.height() * scaleY * 100) / 100),
          rotation: Math.round(node.rotation() * 10) / 10
        });
      }}
    />
  );
};

export const MeetingWhiteboard: React.FC<MeetingWhiteboardProps> = ({
  meetingId,
  meetingCode,
  identity,
  displayName,
  isHost,
  buildHeaders,
  onToast,
  initialSnapshot,
  externalEvent,
  splitVideoMode,
  onToggleSplitVideoMode,
  onClose
}) => {
  const [elements, setElements] = useState<WhiteboardElement[]>(initialSnapshot?.elements || []);
  const [background, setBackground] = useState<'light' | 'grid' | 'dark'>(
    initialSnapshot?.background || 'light'
  );
  const [lockDrawingToHost, setLockDrawingToHost] = useState<boolean>(
    Boolean(initialSnapshot?.lockDrawingToHost)
  );
  const [presentedByHost, setPresentedByHost] = useState<boolean>(
    Boolean(initialSnapshot?.presentedByHost)
  );

  // Active Tool State
  const [tool, setTool] = useState<WhiteboardTool>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#0F172A');
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Menus & Inline Modals
  const [showClearMenu, setShowClearMenu] = useState<boolean>(false);
  const [showImageUrlPopover, setShowImageUrlPopover] = useState<boolean>(false);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Floating Text / Sticky Note Input State
  const [textDraftState, setTextDraftState] = useState<{
    mode: 'text' | 'sticky';
    x: number;
    y: number;
    editingId?: string;
    value: string;
  } | null>(null);

  // Live Active Drawing Element (Local & Remote)
  const [draftElement, setDraftElement] = useState<WhiteboardElement | null>(null);
  const [remoteLiveMap, setRemoteLiveMap] = useState<Record<string, RemoteLiveState>>({});

  // Undo & Redo Action History
  const [undoHistory, setUndoHistory] = useState<HistoryEntry[]>([]);
  const [redoHistory, setRedoHistory] = useState<HistoryEntry[]>([]);

  // Stage Sizing & Refs
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeMapRef = useRef<Map<string, Konva.Node>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 960,
    height: 540
  });

  const isDrawingRef = useRef<boolean>(false);
  const draftElementRef = useRef<WhiteboardElement | null>(null);
  const elementsRef = useRef<WhiteboardElement[]>(initialSnapshot?.elements || []);
  const undoHistoryRef = useRef<HistoryEntry[]>([]);
  const redoHistoryRef = useRef<HistoryEntry[]>([]);
  const erasedInDragRef = useRef<Set<string>>(new Set());
  const erasedElementsInDragRef = useRef<WhiteboardElement[]>([]);
  const lastLiveEmitAtRef = useRef<number>(0);
  const lastProcessedSeqRef = useRef<number>(0);

  const canEdit = isHost || !lockDrawingToHost;

  useEffect(() => {
    draftElementRef.current = draftElement;
  }, [draftElement]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  // Adjust default ink color if board background toggles to dark while using default dark ink
  const handleSelectBackground = async (nextBg: 'light' | 'grid' | 'dark') => {
    if (!canEdit) return;
    setBackground(nextBg);
    if (nextBg === 'dark' && strokeColor === '#0F172A') {
      setStrokeColor('#FFFFFF');
    } else if (nextBg !== 'dark' && strokeColor === '#FFFFFF') {
      setStrokeColor('#0F172A');
    }
    try {
      await fetch(`/api/meetings/${meetingId}/whiteboard/op`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          action: 'settings',
          background: nextBg,
          actorIdentity: identity,
          authorName: displayName
        })
      });
    } catch {}
  };

  const buildHeadersRef = useRef(buildHeaders);
  useEffect(() => {
    buildHeadersRef.current = buildHeaders;
  }, [buildHeaders]);

  // Fetch fresh whiteboard snapshot on mount
  const fetchSnapshot = useCallback(async () => {
    if (!meetingId) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/whiteboard`, {
        headers: buildHeadersRef.current(false)
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.whiteboard) {
        const nextElements = Array.isArray(data.whiteboard.elements) ? data.whiteboard.elements : [];
        elementsRef.current = nextElements;
        setElements(nextElements);
        if (data.whiteboard.background) setBackground(data.whiteboard.background);
        setLockDrawingToHost(Boolean(data.whiteboard.lockDrawingToHost));
        setPresentedByHost(Boolean(data.whiteboard.presentedByHost));
      }
    } catch {}
  }, [meetingId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Prune stale remote cursors/strokes (>4.5s)
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 4500;
      setRemoteLiveMap(prev => {
        let changed = false;
        const next: Record<string, RemoteLiveState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.lastSeenAt >= cutoff) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Process incoming SSE whiteboard events from LiveMeetingRoom
  useEffect(() => {
    if (!externalEvent || externalEvent.seq <= lastProcessedSeqRef.current) return;
    lastProcessedSeqRef.current = externalEvent.seq;
    const payload = externalEvent.payload;
    if (!payload) return;

    if (payload.type === 'whiteboard_snapshot_sync' && payload.whiteboard) {
      const nextElements = Array.isArray(payload.whiteboard.elements) ? payload.whiteboard.elements : [];
      elementsRef.current = nextElements;
      setElements(nextElements);
      if (payload.whiteboard.background) setBackground(payload.whiteboard.background);
      setLockDrawingToHost(Boolean(payload.whiteboard.lockDrawingToHost));
      setPresentedByHost(Boolean(payload.whiteboard.presentedByHost));
      return;
    }

    if (payload.type === 'whiteboard_present') {
      setPresentedByHost(Boolean(payload.presented));
      return;
    }

    if (payload.type === 'whiteboard_live') {
      if (payload.actorIdentity === identity) return;
      setRemoteLiveMap(prev => ({
        ...prev,
        [payload.actorIdentity]: {
          actorIdentity: payload.actorIdentity,
          authorName: payload.authorName || 'Participant',
          cursor: payload.cursor || prev[payload.actorIdentity]?.cursor || null,
          stroke: payload.stroke !== undefined ? payload.stroke : null,
          lastSeenAt: Date.now()
        }
      }));
      return;
    }

    if (payload.type === 'whiteboard_op') {
      if (payload.action === 'add' && payload.element) {
        setElements(prev => {
          if (prev.some(el => el.id === payload.element.id)) return prev;
          const next = [...prev, payload.element];
          elementsRef.current = next;
          return next;
        });
        if (payload.actorIdentity && payload.actorIdentity !== identity) {
          setRemoteLiveMap(prev => {
            if (!prev[payload.actorIdentity]) return prev;
            return {
              ...prev,
              [payload.actorIdentity]: { ...prev[payload.actorIdentity], stroke: null }
            };
          });
        }
      } else if (payload.action === 'update' && payload.element) {
        setElements(prev => {
          const idx = prev.findIndex(el => el.id === payload.element.id);
          if (idx === -1) {
            const next = [...prev, payload.element];
            elementsRef.current = next;
            return next;
          }
          const next = [...prev];
          next[idx] = payload.element;
          if (payload.order === 'front') {
            next.splice(idx, 1);
            next.push(payload.element);
          } else if (payload.order === 'back') {
            next.splice(idx, 1);
            next.unshift(payload.element);
          }
          elementsRef.current = next;
          return next;
        });
      } else if (payload.action === 'delete' && Array.isArray(payload.elementIds)) {
        const del = new Set(payload.elementIds);
        setElements(prev => {
          const next = prev.filter(el => !del.has(el.id));
          elementsRef.current = next;
          return next;
        });
        setSelectedId(curr => (curr && del.has(curr) ? null : curr));
      } else if (payload.action === 'restore' && Array.isArray(payload.elements)) {
        setElements(prev => {
          const existing = new Set(prev.map(el => el.id));
          const merged = [...prev];
          for (const el of payload.elements) {
            if (el && el.id && !existing.has(el.id)) {
              merged.push(el);
              existing.add(el.id);
            }
          }
          elementsRef.current = merged;
          return merged;
        });
      } else if (payload.action === 'clear') {
        if (payload.target === 'drawings') {
          setElements(prev => {
            const next = prev.filter(el => el.type === 'image');
            elementsRef.current = next;
            return next;
          });
        } else {
          elementsRef.current = [];
          setElements([]);
          setSelectedId(null);
        }
      } else if (payload.action === 'settings') {
        if (payload.background) setBackground(payload.background);
        if (typeof payload.lockDrawingToHost === 'boolean') {
          setLockDrawingToHost(payload.lockDrawingToHost);
        }
      }
    }
  }, [externalEvent, identity]);

  // Measure viewport cleanly with ResizeObserver
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();

    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    const padX = 24;
    const padY = 24;
    const scale = Math.min(
      Math.max(120, viewportSize.width - padX) / BOARD_WIDTH,
      Math.max(120, viewportSize.height - padY) / BOARD_HEIGHT
    );
    return Math.max(0.15, scale);
  }, [viewportSize]);

  const effectiveScale = fitScale * zoom;
  const stagePixelWidth = Math.round(BOARD_WIDTH * effectiveScale);
  const stagePixelHeight = Math.round(BOARD_HEIGHT * effectiveScale);

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      nodeMapRef.current.set(id, node);
    } else {
      nodeMapRef.current.delete(id);
    }
  }, []);

  const selectedElement = useMemo(
    () => elements.find(el => el.id === selectedId) || null,
    [elements, selectedId]
  );

  // Attach Konva.Transformer to currently selected node
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (
      tool === 'select' &&
      selectedId &&
      selectedElement &&
      !selectedElement.locked &&
      canEdit
    ) {
      const targetNode = nodeMapRef.current.get(selectedId);
      if (targetNode) {
        tr.nodes([targetNode]);
        tr.getLayer()?.batchDraw();
        return;
      }
    }
    tr.nodes([]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, selectedElement, tool, canEdit, elements]);

  // Clear selection when switching away from select tool
  useEffect(() => {
    if (tool !== 'select') {
      setSelectedId(null);
    }
  }, [tool]);

  // Server Mutation Helpers
  const sendOp = useCallback(
    async (body: Record<string, any>) => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/whiteboard/op`, {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({
            ...body,
            actorIdentity: identity,
            authorName: displayName
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error) onToast(data.error, 'error');
          return false;
        }
        return true;
      } catch {
        onToast('Whiteboard sync error. Reconnecting...', 'error');
        return false;
      }
    },
    [meetingId, buildHeaders, identity, displayName, onToast]
  );

  const emitLivePreview = useCallback(
    (cursor: { x: number; y: number } | null, stroke: WhiteboardElement | null, force = false) => {
      const now = Date.now();
      if (!force && now - lastLiveEmitAtRef.current < 150) return;
      lastLiveEmitAtRef.current = now;
      fetch(`/api/meetings/${meetingId}/whiteboard/live`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          actorIdentity: identity,
          authorName: displayName,
          cursor,
          stroke
        })
      }).catch(() => {});
    },
    [meetingId, buildHeaders, identity, displayName]
  );

  const pushUndoEntry = useCallback((entry: HistoryEntry) => {
    const nextUndo = [...undoHistoryRef.current.slice(-59), entry];
    undoHistoryRef.current = nextUndo;
    setUndoHistory(nextUndo);
    if (redoHistoryRef.current.length > 0) {
      redoHistoryRef.current = [];
      setRedoHistory([]);
    }
  }, []);

  const commitAddElement = useCallback(
    async (el: WhiteboardElement, recordHistory = true) => {
      setElements(prev => {
        if (prev.some(item => item.id === el.id)) return prev;
        const next = [...prev, el];
        elementsRef.current = next;
        return next;
      });
      if (recordHistory) {
        pushUndoEntry({ kind: 'add', element: el });
      }
      const ok = await sendOp({ action: 'add', element: el });
      if (!ok) {
        setElements(prev => {
          const next = prev.filter(item => item.id !== el.id);
          elementsRef.current = next;
          return next;
        });
      }
    },
    [sendOp, pushUndoEntry]
  );

  const commitUpdateElement = useCallback(
    async (
      elementId: string,
      patch: Partial<WhiteboardElement> & { order?: 'front' | 'back' },
      recordHistory = true
    ) => {
      const beforeEl = elementsRef.current.find(e => e.id === elementId);
      if (!beforeEl) return;

      const { order, ...elementPatch } = patch;
      const updatedEl: WhiteboardElement = {
        ...beforeEl,
        ...elementPatch,
        updatedAt: Date.now()
      };

      setElements(prev => {
        const idx = prev.findIndex(e => e.id === elementId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = updatedEl;
        if (order === 'front') {
          next.splice(idx, 1);
          next.push(updatedEl);
        } else if (order === 'back') {
          next.splice(idx, 1);
          next.unshift(updatedEl);
        }
        elementsRef.current = next;
        return next;
      });

      if (recordHistory) {
        const currentStack = undoHistoryRef.current;
        const topEntry = currentStack[currentStack.length - 1];
        const isOpacityTweak =
          topEntry?.kind === 'update' &&
          topEntry.before.id === elementId &&
          Object.keys(elementPatch).length === 1 &&
          'opacity' in elementPatch &&
          Date.now() - topEntry.after.updatedAt < 1000;

        if (isOpacityTweak) {
          const updatedTop: HistoryEntry = {
            kind: 'update',
            before: topEntry.before,
            after: updatedEl,
            order
          };
          const mergedStack = [...currentStack.slice(0, -1), updatedTop];
          undoHistoryRef.current = mergedStack;
          setUndoHistory(mergedStack);
          if (redoHistoryRef.current.length > 0) {
            redoHistoryRef.current = [];
            setRedoHistory([]);
          }
        } else {
          pushUndoEntry({ kind: 'update', before: beforeEl, after: updatedEl, order });
        }
      }

      await sendOp({ action: 'update', elementId, patch });
    },
    [sendOp, pushUndoEntry]
  );

  const commitDeleteElements = useCallback(
    async (ids: string[], recordHistory = true) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const removedEls = elementsRef.current.filter(el => idSet.has(el.id));
      if (removedEls.length === 0) return;

      setElements(prev => {
        const next = prev.filter(el => !idSet.has(el.id));
        elementsRef.current = next;
        return next;
      });
      setSelectedId(curr => (curr && idSet.has(curr) ? null : curr));

      if (recordHistory) {
        pushUndoEntry({ kind: 'delete', elements: removedEls });
      }
      await sendOp({ action: 'delete', elementIds: ids });
    },
    [sendOp, pushUndoEntry]
  );

  const handleClearBoard = useCallback(
    async (target: 'drawings' | 'all', recordHistory = true) => {
      if (!canEdit) return;
      const cleared =
        target === 'drawings'
          ? elementsRef.current.filter(el => el.type !== 'image')
          : [...elementsRef.current];
      if (cleared.length === 0) return;

      if (target === 'drawings') {
        setElements(prev => {
          const next = prev.filter(el => el.type === 'image');
          elementsRef.current = next;
          return next;
        });
        setSelectedId(curr => {
          if (!curr) return null;
          const kept = elementsRef.current.find(el => el.id === curr && el.type === 'image');
          return kept ? curr : null;
        });
      } else {
        elementsRef.current = [];
        setElements([]);
        setSelectedId(null);
      }

      if (recordHistory) {
        pushUndoEntry({ kind: 'clear', target, cleared });
      }
      await sendOp({ action: 'clear', target });
    },
    [canEdit, sendOp, pushUndoEntry]
  );

  const handleUndo = useCallback(async () => {
    if (!canEdit || undoHistoryRef.current.length === 0) return;
    const entry = undoHistoryRef.current[undoHistoryRef.current.length - 1];
    const nextUndo = undoHistoryRef.current.slice(0, -1);
    const nextRedo = [...redoHistoryRef.current.slice(-59), entry];
    undoHistoryRef.current = nextUndo;
    redoHistoryRef.current = nextRedo;
    setUndoHistory(nextUndo);
    setRedoHistory(nextRedo);

    if (entry.kind === 'add') {
      await commitDeleteElements([entry.element.id], false);
    } else if (entry.kind === 'update') {
      const { before } = entry;
      await commitUpdateElement(
        before.id,
        {
          x: before.x,
          y: before.y,
          width: before.width,
          height: before.height,
          rotation: before.rotation,
          opacity: before.opacity,
          text: before.text,
          stroke: before.stroke,
          fill: before.fill,
          locked: before.locked,
          zLayer: before.zLayer,
          ...(entry.order === 'front'
            ? { order: 'back' as const }
            : entry.order === 'back'
            ? { order: 'front' as const }
            : {})
        },
        false
      );
    } else if (entry.kind === 'delete' || entry.kind === 'clear') {
      const toRestore = entry.kind === 'delete' ? entry.elements : entry.cleared;
      if (toRestore.length > 0) {
        setElements(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const merged = [...prev];
          for (const el of toRestore) {
            if (!existingIds.has(el.id)) {
              merged.push(el);
              existingIds.add(el.id);
            }
          }
          elementsRef.current = merged;
          return merged;
        });
        await sendOp({ action: 'restore', elements: toRestore });
      }
    }
  }, [canEdit, commitDeleteElements, commitUpdateElement, sendOp]);

  const handleRedo = useCallback(async () => {
    if (!canEdit || redoHistoryRef.current.length === 0) return;
    const entry = redoHistoryRef.current[redoHistoryRef.current.length - 1];
    const nextRedo = redoHistoryRef.current.slice(0, -1);
    const nextUndo = [...undoHistoryRef.current.slice(-59), entry];
    redoHistoryRef.current = nextRedo;
    undoHistoryRef.current = nextUndo;
    setRedoHistory(nextRedo);
    setUndoHistory(nextUndo);

    if (entry.kind === 'add') {
      await commitAddElement(entry.element, false);
    } else if (entry.kind === 'update') {
      const { after } = entry;
      await commitUpdateElement(
        after.id,
        {
          x: after.x,
          y: after.y,
          width: after.width,
          height: after.height,
          rotation: after.rotation,
          opacity: after.opacity,
          text: after.text,
          stroke: after.stroke,
          fill: after.fill,
          locked: after.locked,
          zLayer: after.zLayer,
          ...(entry.order ? { order: entry.order } : {})
        },
        false
      );
    } else if (entry.kind === 'delete') {
      await commitDeleteElements(
        entry.elements.map(el => el.id),
        false
      );
    } else if (entry.kind === 'clear') {
      await handleClearBoard(entry.target, false);
    }
  }, [canEdit, commitAddElement, commitUpdateElement, commitDeleteElements, handleClearBoard]);

  // Add uploaded/dropped/pasted image onto board cleanly
  const placeImageOnBoard = useCallback(
    async (src: string, naturalW: number, naturalH: number) => {
      if (!canEdit) {
        onToast('Only hosts can edit the whiteboard right now.', 'info');
        return;
      }
      const maxPlaceW = 980;
      const maxPlaceH = 660;
      const ratio = Math.min(1, maxPlaceW / Math.max(1, naturalW), maxPlaceH / Math.max(1, naturalH));
      const w = Math.max(120, Math.round(naturalW * ratio));
      const h = Math.max(90, Math.round(naturalH * ratio));
      const x = Math.round((BOARD_WIDTH - w) / 2);
      const y = Math.round((BOARD_HEIGHT - h) / 2);

      const newImg: WhiteboardElement = {
        id: makeElementId(identity),
        type: 'image',
        authorId: identity,
        authorName: displayName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x,
        y,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        src,
        locked: false,
        zLayer: 'image'
      };
      await commitAddElement(newImg, true);
      setSelectedId(newImg.id);
      setTool('pen'); // Immediately ready to draw on the image, or switch to Select to move/resize!
      onToast('Image added to whiteboard! Sketch directly on top or use Select to resize.', 'success');
    },
    [canEdit, identity, displayName, commitAddElement, onToast]
  );

  const handleImageFileSelected = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        onToast('Please upload a PNG, JPG, WebP, or GIF image.', 'error');
        return;
      }
      try {
        const prepared = await prepareImageDataUrl(file);
        await placeImageOnBoard(prepared.src, prepared.width, prepared.height);
      } catch (err: any) {
        onToast(err.message || 'Could not load image.', 'error');
      }
    },
    [placeImageOnBoard, onToast]
  );

  const handleAddImageUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url) && !url.startsWith('/uploads/')) {
      onToast('Enter a valid https:// image URL or upload from device.', 'error');
      return;
    }
    if (/\.svg($|\?)/i.test(url)) {
      onToast('SVG links are blocked for security. Use PNG, JPG, or WebP.', 'error');
      return;
    }
    setShowImageUrlPopover(false);
    setImageUrlInput('');
    await placeImageOnBoard(url, 640, 420);
  };

  // Keyboard shortcuts (Ctrl+Z Undo, Ctrl+Y / Ctrl+Shift+Z Redo, Delete selected, Paste image Ctrl+V)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const lowerKey = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (lowerKey === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (lowerKey === 'y' || (lowerKey === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && canEdit) {
        e.preventDefault();
        commitDeleteElements([selectedId]);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setTextDraftState(null);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleImageFileSelected(file);
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [handleUndo, handleRedo, selectedId, canEdit, commitDeleteElements, handleImageFileSelected]);

  // Convert screen pointer on Konva stage to logical 1600x900 coords
  const getLogicalPos = (stage: Konva.Stage | null): { x: number; y: number } | null => {
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, Math.round((pos.x / effectiveScale) * 100) / 100)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, Math.round((pos.y / effectiveScale) * 100) / 100))
    };
  };

  // Erase any non-locked drawn element near pointer (supports smooth drag erasing + grouped undo)
  const eraseAtPoint = (pt: { x: number; y: number }) => {
    if (!canEdit) return;
    const hitRadius = Math.max(16, strokeWidth * 2);
    const toErase: string[] = [];
    const currentList = elementsRef.current;

    for (const el of currentList) {
      if (erasedInDragRef.current.has(el.id)) continue;
      // Never accidentally drag-erase images; images can be deleted via Select + Delete!
      if (el.type === 'image' || el.locked) continue;

      if (el.type === 'stroke' || el.type === 'line' || el.type === 'arrow') {
        const pts = el.points || [];
        let hit = false;
        for (let i = 0; i < pts.length - 1; i += 2) {
          const dx = pts[i] - pt.x;
          const dy = pts[i + 1] - pt.y;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) {
            hit = true;
            break;
          }
          // Check segment midpoint for fast strokes
          if (i + 3 < pts.length) {
            const mx = (pts[i] + pts[i + 2]) / 2;
            const my = (pts[i + 1] + pts[i + 3]) / 2;
            const mdx = mx - pt.x;
            const mdy = my - pt.y;
            if (mdx * mdx + mdy * mdy <= hitRadius * hitRadius) {
              hit = true;
              break;
            }
          }
        }
        if (hit) toErase.push(el.id);
      } else if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'text' || el.type === 'sticky') {
        const ex = el.x ?? 0;
        const ey = el.y ?? 0;
        const ew = el.width ?? (el.type === 'text' ? 160 : 180);
        const eh = el.height ?? (el.type === 'text' ? 40 : 120);
        const minX = Math.min(ex, ex + ew) - 10;
        const maxX = Math.max(ex, ex + ew) + 10;
        const minY = Math.min(ey, ey + eh) - 10;
        const maxY = Math.max(ey, ey + eh) + 10;
        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
          toErase.push(el.id);
        }
      }
    }

    if (toErase.length > 0) {
      const eraseSet = new Set(toErase);
      const removedBatch = currentList.filter(el => eraseSet.has(el.id));
      toErase.forEach(id => erasedInDragRef.current.add(id));
      erasedElementsInDragRef.current.push(...removedBatch);
      commitDeleteElements(toErase, false);
    }
  };

  const handleStagePointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    setShowClearMenu(false);
    setShowImageUrlPopover(false);
    const stage = e.target.getStage();
    const pt = getLogicalPos(stage);
    if (!pt) return;

    if (tool === 'select') {
      // Clicked empty canvas / background rect -> deselect
      if (e.target === stage || e.target.name() === 'wb-canvas-bg') {
        setSelectedId(null);
      }
      return;
    }

    if (!canEdit) {
      onToast('Host has set whiteboard to view-only for participants.', 'info');
      return;
    }

    if (tool === 'text' || tool === 'sticky') {
      setTextDraftState({
        mode: tool,
        x: Math.min(BOARD_WIDTH - 240, Math.max(24, pt.x)),
        y: Math.min(BOARD_HEIGHT - 120, Math.max(24, pt.y)),
        value: ''
      });
      return;
    }

    if (tool === 'eraser') {
      isDrawingRef.current = true;
      erasedInDragRef.current.clear();
      erasedElementsInDragRef.current = [];
      eraseAtPoint(pt);
      return;
    }

    isDrawingRef.current = true;
    const now = Date.now();
    const id = makeElementId(identity);

    if (tool === 'pen' || tool === 'highlighter') {
      const isHighlight = tool === 'highlighter';
      const newStroke: WhiteboardElement = {
        id,
        type: 'stroke',
        tool,
        authorId: identity,
        authorName: displayName,
        createdAt: now,
        updatedAt: now,
        points: [pt.x, pt.y, pt.x + 0.1, pt.y + 0.1],
        stroke: strokeColor,
        strokeWidth: isHighlight ? Math.max(16, strokeWidth * 3) : strokeWidth,
        opacity: isHighlight ? 0.35 : 1,
        zLayer: 'draw'
      };
      setDraftElement(newStroke);
      emitLivePreview(pt, newStroke, true);
    } else if (tool === 'rect' || tool === 'ellipse') {
      const newShape: WhiteboardElement = {
        id,
        type: tool,
        authorId: identity,
        authorName: displayName,
        createdAt: now,
        updatedAt: now,
        x: pt.x,
        y: pt.y,
        width: 2,
        height: 2,
        stroke: strokeColor,
        strokeWidth,
        fill: 'transparent',
        opacity: 1,
        zLayer: 'draw'
      };
      setDraftElement(newShape);
      emitLivePreview(pt, newShape, true);
    } else if (tool === 'line' || tool === 'arrow') {
      const newLine: WhiteboardElement = {
        id,
        type: tool,
        authorId: identity,
        authorName: displayName,
        createdAt: now,
        updatedAt: now,
        points: [pt.x, pt.y, pt.x, pt.y],
        stroke: strokeColor,
        strokeWidth,
        opacity: 1,
        zLayer: 'draw'
      };
      setDraftElement(newLine);
      emitLivePreview(pt, newLine, true);
    }
  };

  const handleStagePointerMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawingRef.current) return;
    const stage = e.target.getStage();
    const pt = getLogicalPos(stage);
    if (!pt) return;

    if (tool === 'eraser') {
      eraseAtPoint(pt);
      return;
    }

    const curr = draftElementRef.current;
    if (!curr) return;

    if (curr.type === 'stroke') {
      const pts = curr.points || [];
      const lastX = pts[pts.length - 2] ?? pt.x;
      const lastY = pts[pts.length - 1] ?? pt.y;
      if ((pt.x - lastX) ** 2 + (pt.y - lastY) ** 2 < 2.2) return;
      const updated = { ...curr, points: [...pts, pt.x, pt.y] };
      setDraftElement(updated);
      emitLivePreview(pt, updated, false);
    } else if (curr.type === 'rect' || curr.type === 'ellipse') {
      const updated = {
        ...curr,
        width: pt.x - (curr.x ?? pt.x),
        height: pt.y - (curr.y ?? pt.y)
      };
      setDraftElement(updated);
      emitLivePreview(pt, updated, false);
    } else if (curr.type === 'line' || curr.type === 'arrow') {
      const pts = curr.points || [pt.x, pt.y, pt.x, pt.y];
      const updated = {
        ...curr,
        points: [pts[0], pts[1], pt.x, pt.y]
      };
      setDraftElement(updated);
      emitLivePreview(pt, updated, false);
    }
  };

  const finalizeDraft = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    erasedInDragRef.current.clear();

    if (erasedElementsInDragRef.current.length > 0) {
      pushUndoEntry({ kind: 'delete', elements: [...erasedElementsInDragRef.current] });
      erasedElementsInDragRef.current = [];
    }

    const finished = draftElementRef.current;
    setDraftElement(null);
    emitLivePreview(null, null, true);

    if (!finished) return;

    // Normalize negative width/height on shapes before saving
    let finalEl = finished;
    if (finished.type === 'rect' || finished.type === 'ellipse') {
      const rawX = finished.x ?? 0;
      const rawY = finished.y ?? 0;
      const rawW = finished.width ?? 0;
      const rawH = finished.height ?? 0;
      if (Math.abs(rawW) < 4 && Math.abs(rawH) < 4) return;
      finalEl = {
        ...finished,
        x: rawW < 0 ? rawX + rawW : rawX,
        y: rawH < 0 ? rawY + rawH : rawY,
        width: Math.abs(rawW),
        height: Math.abs(rawH)
      };
    } else if (finished.type === 'line' || finished.type === 'arrow') {
      const pts = finished.points || [];
      if (pts.length >= 4) {
        const dist = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
        if (dist < 4) return;
      }
    }

    commitAddElement(finalEl, true);
  };

  const handleCommitTextDraft = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textDraftState) return;
    const textVal = textDraftState.value.trim();
    if (!textVal) {
      setTextDraftState(null);
      return;
    }

    if (textDraftState.editingId) {
      await commitUpdateElement(textDraftState.editingId, { text: textVal });
      setTextDraftState(null);
      return;
    }

    const isSticky = textDraftState.mode === 'sticky';
    const newEl: WhiteboardElement = {
      id: makeElementId(identity),
      type: isSticky ? 'sticky' : 'text',
      authorId: identity,
      authorName: displayName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: textDraftState.x,
      y: textDraftState.y,
      width: isSticky ? 220 : 280,
      height: isSticky ? 150 : 48,
      text: textVal,
      fontSize: isSticky ? 18 : 24,
      stroke: strokeColor,
      fill: isSticky ? '#FEF08A' : strokeColor === '#FFFFFF' && background !== 'dark' ? '#0F172A' : strokeColor,
      opacity: 1,
      zLayer: 'draw'
    };

    setTextDraftState(null);
    await commitAddElement(newEl, true);
  };

  const handleExportPng = () => {
    if (!stageRef.current) return;
    setIsExporting(true);
    const prevSelected = selectedId;
    setSelectedId(null);

    setTimeout(() => {
      try {
        const uri = stageRef.current?.toDataURL({ pixelRatio: 2 });
        if (uri) {
          const link = document.createElement('a');
          const stamp = new Date().toISOString().slice(0, 10);
          link.download = `nexgen-whiteboard-${meetingCode || 'session'}-${stamp}.png`;
          link.href = uri;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          onToast('Whiteboard exported as PNG!', 'success');
        }
      } catch {
        onToast('Unable to export external cross-origin image; uploaded images export cleanly.', 'error');
      } finally {
        setSelectedId(prevSelected);
        setIsExporting(false);
      }
    }, 60);
  };

  const handleToggleDrawingLock = async () => {
    if (!isHost) return;
    const nextLocked = !lockDrawingToHost;
    setLockDrawingToHost(nextLocked);
    await sendOp({ action: 'settings', lockDrawingToHost: nextLocked });
    onToast(
      nextLocked ? 'Whiteboard set to Host-Only drawing.' : 'Everyone in the call can now draw.',
      'info'
    );
  };

  const handlePresentToAll = async () => {
    if (!isHost) return;
    const nextPresent = !presentedByHost;
    setPresentedByHost(nextPresent);
    await sendOp({ action: 'present', presented: nextPresent });
    onToast(
      nextPresent
        ? 'Whiteboard opened on all participants’ screens!'
        : 'Host presentation pin released.',
      'info'
    );
  };

  const handleFitImageToBoard = () => {
    if (!selectedElement || selectedElement.type !== 'image') return;
    const curW = selectedElement.width || 480;
    const curH = selectedElement.height || 320;
    const ratio = Math.min((BOARD_WIDTH - 80) / curW, (BOARD_HEIGHT - 80) / curH);
    const newW = Math.round(curW * ratio);
    const newH = Math.round(curH * ratio);
    commitUpdateElement(selectedElement.id, {
      x: Math.round((BOARD_WIDTH - newW) / 2),
      y: Math.round((BOARD_HEIGHT - newH) / 2),
      width: newW,
      height: newH,
      rotation: 0
    });
  };

  // Partition elements cleanly: Image layer (bottom) + Drawing/Annotation layer (top)
  // so you can always draw freely on top of any image!
  const imageElements = useMemo(
    () => elements.filter(el => el.type === 'image'),
    [elements]
  );
  const drawElements = useMemo(
    () => elements.filter(el => el.type !== 'image'),
    [elements]
  );

  const bgFill = background === 'dark' ? '#0F172A' : '#FFFFFF';
  const gridColor = background === 'dark' ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)';

  const renderGridLines = useMemo(() => {
    if (background !== 'grid') return null;
    const lines: React.ReactNode[] = [];
    const step = 40;
    for (let x = step; x < BOARD_WIDTH; x += step) {
      lines.push(
        <Line key={`gx_${x}`} points={[x, 0, x, BOARD_HEIGHT]} stroke={gridColor} strokeWidth={1} listening={false} />
      );
    }
    for (let y = step; y < BOARD_HEIGHT; y += step) {
      lines.push(
        <Line key={`gy_${y}`} points={[0, y, BOARD_WIDTH, y]} stroke={gridColor} strokeWidth={1} listening={false} />
      );
    }
    return lines;
  }, [background, gridColor]);

  const renderDrawElement = (el: WhiteboardElement, isPreview = false) => {
    const canDragNode = !isPreview && tool === 'select' && canEdit && !el.locked;
    const listening = !isPreview && tool === 'select';
    const onSelectNode = () => {
      if (tool === 'select') setSelectedId(el.id);
    };

    if (el.type === 'stroke') {
      return (
        <Line
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          points={el.points || []}
          stroke={el.stroke || '#0F172A'}
          strokeWidth={el.strokeWidth || 4}
          opacity={el.opacity ?? 1}
          tension={0.45}
          lineCap="round"
          lineJoin="round"
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
          onDragEnd={(e) => {
            commitUpdateElement(el.id, {
              x: Math.round(e.target.x() * 100) / 100,
              y: Math.round(e.target.y() * 100) / 100
            });
          }}
          x={el.x ?? 0}
          y={el.y ?? 0}
        />
      );
    }

    if (el.type === 'rect') {
      const x = (el.width ?? 0) < 0 ? (el.x ?? 0) + (el.width ?? 0) : (el.x ?? 0);
      const y = (el.height ?? 0) < 0 ? (el.y ?? 0) + (el.height ?? 0) : (el.y ?? 0);
      const w = Math.abs(el.width ?? 0);
      const h = Math.abs(el.height ?? 0);
      return (
        <Rect
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          x={x}
          y={y}
          width={w}
          height={h}
          rotation={el.rotation ?? 0}
          stroke={el.stroke || '#0F172A'}
          strokeWidth={el.strokeWidth || 4}
          fill={el.fill || 'transparent'}
          opacity={el.opacity ?? 1}
          cornerRadius={6}
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
          onDragEnd={(e) => {
            commitUpdateElement(el.id, {
              x: Math.round(e.target.x() * 100) / 100,
              y: Math.round(e.target.y() * 100) / 100
            });
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            commitUpdateElement(el.id, {
              x: Math.round(node.x() * 100) / 100,
              y: Math.round(node.y() * 100) / 100,
              width: Math.max(12, Math.round(node.width() * sx * 100) / 100),
              height: Math.max(12, Math.round(node.height() * sy * 100) / 100),
              rotation: Math.round(node.rotation() * 10) / 10
            });
          }}
        />
      );
    }

    if (el.type === 'ellipse') {
      const x = (el.width ?? 0) < 0 ? (el.x ?? 0) + (el.width ?? 0) : (el.x ?? 0);
      const y = (el.height ?? 0) < 0 ? (el.y ?? 0) + (el.height ?? 0) : (el.y ?? 0);
      const w = Math.abs(el.width ?? 0);
      const h = Math.abs(el.height ?? 0);
      return (
        <Ellipse
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          x={x + w / 2}
          y={y + h / 2}
          radiusX={Math.max(2, w / 2)}
          radiusY={Math.max(2, h / 2)}
          rotation={el.rotation ?? 0}
          stroke={el.stroke || '#0F172A'}
          strokeWidth={el.strokeWidth || 4}
          fill={el.fill || 'transparent'}
          opacity={el.opacity ?? 1}
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
          onDragEnd={(e) => {
            commitUpdateElement(el.id, {
              x: Math.round((e.target.x() - w / 2) * 100) / 100,
              y: Math.round((e.target.y() - h / 2) * 100) / 100
            });
          }}
        />
      );
    }

    if (el.type === 'line') {
      return (
        <Line
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          points={el.points || []}
          stroke={el.stroke || '#0F172A'}
          strokeWidth={el.strokeWidth || 4}
          lineCap="round"
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
        />
      );
    }

    if (el.type === 'arrow') {
      return (
        <Arrow
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          points={el.points || []}
          stroke={el.stroke || '#0F172A'}
          fill={el.stroke || '#0F172A'}
          strokeWidth={el.strokeWidth || 4}
          pointerLength={16}
          pointerWidth={14}
          lineCap="round"
          lineJoin="round"
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
        />
      );
    }

    if (el.type === 'sticky') {
      const w = el.width ?? 220;
      const h = el.height ?? 150;
      return (
        <Group
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          x={el.x ?? 100}
          y={el.y ?? 100}
          rotation={el.rotation ?? 0}
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
          onDblClick={() => {
            if (!canEdit) return;
            setTextDraftState({
              mode: 'sticky',
              x: el.x ?? 100,
              y: el.y ?? 100,
              editingId: el.id,
              value: el.text || ''
            });
          }}
          onDragEnd={(e) => {
            commitUpdateElement(el.id, {
              x: Math.round(e.target.x() * 100) / 100,
              y: Math.round(e.target.y() * 100) / 100
            });
          }}
        >
          <Rect
            width={w}
            height={h}
            fill={el.fill || '#FEF08A'}
            stroke="#EAB308"
            strokeWidth={1.5}
            cornerRadius={10}
            shadowColor="rgba(15, 23, 42, 0.18)"
            shadowBlur={10}
            shadowOffsetY={4}
          />
          <Text
            x={14}
            y={14}
            width={w - 28}
            height={h - 28}
            text={el.text || ''}
            fontSize={el.fontSize || 18}
            fontFamily="Plus Jakarta Sans, sans-serif"
            fill="#0F172A"
            wrap="word"
          />
        </Group>
      );
    }

    if (el.type === 'text') {
      return (
        <Text
          key={el.id}
          ref={isPreview ? undefined : (node) => registerNode(el.id, node)}
          x={el.x ?? 100}
          y={el.y ?? 100}
          width={el.width ?? 320}
          rotation={el.rotation ?? 0}
          text={el.text || ''}
          fontSize={el.fontSize || 24}
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontStyle="600"
          fill={el.fill || el.stroke || '#0F172A'}
          listening={listening}
          draggable={canDragNode}
          onClick={onSelectNode}
          onTap={onSelectNode}
          onDblClick={() => {
            if (!canEdit) return;
            setTextDraftState({
              mode: 'text',
              x: el.x ?? 100,
              y: el.y ?? 100,
              editingId: el.id,
              value: el.text || ''
            });
          }}
          onDragEnd={(e) => {
            commitUpdateElement(el.id, {
              x: Math.round(e.target.x() * 100) / 100,
              y: Math.round(e.target.y() * 100) / 100
            });
          }}
        />
      );
    }

    return null;
  };

  const remoteCursors = Object.values(remoteLiveMap).filter(r => r.cursor);
  const remoteStrokes = Object.values(remoteLiveMap)
    .map(r => r.stroke)
    .filter((s): s is WhiteboardElement => Boolean(s));

  const toolsList: { id: WhiteboardTool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select & Move', icon: <MousePointer2 className="w-4 h-4" /> },
    { id: 'pen', label: 'Pen', icon: <Pencil className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-4 h-4" /> },
    { id: 'rect', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
    { id: 'ellipse', label: 'Circle / Ellipse', icon: <Circle className="w-4 h-4" /> },
    { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'line', label: 'Line', icon: <Minus className="w-4 h-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'sticky', label: 'Sticky Note', icon: <StickyNote className="w-4 h-4" /> }
  ];

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 border-r border-slate-800 overflow-hidden select-none">
      {/* Hidden File Picker for Image Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageFileSelected(file);
          e.target.value = '';
        }}
      />

      {/* Whiteboard Studio Top Bar */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
            Collaborative Whiteboard
          </span>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
            · {elements.length} item{elements.length === 1 ? '' : 's'}
          </span>
          {!canEdit && (
            <span className="text-[11px] text-amber-300 font-semibold whitespace-nowrap inline-flex items-center gap-1">
              · <Lock className="w-3 h-3" /> View Only
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Background Mode Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {(['light', 'grid', 'dark'] as const).map(bgMode => (
              <button
                key={bgMode}
                type="button"
                disabled={!canEdit}
                onClick={() => handleSelectBackground(bgMode)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md capitalize cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                  background === bgMode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {bgMode}
              </button>
            ))}
          </div>

          {/* Add Image Button + URL Popover */}
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Upload image to board and sketch on top (or paste Ctrl+V)"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>Add Image</span>
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setShowImageUrlPopover(prev => !prev)}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 disabled:opacity-40 text-slate-300 cursor-pointer"
              title="Insert Image by URL"
              aria-label="Insert image by URL"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>

            {showImageUrlPopover && (
              <form
                onSubmit={handleAddImageUrl}
                className="absolute right-0 top-10 z-40 w-72 bg-slate-900 border border-slate-700 rounded-xl p-2.5 shadow-2xl space-y-2"
              >
                <div className="text-[11px] font-semibold text-slate-200">Insert HTTPS Image URL</div>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/diagram.png"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Host Controls: Permissions & Present */}
          {isHost && (
            <>
              <button
                type="button"
                onClick={handleToggleDrawingLock}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  lockDrawingToHost
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                    : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-600'
                }`}
                title="Control whether all participants or only hosts can draw"
              >
                {lockDrawingToHost ? <Shield className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline">{lockDrawingToHost ? 'Host Draw Only' : 'All Can Draw'}</span>
              </button>

              <button
                type="button"
                onClick={handlePresentToAll}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  presentedByHost
                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                    : 'bg-slate-900 border-slate-800 text-amber-300 hover:border-amber-500/40'
                }`}
                title="Open the whiteboard on all connected call participants' screens"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{presentedByHost ? 'Presenting' : 'Open for All'}</span>
              </button>
            </>
          )}

          {/* Export PNG */}
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportPng}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Download Whiteboard & Image Sketches as PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Save PNG</span>
          </button>

          {/* Toggle Split Video vs Full Board */}
          <button
            type="button"
            onClick={onToggleSplitVideoMode}
            className="min-h-[34px] min-w-[34px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title={splitVideoMode === 'split' ? 'Maximize Whiteboard (Compact Video)' : 'Side-by-Side Call & Board'}
          >
            {splitVideoMode === 'split' ? <Maximize className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Whiteboard View */}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Return to full video call"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: Compact Tool Palette + Interactive Stage */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden relative">
        {/* Left/Top Tool Rail */}
        <div className="bg-slate-950/90 border-b sm:border-b-0 sm:border-r border-slate-800 p-1.5 sm:p-2 flex sm:flex-col items-center gap-1 overflow-x-auto sm:overflow-y-auto shrink-0">
          {toolsList.map(item => (
            <button
              key={item.id}
              type="button"
              disabled={!canEdit && item.id !== 'select'}
              onClick={() => setTool(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-35 shrink-0 ${
                tool === item.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon}
            </button>
          ))}

          <div className="w-px h-5 sm:w-6 sm:h-px bg-slate-800 my-0.5 shrink-0" />

          {/* Undo */}
          <button
            type="button"
            disabled={!canEdit || undoHistory.length === 0}
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-35 cursor-pointer shrink-0"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo */}
          <button
            type="button"
            disabled={!canEdit || redoHistory.length === 0}
            onClick={handleRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-35 cursor-pointer shrink-0"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Clear Board Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={!canEdit || elements.length === 0}
              onClick={() => setShowClearMenu(prev => !prev)}
              title="Clear drawings or whole board"
              aria-label="Clear board options"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-rose-300 hover:bg-rose-500/20 disabled:opacity-35 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {showClearMenu && (
              <div className="fixed sm:absolute left-3 sm:left-11 bottom-16 sm:bottom-auto sm:top-0 z-50 w-52 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowClearMenu(false);
                    handleClearBoard('drawings', true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Clear Drawings Only (Keep Images)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowClearMenu(false);
                    handleClearBoard('all', true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 rounded-lg cursor-pointer"
                >
                  Clear Entire Board
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative bg-slate-900/95">
          {/* Sub-bar: Colors + Stroke Sizes + Selected Image/Object Properties */}
          <div className="px-3 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Swatches */}
              <div className="flex items-center gap-1">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      setStrokeColor(c.value);
                      if (selectedElement && selectedElement.type !== 'image' && canEdit) {
                        commitUpdateElement(selectedElement.id, {
                          stroke: c.value,
                          ...(selectedElement.type === 'text' ? { fill: c.value } : {})
                        });
                      }
                    }}
                    title={c.label}
                    aria-label={c.label}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                      strokeColor === c.value
                        ? 'scale-115 ring-2 ring-blue-500 border-white'
                        : 'border-slate-600 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
                <label
                  className="w-5 h-5 rounded-full border border-slate-600 overflow-hidden cursor-pointer flex items-center justify-center bg-slate-800"
                  title="Custom Color"
                >
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-7 h-7 -m-1 cursor-pointer bg-transparent border-0"
                    aria-label="Custom ink color"
                  />
                </label>
              </div>

              <span className="h-4 w-px bg-slate-800" />

              {/* Stroke Thickness */}
              <div className="flex items-center gap-1">
                {STROKE_WIDTHS.map(sw => (
                  <button
                    key={sw.value}
                    type="button"
                    onClick={() => setStrokeWidth(sw.value)}
                    title={`${sw.label} (${sw.value}px)`}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer tabular-nums ${
                      strokeWidth === sw.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {sw.value}px
                  </button>
                ))}
              </div>
            </div>

            {/* Contextual Controls when an element (especially Image!) is selected */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedElement && canEdit && (
                <>
                  {selectedElement.type === 'image' && (
                    <>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5">
                        <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
                        <span className="tabular-nums">{Math.round((selectedElement.opacity ?? 1) * 100)}%</span>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          value={Math.round((selectedElement.opacity ?? 1) * 100)}
                          onChange={(e) =>
                            commitUpdateElement(selectedElement.id, {
                              opacity: Number(e.target.value) / 100
                            })
                          }
                          className="w-16 accent-blue-500 cursor-pointer"
                          aria-label="Image opacity"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleFitImageToBoard}
                        className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-[11px] font-medium text-slate-200 cursor-pointer whitespace-nowrap"
                        title="Center & fit image cleanly to whiteboard"
                      >
                        Fit Image
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      commitUpdateElement(selectedElement.id, {
                        locked: !selectedElement.locked
                      })
                    }
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      selectedElement.locked
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                    title={selectedElement.locked ? 'Unlock item' : 'Lock position so sketching never moves it'}
                  >
                    {selectedElement.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{selectedElement.locked ? 'Locked' : 'Lock'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => commitUpdateElement(selectedElement.id, { order: 'front' })}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-[11px] text-slate-300 flex items-center gap-1 cursor-pointer"
                    title="Bring Forward"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Front</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => commitDeleteElements([selectedElement.id])}
                    className="px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-[11px] font-semibold text-rose-300 cursor-pointer"
                  >
                    Delete
                  </button>
                </>
              )}

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
                  className="p-1 text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="px-1.5 text-[11px] font-mono text-slate-300 hover:text-white tabular-nums cursor-pointer"
                  title="Reset Zoom to Fit"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))}
                  className="p-1 text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Konva Canvas Viewport (Supports Drag & Drop Images!) */}
          <div
            ref={viewportRef}
            onDragOver={(e) => {
              e.preventDefault();
              if (canEdit) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (!canEdit) return;
              const file = e.dataTransfer?.files?.[0];
              if (file && file.type.startsWith('image/')) {
                handleImageFileSelected(file);
              }
            }}
            className="flex-1 min-h-0 w-full overflow-auto flex items-center justify-center p-3 relative"
            style={{ touchAction: tool === 'select' ? 'auto' : 'none' }}
          >
            {isDragOver && (
              <div className="absolute inset-3 z-30 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/15 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                <div className="px-5 py-3 rounded-xl bg-slate-950/90 border border-blue-500/40 text-sm font-semibold text-blue-200 flex items-center gap-2 shadow-xl">
                  <ImagePlus className="w-5 h-5 text-blue-400" />
                  <span>Drop image onto whiteboard to draw on it</span>
                </div>
              </div>
            )}

            <div
              className="relative rounded-xl overflow-hidden shadow-2xl border border-slate-700/80 shrink-0"
              style={{
                width: stagePixelWidth,
                height: stagePixelHeight,
                cursor:
                  tool === 'select'
                    ? 'default'
                    : tool === 'text' || tool === 'sticky'
                    ? 'text'
                    : 'crosshair'
              }}
            >
              <Stage
                ref={stageRef}
                width={stagePixelWidth}
                height={stagePixelHeight}
                scaleX={effectiveScale}
                scaleY={effectiveScale}
                onMouseDown={handleStagePointerDown}
                onTouchStart={handleStagePointerDown}
                onMouseMove={handleStagePointerMove}
                onTouchMove={handleStagePointerMove}
                onMouseUp={finalizeDraft}
                onTouchEnd={finalizeDraft}
                onMouseLeave={finalizeDraft}
              >
                {/* Layer 1: Board Background + Grid + Placed Images (Always Underneath Sketches!) */}
                <Layer>
                  <Rect
                    name="wb-canvas-bg"
                    x={0}
                    y={0}
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                    fill={bgFill}
                  />
                  {renderGridLines}

                  {imageElements.map(imgEl => (
                    <CanvasImageNode
                      key={imgEl.id}
                      element={imgEl}
                      listening={tool === 'select'}
                      draggable={tool === 'select' && canEdit && !imgEl.locked}
                      onSelect={() => {
                        if (tool === 'select') setSelectedId(imgEl.id);
                      }}
                      onRegisterNode={registerNode}
                      onTransformChange={commitUpdateElement}
                    />
                  ))}
                </Layer>

                {/* Layer 2: Sketches, Highlighter, Shapes, Arrows, Text, Sticky Notes + Live Remote Previews */}
                <Layer>
                  {drawElements.map(el => renderDrawElement(el, false))}
                  {remoteStrokes.map(rs => renderDrawElement(rs, true))}
                  {draftElement && renderDrawElement(draftElement, true)}
                </Layer>

                {/* Layer 3: Selection Transformer Overlay */}
                <Layer>
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled={true}
                    borderStroke="#2563EB"
                    anchorStroke="#2563EB"
                    anchorFill="#FFFFFF"
                    anchorSize={9}
                    keepRatio={false}
                    boundBoxFunc={(oldBox, newBox) => {
                      if (newBox.width < 20 || newBox.height < 20) return oldBox;
                      return newBox;
                    }}
                  />
                </Layer>
              </Stage>

              {/* Live Collaborator Cursor Badges Overlay */}
              {remoteCursors.map(rc => {
                if (!rc.cursor) return null;
                const color = pickAuthorColor(rc.actorIdentity);
                return (
                  <div
                    key={rc.actorIdentity}
                    className="absolute pointer-events-none z-20 transition-transform duration-75"
                    style={{
                      left: rc.cursor.x * effectiveScale,
                      top: rc.cursor.y * effectiveScale,
                      transform: 'translate(-2px, -2px)'
                    }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full border border-white shadow"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="mt-0.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shadow whitespace-nowrap"
                      style={{ backgroundColor: color }}
                    >
                      {rc.authorName}
                    </span>
                  </div>
                );
              })}

              {/* Inline Floating Text / Sticky Note Input Composer */}
              {textDraftState && (
                <form
                  onSubmit={handleCommitTextDraft}
                  className="absolute z-30 bg-slate-900 border border-blue-500/60 rounded-xl p-2 shadow-2xl w-64 space-y-2"
                  style={{
                    left: Math.min(
                      Math.max(8, textDraftState.x * effectiveScale),
                      Math.max(8, stagePixelWidth - 268)
                    ),
                    top: Math.min(
                      Math.max(8, textDraftState.y * effectiveScale),
                      Math.max(8, stagePixelHeight - 130)
                    )
                  }}
                >
                  <div className="text-[11px] font-semibold text-slate-300">
                    {textDraftState.mode === 'sticky' ? 'Add Sticky Note' : 'Add Text Annotation'}
                  </div>
                  <textarea
                    rows={2}
                    value={textDraftState.value}
                    onChange={(e) =>
                      setTextDraftState(prev => (prev ? { ...prev, value: e.target.value } : null))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleCommitTextDraft();
                      } else if (e.key === 'Escape') {
                        setTextDraftState(null);
                      }
                    }}
                    placeholder={
                      textDraftState.mode === 'sticky'
                        ? 'Write idea or note...'
                        : 'Type label on canvas or image...'
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTextDraftState(null)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>{textDraftState.editingId ? 'Save' : 'Place'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Subtle Empty Hint Overlay when board is empty */}
              {elements.length === 0 && !draftElement && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-[11px] text-slate-200 whitespace-nowrap shadow">
                  Draw freely, drop/paste any image (Ctrl+V), and sketch ideas live with everyone in the call
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
