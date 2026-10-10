import opentype from 'opentype.js';

/**
 * Fontes disponíveis. São fontes web (Fontsource/Google Fonts) para que o texto
 * possa ser convertido em contornos: assim ele sai igual no 2D, no 3D, no SVG e no PDF,
 * mesmo em computadores sem a fonte instalada.
 */
export const FONTS: { name: string; id: string }[] = [
  { name: 'Poppins', id: 'poppins' },
  { name: 'Montserrat', id: 'montserrat' },
  { name: 'Nunito', id: 'nunito' },
  { name: 'Fredoka', id: 'fredoka' },
  { name: 'Baloo 2', id: 'baloo-2' },
  { name: 'Playfair Display', id: 'playfair-display' },
  { name: 'Roboto Slab', id: 'roboto-slab' },
  { name: 'Bebas Neue', id: 'bebas-neue' },
  { name: 'Lobster', id: 'lobster' },
  { name: 'Pacifico', id: 'pacifico' },
  { name: 'Dancing Script', id: 'dancing-script' },
  { name: 'Caveat', id: 'caveat' },
];

export interface LoadedFont {
  font: opentype.Font;
  /** Itálico/negrito simulados quando a família não tem o estilo. */
  fakeItalic: boolean;
  fakeBold: boolean;
}

const key = (family: string, bold?: boolean, italic?: boolean) => `${family}|${bold ? 700 : 400}|${italic ? 'i' : 'n'}`;
const cache = new Map<string, LoadedFont | null>();
const loading = new Map<string, Promise<LoadedFont | null>>();
const listeners = new Set<() => void>();

export const onFontLoaded = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

const fetchFont = async (id: string, weight: number, style: 'normal' | 'italic') => {
  const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-${style}.woff`);
  if (!res.ok) throw new Error(`${res.status}`);
  return opentype.parse(await res.arrayBuffer());
};

/** Fonte já carregada (síncrono); undefined enquanto não carregou. */
export function getFont(family = 'Poppins', bold?: boolean, italic?: boolean): LoadedFont | undefined {
  return cache.get(key(family, bold, italic)) ?? undefined;
}

/** Carrega a fonte, caindo para o estilo/peso disponível mais próximo. */
export function loadFont(family = 'Poppins', bold?: boolean, italic?: boolean): Promise<LoadedFont | null> {
  const k = key(family, bold, italic);
  if (cache.has(k)) return Promise.resolve(cache.get(k)!);
  if (loading.has(k)) return loading.get(k)!;
  const id = FONTS.find((f) => f.name === family)?.id;
  const p = (async () => {
    if (!id) return null;
    const tries: [number, 'normal' | 'italic', boolean, boolean][] = [
      [bold ? 700 : 400, italic ? 'italic' : 'normal', false, false],
      ...(italic ? [[bold ? 700 : 400, 'normal', true, false] as [number, 'normal', boolean, boolean]] : []),
      ...(bold ? [[400, italic ? 'italic' : 'normal', false, true] as [number, 'normal' | 'italic', boolean, boolean]] : []),
      [400, 'normal', !!italic, !!bold],
    ];
    for (const [w, st, fi, fb] of tries) {
      try {
        return { font: await fetchFont(id, w, st), fakeItalic: fi, fakeBold: fb };
      } catch { /* tenta a próxima variação */ }
    }
    return null;
  })().then((r) => {
    cache.set(k, r);
    loading.delete(k);
    listeners.forEach((fn) => fn());
    return r;
  });
  loading.set(k, p);
  return p;
}

/** Garante que todas as fontes usadas estão carregadas (antes de exportar). */
export async function ensureFonts(objs: { type: string; font?: string; bold?: boolean; italic?: boolean }[]) {
  await Promise.all(objs.filter((o) => o.type === 'text').map((o) => loadFont(o.font, o.bold, o.italic)));
}
