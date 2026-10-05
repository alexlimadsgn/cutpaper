import { bleedOutline, bounds, cutOutline, polyToPath } from '../geometry/outline';
import type { Dieline } from '../geometry/types';
import type { Layers } from '../store';

export const COLORS = { cut: '#E5262E', crease: '#1E6FE8', bleed: '#16A34A' };

export interface SvgInput {
  dieline: Dieline;
  bleed: number;
  layers: Layers;
  fullImage?: string;
  faceImages: Record<string, string>;
  /** Fundo branco atrás da arte (usado na textura 3D). */
  background?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** viewBox [x, y, w, h] em mm com uma pequena margem em volta da sangria. */
export function viewBoxOf(bleedPolys: ReturnType<typeof bleedOutline>, pad = 2) {
  const b = bounds(bleedPolys);
  return [b.minX - pad, b.minY - pad, b.w + pad * 2, b.h + pad * 2].map((n) => +n.toFixed(3));
}

/**
 * Gera o SVG 1:1 em milímetros com camadas nomeadas
 * (ARTE, SANGRIA, CORTE, VINCO) — compatível com Illustrator/Inkscape/Silhouette.
 */
export function buildSvg({ dieline, bleed, layers, fullImage, faceImages, background }: SvgInput): string {
  const cut = cutOutline(dieline);
  const bl = bleedOutline(cut, bleed);
  const vb = viewBoxOf(bl);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${vb[2]}mm" height="${vb[3]}mm" viewBox="${vb.join(' ')}">`,
  );
  out.push('<defs>');
  out.push(`<clipPath id="clip-bleed"><path d="${polyToPath(bl)}"/></clipPath>`);
  for (const f of dieline.faces)
    if (faceImages[f.id]) {
      out.push(`<clipPath id="clip-${f.id}"><path d="${polyToPath([f.poly])}"/></clipPath>`);
    }
  out.push('</defs>');

  if (background) out.push(`<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>`);

  if (layers.artwork) {
    out.push('<g id="ARTE" inkscape:groupmode="layer" inkscape:label="ARTE">');
    if (fullImage) {
      const fb = bounds(bl);
      out.push(
        `<g clip-path="url(#clip-bleed)"><image href="${esc(fullImage)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
      );
    }
    for (const f of dieline.faces) {
      const img = faceImages[f.id];
      if (!img) continue;
      const fb = bounds([f.poly]);
      out.push(
        `<g clip-path="url(#clip-${f.id})"><image href="${esc(img)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
      );
    }
    out.push('</g>');
  }
  if (layers.bleed && bleed > 0)
    out.push(
      `<g id="SANGRIA" inkscape:groupmode="layer" inkscape:label="SANGRIA"><path d="${polyToPath(bl)}" fill="none" stroke="${COLORS.bleed}" stroke-width="0.25" stroke-dasharray="1 1"/></g>`,
    );
  if (layers.cut)
    out.push(
      `<g id="CORTE" inkscape:groupmode="layer" inkscape:label="CORTE"><path d="${polyToPath(cut)}" fill="none" stroke="${COLORS.cut}" stroke-width="0.25"/></g>`,
    );
  if (layers.crease) {
    out.push(`<g id="VINCO" inkscape:groupmode="layer" inkscape:label="VINCO" fill="none" stroke="${COLORS.crease}" stroke-width="0.25" stroke-dasharray="3 1.5">`);
    for (const c of dieline.creases) out.push(`<line x1="${c.a[0]}" y1="${c.a[1]}" x2="${c.b[0]}" y2="${c.b[1]}"/>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}

export function download(name: string, content: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
