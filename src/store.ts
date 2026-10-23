import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { normalize, type Graph } from './geometry/graph';
import { PRESETS, TEMPLATES, type TemplateId } from './geometry/templates';
import type { BoxParams } from './geometry/types';
import { fitText, newObjectId, type ArtObject } from './art/objects';

export interface Layers {
  bleed: boolean;
  cut: boolean;
  crease: boolean;
  artwork: boolean;
}

/** Documento editável: o que entra no histórico de desfazer/refazer. */
export interface Doc {
  graph: Graph;
  /** Nomes por id de face. */
  names: Record<string, string>;
  /** Face base da dobra 3D. */
  root?: string;
  /** Objetos de arte, em ordem de empilhamento (o último fica por cima). */
  objects: ArtObject[];
}

export type ArtSide = 'out' | 'in';

/** Fundos de um lado do papel. */
export interface SideArt {
  bgColor?: string;
  fullImage?: string;
  faceColors: Record<string, string>;
  faceImages: Record<string, string>;
}

const EMPTY_SIDE: SideArt = { faceColors: {}, faceImages: {} };

/** Fundos do lado indicado (exterior = campos de topo do estado, por compatibilidade). */
export const sideArt = (s: { artSide: ArtSide; interior: SideArt; bgColor?: string; fullImage?: string; faceColors: Record<string, string>; faceImages: Record<string, string> }, side = s.artSide): SideArt =>
  side === 'in' ? s.interior : { bgColor: s.bgColor, fullImage: s.fullImage, faceColors: s.faceColors, faceImages: s.faceImages };

/** O interior tem alguma arte? */
export const hasInterior = (s: { interior: SideArt; doc: { objects: { side?: ArtSide }[] } }) =>
  !!(s.interior.bgColor || s.interior.fullImage || Object.keys(s.interior.faceColors).length ||
    Object.keys(s.interior.faceImages).length || s.doc.objects.some((o) => o.side === 'in'));

export type Tool = 'select' | 'cut' | 'crease' | 'pen' | 'rect' | 'ellipse' | 'text';

/** Modo de trabalho: desenhar o molde, decorar, ou conferir a montagem. */
export type Mode = 'structure' | 'art' | 'verify';

export interface Selection {
  vertices: string[];
  edges: string[];
  face?: string;
  object?: string;
  /** Seleção múltipla de objetos (Shift): inclui `object`, que é o principal. */
  objects?: string[];
}

/** Objetos selecionados (o principal primeiro). */
export const selectedObjects = (sel: Selection): string[] =>
  sel.objects?.length ? sel.objects : sel.object ? [sel.object] : [];

const EMPTY_SEL: Selection = { vertices: [], edges: [] };
const HISTORY_LIMIT = 100;

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  source: 'template' | 'import' | 'edited';
  template: TemplateId;
  params: BoxParams;
  bleed: number;
  layers: Layers;
  fullImage?: string;
  faceImages: Record<string, string>;
  fold: number; // 0..1
  tool: Tool;
  mode: Mode;
  /** Último modo de trabalho (Arte/Edição), para voltar ao sair do 3D. */
  lastWorkMode: 'art' | 'structure';
  /** Cor de fundo do molde inteiro (até a sangria). */
  bgColor?: string;
  /** Cor de fundo por face. */
  faceColors: Record<string, string>;
  /** Lado em que a arte está sendo editada: exterior (frente do papel) ou interior (verso). */
  artSide: ArtSide;
  /** Arte do interior (verso do papel); objetos do interior ficam em doc.objects com side = 'in'. */
  interior: SideArt;
  sel: Selection;
  /** Arrastando vértices: atualizações ao vivo sem histórico. */
  dragging: boolean;
  /** Passo da grade de snap em mm (0 = desligado). */
  grid: number;
  /** Mostra as cotas (medidas) das linhas no modo Edição. */
  showDims: boolean;
  /** Resumo da última importação de SVG. */
  importInfo?: string;
  /** Incrementado quando o molde é substituído (o editor reenquadra a vista). */
  fitToken: number;
  /** Verificação: distância mínima do texto até corte/vinco (mm) e dpi mínimo. */
  safeMargin: number;
  minDpi: number;
  /** Incrementado quando uma fonte termina de carregar (redesenha textos). */
  fontsVersion: number;

  /** Aplica uma alteração ao documento e grava no histórico. */
  commit: (doc: Partial<Doc>, source?: State['source']) => void;
  setGraphLive: (graph: Graph) => void;
  beginDrag: () => void;
  endDrag: (moved: boolean) => void;
  undo: () => void;
  redo: () => void;

  setParam: <K extends keyof BoxParams>(k: K, v: BoxParams[K]) => void;
  regenerate: () => void;
  /** Troca o modelo paramétrico (mantém a arte) com as medidas dadas ou as do modelo. */
  setTemplate: (id: TemplateId, params?: Partial<BoxParams>) => void;
  /** Galeria de modelos (tela inicial / novo projeto). */
  galleryOpen: boolean;
  setGalleryOpen: (v: boolean) => void;
  setBleed: (v: number) => void;
  toggleLayer: (k: keyof Layers) => void;
  setFullImage: (url?: string) => void;
  setFaceImage: (id: string, url?: string) => void;
  setFold: (v: number) => void;
  setTool: (t: Tool) => void;
  setMode: (m: Mode) => void;
  /** Liga/desliga a verificação 3D, voltando ao modo em que estava. */
  toggleVerify: () => void;
  setBgColor: (c?: string) => void;
  setFaceColor: (id: string, c?: string) => void;
  setArtSide: (side: ArtSide) => void;
  setSafeMargin: (v: number) => void;
  setMinDpi: (v: number) => void;

  addObject: (o: ArtObject) => void;
  /** Altera um objeto e grava no histórico. */
  updateObject: (id: string, patch: Partial<ArtObject>) => void;
  /** Altera um objeto ao vivo (durante arrasto), sem histórico. */
  setObjectLive: (id: string, patch: Partial<ArtObject>) => void;
  deleteObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  reorderObject: (id: string, to: 'up' | 'down' | 'front' | 'back') => void;
  select: (sel: Partial<Selection>) => void;
  /** Imagem em ajuste dentro do corte (arrastar move a imagem, não a moldura). */
  cropEdit?: string;
  setCropEdit: (id?: string) => void;
  setGrid: (v: number) => void;
  /** Snap (ímã) ligado: pontos, linhas, centros e grade. Atalho: S. */
  snap: boolean;
  toggleSnap: () => void;
  /** Altera vários objetos ao vivo (arrasto de seleção múltipla). */
  setObjectsLive: (patches: Record<string, Partial<ArtObject>>) => void;
  /** Exclui vários objetos (um passo no histórico). */
  deleteObjects: (ids: string[]) => void;
  setShowDims: (v: boolean) => void;
  /** Projeto novo a partir de um modelo da galeria. */
  reset: (presetId?: string) => void;
}

const DEFAULT_PARAMS: BoxParams = { width: 100, depth: 80, height: 40, tuck: 15, glue: 20, thickness: 0.5 };

const fromTemplate = (id: TemplateId, p: BoxParams): Omit<Doc, 'objects'> => {
  const { graph, names, root } = TEMPLATES[id].build(p);
  return { graph, names, root };
};

/** Texto muda de tamanho junto com conteúdo/fonte. */
const TEXT_KEYS: (keyof ArtObject)[] = ['text', 'font', 'fontSize', 'bold', 'italic'];
const applyPatch = (o: ArtObject, patch: Partial<ArtObject>) => {
  const next = { ...o, ...patch };
  return o.type === 'text' && TEXT_KEYS.some((k) => k in patch) ? fitText(next) : next;
};

let dragSnapshot: Doc | undefined;

export const useStore = create<State>((set, get) => ({
  doc: { ...fromTemplate('lidBox', DEFAULT_PARAMS), objects: [] },
  past: [],
  future: [],
  source: 'template',
  template: 'lidBox',
  params: DEFAULT_PARAMS,
  bleed: 3,
  layers: { bleed: true, cut: true, crease: true, artwork: true },
  faceImages: {},
  fold: 0.6,
  tool: 'select',
  mode: 'art',
  lastWorkMode: 'art',
  faceColors: {},
  sel: EMPTY_SEL,
  dragging: false,
  grid: 1,
  snap: true,
  showDims: true,
  fitToken: 0,
  artSide: 'out',
  interior: EMPTY_SIDE,
  safeMargin: 3,
  fontsVersion: 0,
  minDpi: 300,

  commit: (patch, source = 'edited') =>
    set((s) => ({
      past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
      future: [],
      doc: { ...s.doc, ...patch },
      source,
    })),
  setGraphLive: (graph) => set((s) => ({ doc: { ...s.doc, graph } })),
  beginDrag: () => {
    dragSnapshot = get().doc;
    set({ dragging: true });
  },
  endDrag: (moved) => {
    const before = dragSnapshot;
    dragSnapshot = undefined;
    const cur = get().doc;
    const unchanged = before && before.graph === cur.graph && before.objects === cur.objects;
    if (!moved || !before || unchanged) return set({ dragging: false });
    // ao soltar, resolve cruzamentos/fusões criados pelo movimento
    set((s) => ({
      dragging: false,
      past: [...s.past, before].slice(-HISTORY_LIMIT),
      future: [],
      doc: { ...s.doc, graph: normalize(s.doc.graph, 0.01) },
      source: 'edited',
    }));
    const { sel, doc } = get();
    set({ sel: { ...sel, vertices: sel.vertices.filter((v) => doc.graph.v[v]), edges: sel.edges.filter((e) => doc.graph.e[e]) } });
  },
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return { doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], sel: EMPTY_SEL };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      return { doc: next, future: s.future.slice(1), past: [...s.past, s.doc], sel: EMPTY_SEL };
    }),

  setParam: (k, v) => {
    set((s) => ({ params: { ...s.params, [k]: v } }));
    get().regenerate();
  },
  regenerate: () => {
    const { template, params, commit } = get();
    const wasTemplate = get().source === 'template';
    commit(fromTemplate(template, params), 'template');
    set((s) => ({ sel: EMPTY_SEL, importInfo: undefined, fitToken: wasTemplate ? s.fitToken : s.fitToken + 1 }));
  },
  setTemplate: (template, params) => {
    const preset = PRESETS.find((p) => p.template === template);
    set((s) => ({ template, params: { ...s.params, ...(params ?? preset?.params) } }));
    get().regenerate();
    set((s) => ({ fitToken: s.fitToken + 1 }));
  },
  galleryOpen: false,
  setGalleryOpen: (galleryOpen) => set({ galleryOpen }),
  setBleed: (bleed) => set({ bleed }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setFullImage: (fullImage) =>
    set((s) => (s.artSide === 'in' ? { interior: { ...s.interior, fullImage } } : { fullImage })),
  setFaceImage: (id, url) =>
    set((s) => {
      const faceImages = { ...sideArt(s).faceImages };
      if (url) faceImages[id] = url;
      else delete faceImages[id];
      return s.artSide === 'in' ? { interior: { ...s.interior, faceImages } } : { faceImages };
    }),
  setFold: (fold) => set({ fold }),
  setTool: (tool) => set({ tool }),
  setMode: (mode) =>
    set((s) => ({
      mode,
      lastWorkMode: mode === 'verify' ? s.lastWorkMode : mode,
      // fora do modo Edição o molde fica travado: só faces podem ser selecionadas
      tool: 'select',
      sel: mode === 'structure' ? { ...EMPTY_SEL, face: s.sel.face } : { ...EMPTY_SEL, face: s.sel.face, object: s.sel.object },
    })),
  toggleVerify: () => {
    const { mode, lastWorkMode, setMode } = get();
    setMode(mode === 'verify' ? lastWorkMode : 'verify');
  },
  setBgColor: (bgColor) => set((s) => (s.artSide === 'in' ? { interior: { ...s.interior, bgColor } } : { bgColor })),
  setArtSide: (artSide) => set({ artSide, sel: EMPTY_SEL, cropEdit: undefined, tool: 'select' }),
  setSafeMargin: (safeMargin) => set({ safeMargin }),
  setMinDpi: (minDpi) => set({ minDpi }),

  addObject: (o0) => {
    // objetos criados com o Interior ativo pertencem ao verso
    const o = get().artSide === 'in' ? { ...o0, side: 'in' as const } : o0;
    get().commit({ objects: [...get().doc.objects, o] });
    set({ sel: { ...EMPTY_SEL, object: o.id }, tool: 'select' });
  },
  updateObject: (id, patch) =>
    get().commit({ objects: get().doc.objects.map((o) => (o.id === id ? applyPatch(o, patch) : o)) }),
  setObjectLive: (id, patch) =>
    set((s) => ({ doc: { ...s.doc, objects: s.doc.objects.map((o) => (o.id === id ? applyPatch(o, patch) : o)) } })),
  deleteObject: (id) => {
    get().commit({ objects: get().doc.objects.filter((o) => o.id !== id) });
    set({ sel: EMPTY_SEL });
  },
  duplicateObject: (id) => {
    const o = get().doc.objects.find((x) => x.id === id);
    if (!o) return;
    const copy = { ...o, id: newObjectId(), name: `${o.name} (cópia)`, x: o.x + 3, y: o.y + 3 };
    const list = [...get().doc.objects];
    list.splice(list.indexOf(o) + 1, 0, copy);
    get().commit({ objects: list });
    set({ sel: { ...EMPTY_SEL, object: copy.id } });
  },
  reorderObject: (id, to) => {
    const list = [...get().doc.objects];
    const i = list.findIndex((o) => o.id === id);
    if (i < 0) return;
    const [o] = list.splice(i, 1);
    const j = to === 'front' ? list.length : to === 'back' ? 0 : to === 'up' ? Math.min(list.length, i + 1) : Math.max(0, i - 1);
    list.splice(j, 0, o);
    get().commit({ objects: list });
  },
  setFaceColor: (id, c) =>
    set((s) => {
      const faceColors = { ...sideArt(s).faceColors };
      if (c) faceColors[id] = c;
      else delete faceColors[id];
      return s.artSide === 'in' ? { interior: { ...s.interior, faceColors } } : { faceColors };
    }),
  select: (sel) => set((s) => ({ sel: { ...EMPTY_SEL, ...sel }, cropEdit: sel.object && sel.object === s.cropEdit ? s.cropEdit : undefined })),
  setCropEdit: (cropEdit) => set({ cropEdit }),
  setGrid: (grid) => set({ grid }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setObjectsLive: (patches) =>
    set((s) => ({ doc: { ...s.doc, objects: s.doc.objects.map((o) => (patches[o.id] ? applyPatch(o, patches[o.id]) : o)) } })),
  deleteObjects: (ids) => {
    get().commit({ objects: get().doc.objects.filter((o) => !ids.includes(o.id)) });
    set({ sel: EMPTY_SEL });
  },
  setShowDims: (showDims) => set({ showDims }),
  reset: (presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    set({
      params: { ...DEFAULT_PARAMS, ...preset.params }, bleed: 3, fullImage: undefined, faceImages: {}, faceColors: {}, bgColor: undefined,
      interior: EMPTY_SIDE, artSide: 'out', sel: EMPTY_SEL, template: preset.template, galleryOpen: false, cropEdit: undefined,
    });
    get().regenerate();
    get().commit({ objects: [] }, 'template');
    set((s) => ({ fitToken: s.fitToken + 1 }));
  },
}));

/*
 * Estado "assentado": igual ao estado atual, mas parado durante um arrasto (pontos, alças, objetos).
 * Painéis, camadas e barras usam este; só o editor e o 3D acompanham o arrasto ao vivo.
 * Assim um arrasto não redesenha a interface inteira a cada movimento do mouse.
 */
let settled = useStore.getState();
useStore.subscribe((st) => { if (!st.dragging) settled = st; });
const getSettled = () => settled;
export function useSettledStore(): State {
  return useSyncExternalStore(useStore.subscribe, getSettled, getSettled);
}

// facilita depuração no console do navegador (somente em dev)
if (import.meta.env.DEV) (window as unknown as { cutpaper: typeof useStore }).cutpaper = useStore;
