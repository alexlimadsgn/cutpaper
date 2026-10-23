import { useMemo } from 'react';
import { useSettledStore } from '../store';
import { useSettledDieline } from '../useDieline';
import { runChecks } from './checks';
import { useImageSizes } from './useImageSizes';

/** Problemas de montagem e pré-impressão do projeto atual. */
export function useChecks() {
  const { dieline, conflicts } = useSettledDieline();
  const s = useSettledStore();
  const { graph } = s.doc;
  const objects = useMemo(() => s.doc.objects.filter((o) => o.side !== 'in'), [s.doc.objects]);
  const srcs = [
    ...objects.filter((o) => o.type === 'image' && o.src).map((o) => o.src!),
    ...Object.values(s.faceImages),
    ...(s.fullImage ? [s.fullImage] : []),
  ];
  const sizes = useImageSizes(srcs);
  const sizeKey = srcs.map((x) => sizes.get(x)?.w ?? 0).join(',');
  return useMemo(
    () => runChecks({
      dieline, graph, conflicts, objects, sizes,
      faceColors: s.faceColors, faceImages: s.faceImages, fullImage: s.fullImage, bgColor: s.bgColor,
      margin: s.safeMargin, minDpi: s.minDpi,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dieline, graph, conflicts, objects, sizeKey, s.faceColors, s.faceImages, s.fullImage, s.bgColor, s.safeMargin, s.minDpi],
  );
}
