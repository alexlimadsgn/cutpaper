import { bleedOutline, bounds, materialOutline, polyToPath } from '../geometry/outline';
import type { Dieline, Vec2 } from '../geometry/types';
import type { Layers } from '../store';

export const COLORS = { cut: '#E5262E', crease: '#1E6FE8', bleed: '#16A34A' };

export interface SvgInput {
  dieline: Dieline;
  bleed: number;
  layers: Layers;
  fullImage?: string;
  faceImages: Record<string, string>;
  /** Fundo atrás da arte (usado na textura 3D). */
  background?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const polyline = (pts: Vec2[]) => 'M' + pts.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join(' L');

/** viewBox [x, y, w, h] em mm com uma pequena margem em volta da sangria. */
export function viewBoxOf(polys: Vec2[][], pad = 2) {
  const b = bounds(polys);
  return [b.minX - pad, b.minY - pad, b.w + pad * 2, b.h + pad * 2].map((n) => +n.toFixed(3));
}

/**
 * Camada de arte (defs + grupo), compartilhada pelo editor, pela textura 3D e pelo export.
 * `prefix` evita colisão de ids de clipPath quando há mais de um SVG na página.
 */
export function buildArt(dieline: Dieline, bleedPolys: Vec2[][], fullImage: string | undefined, faceImages: Record<string, string>, prefix = 'cp') {
  const defs: string[] = [`<clipPath id="${prefix}-bleed"><path clip-rule="evenodd" d="${polyToPath(bleedPolys)}"/></clipPath>`];
  const body: string[] = [];
  if (fullImage) {
    const fb = bounds(bleedPolys);
    body.push(
      `<g clip-path="url(#${prefix}-bleed)"><image href="${esc(fullImage)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
    );
  }
  dieline.faces.forEach((f, i) => {
    const img = faceImages[f.id];
    if (!img) return;
    const fb = bounds([f.poly]);
    defs.push(`<clipPath id="${prefix}-f${i}"><path clip-rule="evenodd" d="${polyToPath([f.poly, ...f.holes])}"/></clipPath>`);
    body.push(
      `<g clip-path="url(#${prefix}-f${i})"><image href="${esc(img)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
    );
  });
  return { defs: defs.join(''), body: body.join('') };
}

/**
 * Gera o SVG 1:1 em milímetros com camadas nomeadas
 * (ARTE, SANGRIA, CORTE, VINCO) — compatível com Illustrator/Inkscape/Silhouette.
 */
export function buildSvg({ dieline, bleed, layers, fullImage, faceImages, background }: SvgInput): string {
  const material = materialOutline(dieline);
  const bl = bleedOutline(material, bleed);
  const vb = viewBoxOf(bl.length ? bl : material);
  const art = buildArt(dieline, bl, fullImage, faceImages, 'x');
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${vb[2]}mm" height="${vb[3]}mm" viewBox="${vb.join(' ')}">`,
  );
  out.push(`<defs>${art.defs}</defs>`);
  if (background) out.push(`<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>`);
  if (layers.artwork) out.push(`<g id="ARTE" inkscape:groupmode="layer" inkscape:label="ARTE">${art.body}</g>`);
  if (layers.bleed && bleed > 0)
    out.push(
      `<g id="SANGRIA" inkscape:groupmode="layer" inkscape:label="SANGRIA"><path d="${polyToPath(bl)}" fill="none" stroke="${COLORS.bleed}" stroke-width="0.25" stroke-dasharray="1 1"/></g>`,
    );
  if (layers.cut)
    out.push(
      `<g id="CORTE" inkscape:groupmode="layer" inkscape:label="CORTE" fill="none" stroke="${COLORS.cut}" stroke-width="0.25" stroke-linejoin="round">${dieline.cuts.map((p) => `<path d="${polyline(p)}"/>`).join('')}</g>`,
    );
  if (layers.crease)
    out.push(
      `<g id="VINCO" inkscape:groupmode="layer" inkscape:label="VINCO" fill="none" stroke="${COLORS.crease}" stroke-width="0.25" stroke-dasharray="3 1.5">${dieline.creases.map((p) => `<path d="${polyline(p)}"/>`).join('')}</g>`,
    );
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
