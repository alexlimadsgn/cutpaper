import type { Vec2 } from '../geometry/types';
import { getFont } from './fonts';

export type ArtType = 'rect' | 'ellipse' | 'text' | 'image';

/**
 * Objeto de arte posicionado sobre a planificação (mm, Y para baixo).
 * (x, y, w, h) é a caixa sem rotação; a rotação é em torno do centro.
 */
export interface ArtObject {
  id: string;
  type: ArtType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // graus
  opacity: number; // 0..1
  fill?: string;
  stroke?: string;
  strokeWidth: number; // mm
  radius: number; // cantos do retângulo (mm)
  /** Face onde o objeto é recortado; undefined = molde inteiro (até a sangria). */
  clip?: string;
  // texto
  text?: string;
  font?: string;
  fontSize?: number; // pt
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  // imagem
  src?: string;
  hidden?: boolean;
}

export const PT_MM = 25.4 / 72;
export const LINE_HEIGHT = 1.2;

let counter = 0;
export const newObjectId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

const NAMES: Record<ArtType, string> = { rect: 'Retângulo', ellipse: 'Elipse', text: 'Texto', image: 'Imagem' };

export function createObject(type: ArtType, box: { x: number; y: number; w: number; h: number }, extra: Partial<ArtObject> = {}): ArtObject {
  const base: ArtObject = {
    id: newObjectId(),
    type,
    name: NAMES[type],
    ...box,
    rotation: 0,
    opacity: 1,
    strokeWidth: 0.5,
    radius: 0,
    fill: type === 'text' ? '#1f2937' : type === 'image' ? undefined : '#f59e0b',
    ...(type === 'text' ? { text: 'Texto', font: 'Poppins', fontSize: 18, bold: true, align: 'center' as const } : {}),
    ...extra,
  };
  return type === 'text' ? fitText(base) : base;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Recalcula largura/altura da caixa de texto mantendo o centro. */
export function fitText(o: ArtObject): ArtObject {
  const size = (o.fontSize ?? 12) * PT_MM;
  const lines = (o.text ?? '').split('\n');
  const lf = getFont(o.font, o.bold, o.italic);
  if (!lf) measureCtx ??= document.createElement('canvas').getContext('2d');
  let w = 0;
  if (lf) {
    // medida exata pela própria fonte
    for (const l of lines) w = Math.max(w, lf.font.getAdvanceWidth(l || ' ', size));
    if (lf.fakeItalic) w += size * 0.15;
  } else if (measureCtx) {
    // mede em 100 px e escala para mm
    measureCtx.font = `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} 100px "${o.font ?? 'Poppins'}"`;
    for (const l of lines) w = Math.max(w, measureCtx.measureText(l || ' ').width / 100 * size);
  } else w = Math.max(...lines.map((l) => l.length)) * size * 0.55;
  const h = lines.length * size * LINE_HEIGHT;
  w = Math.max(w, size * 0.5);
  // mantém o centro (um texto novo com w = h = 0 fica centrado em x, y)
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  return { ...o, w, h, x: cx - w / 2, y: cy - h / 2 };
}

export const center = (o: ArtObject): Vec2 => [o.x + o.w / 2, o.y + o.h / 2];

/** Converte um ponto do mundo para o referencial local (sem rotação, origem no centro). */
export function toLocal(o: ArtObject, p: Vec2): Vec2 {
  const [cx, cy] = center(o);
  const a = (-o.rotation * Math.PI) / 180;
  const dx = p[0] - cx, dy = p[1] - cy;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

export function toWorld(o: ArtObject, l: Vec2): Vec2 {
  const [cx, cy] = center(o);
  const a = (o.rotation * Math.PI) / 180;
  return [cx + l[0] * Math.cos(a) - l[1] * Math.sin(a), cy + l[0] * Math.sin(a) + l[1] * Math.cos(a)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(3);

/** Markup SVG do objeto (sem recorte). Usado no export e na textura 3D. */
export function objectToSvg(o: ArtObject): string {
  if (o.hidden) return '';
  const [cx, cy] = center(o);
  const tr = o.rotation ? ` transform="rotate(${n(o.rotation)} ${n(cx)} ${n(cy)})"` : '';
  const paint = `fill="${o.fill ? esc(o.fill) : 'none'}"${o.stroke ? ` stroke="${esc(o.stroke)}" stroke-width="${n(o.strokeWidth)}"` : ''}`;
  const op = o.opacity < 1 ? ` opacity="${n(o.opacity)}"` : '';
  switch (o.type) {
    case 'rect':
      return `<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" rx="${n(o.radius)}" ${paint}${op}${tr}/>`;
    case 'ellipse':
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(o.w / 2)}" ry="${n(o.h / 2)}" ${paint}${op}${tr}/>`;
    case 'image':
      return o.src
        ? `<image href="${esc(o.src)}" x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" preserveAspectRatio="none"${op}${tr}/>`
        : '';
    case 'text': {
      const t = textLayout(o);
      const lf = getFont(o.font, o.bold, o.italic);
      if (lf) {
        // texto em contornos: sai idêntico em qualquer lugar, sem depender da fonte instalada
        const { font, fakeItalic, fakeBold } = lf;
        const em = font.unitsPerEm;
        const asc = (font.ascender / em) * t.size, desc = (-font.descender / em) * t.size;
        const paths = t.lines.map((l, i) => {
          const adv = font.getAdvanceWidth(l, t.size);
          const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - adv : t.x - adv / 2;
          const base = o.y + i * t.lh + (t.lh - asc - desc) / 2 + asc;
          const d = font.getPath(l, x0, base, t.size).toPathData(3);
          const skew = fakeItalic ? ` transform="translate(0 ${n(base)}) skewX(-12) translate(0 ${n(-base)})"` : '';
          return d ? `<path d="${d}"${skew}/>` : '';
        }).join('');
        const boldStroke = fakeBold && o.fill ? ` stroke="${esc(o.fill)}" stroke-width="${n(t.size * 0.035)}" stroke-linejoin="round"` : '';
        return `<g fill="${o.fill ? esc(o.fill) : 'none'}"${o.stroke ? ` stroke="${esc(o.stroke)}" stroke-width="${n(o.strokeWidth)}"` : boldStroke}${op}${tr}>${paths}</g>`;
      }
      const spans = t.lines.map((l, i) => `<tspan x="${n(t.x)}" y="${n(t.y0 + i * t.lh)}">${esc(l) || ' '}</tspan>`).join('');
      return `<text font-family="${esc(o.font ?? 'Poppins')}" font-size="${n(t.size)}" style="font-size:${n(t.size)}px" font-weight="${o.bold ? 700 : 400}" font-style="${o.italic ? 'italic' : 'normal'}" text-anchor="${t.anchor}" ${paint}${op}${tr}>${spans}</text>`;
    }
  }
}

export function textLayout(o: ArtObject) {
  const size = (o.fontSize ?? 12) * PT_MM;
  const lh = size * LINE_HEIGHT;
  const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
  const x = o.align === 'left' ? o.x : o.align === 'right' ? o.x + o.w : o.x + o.w / 2;
  // linha de base aproximada: ~80% da altura da fonte dentro da linha
  const y0 = o.y + (lh - size) / 2 + size * 0.8;
  return { size, lh, anchor, x, y0, lines: (o.text ?? '').split('\n') };
}
