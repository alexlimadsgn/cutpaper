import { useEffect, useState } from 'react';

export type ImageSizes = Map<string, { w: number; h: number }>;

const cache: ImageSizes = new Map();
const pending = new Set<string>();

/** Dimensões em pixels das imagens (carregadas uma vez e guardadas em cache). */
export function useImageSizes(srcs: string[]): ImageSizes {
  const [, bump] = useState(0);
  const key = srcs.join('|');
  useEffect(() => {
    for (const src of srcs) {
      if (cache.has(src) || pending.has(src)) continue;
      pending.add(src);
      const img = new Image();
      img.onload = () => {
        cache.set(src, { w: img.naturalWidth, h: img.naturalHeight });
        pending.delete(src);
        bump((n) => n + 1);
      };
      img.onerror = () => pending.delete(src);
      img.src = src;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cache;
}
