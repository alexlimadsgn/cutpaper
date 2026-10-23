import { useMemo } from 'react';
import { deriveDieline } from './geometry/faces';
import { findConflicts } from './geometry/fold';
import { bleedOutline, materialOutline } from './geometry/outline';
import { viewBoxOf } from './export/svg';
import { useSettledStore, useStore } from './store';
import type { Graph } from './geometry/graph';

type Derived = ReturnType<typeof derive>;
function derive(graph: Graph, names: Record<string, string>, root: string | undefined, bleed: number, live: boolean) {
  const dieline = deriveDieline(graph, names, root);
  const material = materialOutline(dieline);
  const bleedPolys = bleedOutline(material, bleed);
  // durante o arrasto a checagem de conflitos (hachuras) espera o soltar
  const conflicts = live ? [] : findConflicts(dieline.faces);
  return { dieline, material, bleedPolys, conflicts, viewBox: viewBoxOf(bleedPolys.length ? bleedPolys : material) };
}

// um único cálculo compartilhado por todos os componentes (antes cada um refazia o seu)
let last: { graph: Graph; names: Record<string, string>; root?: string; bleed: number; live: boolean; out: Derived } | undefined;
function shared(graph: Graph, names: Record<string, string>, root: string | undefined, bleed: number, live = false): Derived {
  if (last && last.graph === graph && last.names === names && last.root === root && last.bleed === bleed && last.live === live) return last.out;
  last = { graph, names, root, bleed, live, out: derive(graph, names, root, bleed, live) };
  return last.out;
}

/** Molde derivado do documento atual (faces, dobras, sangria, viewBox), ao vivo (editor e 3D). */
export function useDieline() {
  // só o molde importa (mover arte não recalcula faces, sangria e montagem)
  const graph = useStore((s) => s.doc.graph);
  const names = useStore((s) => s.doc.names);
  const root = useStore((s) => s.doc.root);
  const bleed = useStore((s) => s.bleed);
  const dragging = useStore((s) => s.dragging);
  return useMemo(() => shared(graph, names, root, bleed, dragging), [graph, names, root, bleed, dragging]);
}

/** O mesmo molde, mas parado durante arrastos (painéis e barras). */
export function useSettledDieline() {
  const st = useSettledStore();
  const { graph, names, root } = st.doc;
  const bleed = st.bleed;
  return useMemo(() => shared(graph, names, root, bleed), [graph, names, root, bleed]);
}
