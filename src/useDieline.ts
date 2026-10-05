import { useMemo } from 'react';
import { TEMPLATES } from './geometry/templates';
import { bleedOutline, cutOutline } from './geometry/outline';
import { viewBoxOf } from './export/svg';
import { useStore } from './store';

export function useDieline() {
  const template = useStore((s) => s.template);
  const params = useStore((s) => s.params);
  const bleed = useStore((s) => s.bleed);
  return useMemo(() => {
    const dieline = TEMPLATES[template].build(params);
    const cut = cutOutline(dieline);
    const bl = bleedOutline(cut, bleed);
    return { dieline, cut, bleedPolys: bl, viewBox: viewBoxOf(bl) };
  }, [template, params, bleed]);
}
