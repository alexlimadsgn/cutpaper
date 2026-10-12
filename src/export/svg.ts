import { bleedOutline, bounds, faceArtRegions, materialOutline, polyToPath } from '../geometry/outline';
import { objectToSvg, type ArtObject } from '../art/objects';
import type { Dieline, Vec2 } from '../geometry/types';
import type { Layers } from '../store';

export const COLORS = { cut: '#E5262E', crease: '#1E6FE8', bleed: '#16A34A' };

export interface SvgInput {
  dieline: Dieline;
  bleed: number;
  layers: Layers;
  fullImage?: string;
  faceImages: Record<string, string>;
  faceColors?: Record<string, string>;
  bgColor?: string;
  objects?: ArtObject[];
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
export interface ArtInput {
  fullImage?: string;
  faceImages: Record<string, string>;
  faceColors?: Record<string, string>;
  bgColor?: string;
  /** Objetos de arte; o editor os desenha à parte (interativos) e não os passa aqui. */
  objects?: ArtObject[];
  /** Sangria (mm): a arte das faces avança por ela nos lados de corte. */
  bleed?: number;
  /** Desenha no referencial do verso (X espelhado), para a arte do interior. */
  mirror?: boolean;
}

const mirrorPoly = (p: Vec2[]): Vec2[] => p.map(([x, y]) => [-x, y]);
/** Molde visto pelo verso: todas as coordenadas X espelhadas (x → −x). */
export const mirrorDieline = (d: Dieline): Dieline => ({
  ...d,
  faces: d.faces.map((f) => ({ ...f, poly: mirrorPoly(f.poly), holes: f.holes.map(mirrorPoly), hinge: f.hinge && [[-f.hinge[0][0], f.hinge[0][1]], [-f.hinge[1][0], f.hinge[1][1]]] })),
  cuts: d.cuts.map(mirrorPoly),
  creases: d.creases.map(mirrorPoly),
});
export const mirrorPolys = (ps: Vec2[][]) => ps.map(mirrorPoly);

/** Id do clipPath de uma face (todas as faces recebem um, para recortar imagens e objetos). */
export const faceClipId = (prefix: string, d: Dieline, faceId: string) => `${prefix}-f${d.faces.findIndex((f) => f.id === faceId)}`;

/** Recorte de um objeto: a face escolhida ou o molde inteiro (sangria). */
export const objectClip = (prefix: string, d: Dieline, o: ArtObject) =>
  o.clip && d.faces.some((f) => f.id === o.clip) ? faceClipId(prefix, d, o.clip) : `${prefix}-bleed`;

export function buildArt(dieline0: Dieline, bleedPolys0: Vec2[][], art: ArtInput, prefix = 'cp') {
  const { fullImage, faceImages, faceColors = {}, bgColor, objects = [], bleed = 0, mirror = false } = art;
  const dieline = mirror ? mirrorDieline(dieline0) : dieline0;
  const bleedPolys = mirror ? mirrorPolys(bleedPolys0) : bleedPolys0;
  const regions = faceArtRegions(dieline, bleedPolys, bleed);
  const defs: string[] = [`<clipPath id="${prefix}-bleed"><path clip-rule="evenodd" d="${polyToPath(bleedPolys)}"/></clipPath>`];
  regions.forEach((r, i) => defs.push(`<clipPath id="${prefix}-f${i}"><path clip-rule="evenodd" d="${polyToPath(r)}"/></clipPath>`));
  const body: string[] = [];
  // ordem de pintura: cor de fundo → imagem inteira → cor da face → imagem da face
  if (bgColor) body.push(`<path fill-rule="evenodd" fill="${esc(bgColor)}" d="${polyToPath(bleedPolys)}"/>`);
  if (fullImage) {
    const fb = bounds(bleedPolys);
    body.push(
      `<g clip-path="url(#${prefix}-bleed)"><image href="${esc(fullImage)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
    );
  }
  dieline.faces.forEach((f, i) => {
    const color = faceColors[f.id];
    if (color) body.push(`<path fill-rule="evenodd" fill="${esc(color)}" d="${polyToPath(regions[i])}"/>`);
  });
  dieline.faces.forEach((f, i) => {
    const img = faceImages[f.id];
    if (!img) return;
    const fb = bounds(regions[i]);
    body.push(
      `<g clip-path="url(#${prefix}-f${i})"><image href="${esc(img)}" x="${fb.minX}" y="${fb.minY}" width="${fb.w}" height="${fb.h}" preserveAspectRatio="xMidYMid slice"/></g>`,
    );
  });
  for (const o of objects) {
    const markup = objectToSvg(o);
    if (markup) body.push(`<g clip-path="url(#${objectClip(prefix, dieline, o)})">${markup}</g>`);
  }
  return { defs: defs.join(''), body: body.join('') };
}

/**
 * Gera o SVG 1:1 em milímetros com camadas nomeadas
 * (ARTE, SANGRIA, CORTE, VINCO) — compatível com Illustrator/Inkscape/Silhouette.
 */
export function buildSvg({ dieline, bleed, layers, fullImage, faceImages, faceColors, bgColor, objects, background }: SvgInput): string {
  const material = materialOutline(dieline);
  const bl = bleedOutline(material, bleed);
  const vb = viewBoxOf(bl.length ? bl : material);
  const art = buildArt(dieline, bl, { fullImage, faceImages, faceColors, bgColor, objects: objects?.filter((o) => o.side !== 'in'), bleed }, 'x');
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

export interface BackSvgInput {
  dieline: Dieline;
  bleed: number;
  art: { bgColor?: string; fullImage?: string; faceColors: Record<string, string>; faceImages: Record<string, string> };
  objects: ArtObject[];
  /** Inclui linhas-guia de corte/vinco (espelhadas) para conferência. */
  guides?: boolean;
  background?: string;
}

/**
 * SVG do VERSO (interior), 1:1 em mm, como a folha é vista ao virá-la (molde espelhado).
 * Para impressão frente e verso virando pela borda longa.
 */
export function buildBackSvg({ dieline, bleed, art, objects, guides = true, background }: BackSvgInput): string {
  const material = materialOutline(dieline);
  const bl = bleedOutline(material, bleed);
  const mbl = mirrorPolys(bl.length ? bl : material);
  const vb = viewBoxOf(mbl);
  const a = buildArt(dieline, bl, { ...art, objects: objects.filter((o) => o.side === 'in'), bleed, mirror: true }, 'xb');
  const md = mirrorDieline(dieline);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${vb[2]}mm" height="${vb[3]}mm" viewBox="${vb.join(' ')}">`,
    `<defs>${a.defs}</defs>`,
  ];
  if (background) out.push(`<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>`);
  out.push(`<g id="ARTE_VERSO" inkscape:groupmode="layer" inkscape:label="ARTE VERSO">${a.body}</g>`);
  if (guides) {
    out.push(`<g id="GUIA_CORTE" inkscape:groupmode="layer" inkscape:label="GUIA CORTE (não imprimir)" fill="none" stroke="${COLORS.cut}" stroke-width="0.25">${md.cuts.map((p) => `<path d="${polyline(p)}"/>`).join('')}</g>`);
    out.push(`<g id="GUIA_VINCO" inkscape:groupmode="layer" inkscape:label="GUIA VINCO (não imprimir)" fill="none" stroke="${COLORS.crease}" stroke-width="0.25" stroke-dasharray="3 1.5">${md.creases.map((p) => `<path d="${polyline(p)}"/>`).join('')}</g>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
