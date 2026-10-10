import { create } from 'zustand';
import { normalize, type Graph } from './geometry/graph';
import { TEMPLATES, type TemplateId } from './geometry/templates';
import type { BoxParams } from './geometry/types';

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
}

export type Tool = 'select' | 'cut' | 'crease';

/** Modo de trabalho: desenhar o molde, decorar, ou conferir a montagem. */
export type Mode = 'structure' | 'art' | 'verify';

export interface Selection {
  vertices: string[];
  edges: string[];
  face?: string;
}

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
  /** Cor de fundo do molde inteiro (até a sangria). */
  bgColor?: string;
  /** Cor de fundo por face. */
  faceColors: Record<string, string>;
  sel: Selection;
  /** Arrastando vértices: atualizações ao vivo sem histórico. */
  dragging: boolean;
  /** Passo da grade de snap em mm (0 = desligado). */
  grid: number;
  /** Resumo da última importação de SVG. */
  importInfo?: string;
  /** Incrementado quando o molde é substituído (o editor reenquadra a vista). */
  fitToken: number;

  /** Aplica uma alteração ao documento e grava no histórico. */
  commit: (doc: Partial<Doc>, source?: State['source']) => void;
  setGraphLive: (graph: Graph) => void;
  beginDrag: () => void;
  endDrag: (moved: boolean) => void;
  undo: () => void;
  redo: () => void;

  setParam: <K extends keyof BoxParams>(k: K, v: BoxParams[K]) => void;
  regenerate: () => void;
  setBleed: (v: number) => void;
  toggleLayer: (k: keyof Layers) => void;
  setFullImage: (url?: string) => void;
  setFaceImage: (id: string, url?: string) => void;
  setFold: (v: number) => void;
  setTool: (t: Tool) => void;
  setMode: (m: Mode) => void;
  setBgColor: (c?: string) => void;
  setFaceColor: (id: string, c?: string) => void;
  select: (sel: Partial<Selection>) => void;
  setGrid: (v: number) => void;
  reset: () => void;
}

const DEFAULT_PARAMS: BoxParams = { width: 100, depth: 80, height: 40, tuck: 15, glue: 20, thickness: 0.5 };

const fromTemplate = (id: TemplateId, p: BoxParams): Doc => {
  const { graph, names, root } = TEMPLATES[id].build(p);
  return { graph, names, root };
};

let dragSnapshot: Doc | undefined;

export const useStore = create<State>((set, get) => ({
  doc: fromTemplate('lidBox', DEFAULT_PARAMS),
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
  mode: 'structure',
  faceColors: {},
  sel: EMPTY_SEL,
  dragging: false,
  grid: 1,
  fitToken: 0,

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
    if (!moved || !before) return set({ dragging: false });
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
  setBleed: (bleed) => set({ bleed }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setFullImage: (fullImage) => set({ fullImage }),
  setFaceImage: (id, url) =>
    set((s) => {
      const faceImages = { ...s.faceImages };
      if (url) faceImages[id] = url;
      else delete faceImages[id];
      return { faceImages };
    }),
  setFold: (fold) => set({ fold }),
  setTool: (tool) => set({ tool }),
  setMode: (mode) =>
    set((s) => ({
      mode,
      // fora do modo Estrutura o molde fica travado: só faces podem ser selecionadas
      tool: mode === 'structure' ? s.tool : 'select',
      sel: mode === 'structure' ? s.sel : { ...EMPTY_SEL, face: s.sel.face },
    })),
  setBgColor: (bgColor) => set({ bgColor }),
  setFaceColor: (id, c) =>
    set((s) => {
      const faceColors = { ...s.faceColors };
      if (c) faceColors[id] = c;
      else delete faceColors[id];
      return { faceColors };
    }),
  select: (sel) => set({ sel: { ...EMPTY_SEL, ...sel } }),
  setGrid: (grid) => set({ grid }),
  reset: () => {
    set({ params: DEFAULT_PARAMS, bleed: 3, fullImage: undefined, faceImages: {}, faceColors: {}, bgColor: undefined, sel: EMPTY_SEL, template: 'lidBox' });
    get().regenerate();
  },
}));

// facilita depuração no console do navegador (somente em dev)
if (import.meta.env.DEV) (window as unknown as { cutpaper: typeof useStore }).cutpaper = useStore;
