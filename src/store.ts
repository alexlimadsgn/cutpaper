import { create } from 'zustand';
import type { BoxParams } from './geometry/types';
import type { TemplateId } from './geometry/templates';

export interface Layers {
  bleed: boolean;
  cut: boolean;
  crease: boolean;
  artwork: boolean;
}

interface State {
  template: TemplateId;
  params: BoxParams;
  bleed: number;
  layers: Layers;
  fullImage?: string;
  faceImages: Record<string, string>;
  selectedFace?: string;
  fold: number; // 0..1
  setParam: <K extends keyof BoxParams>(k: K, v: BoxParams[K]) => void;
  setBleed: (v: number) => void;
  toggleLayer: (k: keyof Layers) => void;
  setFullImage: (url?: string) => void;
  setFaceImage: (id: string, url?: string) => void;
  selectFace: (id?: string) => void;
  setFold: (v: number) => void;
  reset: () => void;
}

const DEFAULT_PARAMS: BoxParams = { width: 100, depth: 80, height: 40, tuck: 15, glue: 20, thickness: 0.5 };

export const useStore = create<State>((set) => ({
  template: 'lidBox',
  params: DEFAULT_PARAMS,
  bleed: 3,
  layers: { bleed: true, cut: true, crease: true, artwork: true },
  faceImages: {},
  fold: 0.6,
  setParam: (k, v) => set((s) => ({ params: { ...s.params, [k]: v } })),
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
  selectFace: (selectedFace) => set({ selectedFace }),
  setFold: (fold) => set({ fold }),
  reset: () => set({ params: DEFAULT_PARAMS, bleed: 3, fullImage: undefined, faceImages: {}, selectedFace: undefined }),
}));

// facilita depuração no console do navegador (somente em dev)
if (import.meta.env.DEV) (window as unknown as { cutpaper: typeof useStore }).cutpaper = useStore;
