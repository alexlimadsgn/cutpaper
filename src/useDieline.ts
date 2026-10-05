import { useMemo } from 'react';
import { deriveDieline } from './geometry/faces';
import { bleedOutline, materialOutline } from './geometry/outline';
import { viewBoxOf } from './export/svg';
import { useStore } from './store';

/** Molde derivado do documento atual (faces, dobras, sangria, viewBox). */
export function useDieline() {
  const doc = useStore((s) => s.doc);
  const bleed = useStore((s) => s.bleed);
  return useMemo(() => {
    const dieline = deriveDieline(doc.graph, doc.names, doc.root);
    const material = materialOutline(dieline);
    const bleedPolys = bleedOutline(material, bleed);
    return { dieline, material, bleedPolys, viewBox: viewBoxOf(bleedPolys.length ? bleedPolys : material) };
  }, [doc, bleed]);
}
