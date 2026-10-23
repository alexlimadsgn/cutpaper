import { useMemo } from 'react';
import { deriveDieline } from './geometry/faces';
import { findConflicts } from './geometry/fold';
import { bleedOutline, materialOutline } from './geometry/outline';
import { viewBoxOf } from './export/svg';
import { useStore } from './store';

/** Molde derivado do documento atual (faces, dobras, sangria, viewBox). */
export function useDieline() {
  // só o molde importa (mover arte não recalcula faces, sangria e montagem)
  const graph = useStore((s) => s.doc.graph);
  const names = useStore((s) => s.doc.names);
  const root = useStore((s) => s.doc.root);
  const bleed = useStore((s) => s.bleed);
  return useMemo(() => {
    const dieline = deriveDieline(graph, names, root);
    const material = materialOutline(dieline);
    const bleedPolys = bleedOutline(material, bleed);
    const conflicts = findConflicts(dieline.faces);
    return { dieline, material, bleedPolys, conflicts, viewBox: viewBoxOf(bleedPolys.length ? bleedPolys : material) };
  }, [graph, names, root, bleed]);
}
