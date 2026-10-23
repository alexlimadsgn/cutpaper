import type { EdgeType, Seg } from '../geometry/graph';
import type { Vec2 } from '../geometry/types';
import { asAxisRect, isDrawnDashes, isPageFrame, mergeDashes, snapCreaseEnds } from './cleanup';

export interface ImportResult {
  segs: Seg[];
  /** Quantos elementos viraram corte / vinco / foram ignorados. */
  stats: { cut: number; crease: number; skipped: number };
  mmPerUnit: number;
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

function parseLength(v: string | null): { n: number; unit: string } | null {
  const m = v?.trim().match(/^([\d.+-eE]+)\s*([a-z%]*)$/);
  return m ? { n: parseFloat(m[1]), unit: m[2] } : null;
}

const CREASE_RE = /vinco|crease|fold|score|dobra|perf/i;
const CUT_RE = /corte|cut|die|faca|kiss/i;
const SKIP_RE = /sangria|bleed|arte|artwork|guia|guide|seguran|safe|dimens/i;

/** Nomes de camada/grupo: id, class, inkscape:label, data-name (Illustrator). */
function labelsOf(el: Element, root: Element): string {
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement)
    parts.push(n.id, n.getAttribute('class') ?? '', n.getAttribute('inkscape:label') ?? '', n.getAttribute('data-name') ?? '');
  return parts.join(' ');
}

/** A camada/grupo diz explicitamente se é corte ou vinco? */
const explicitType = (el: Element, root: Element) => {
  const labels = labelsOf(el, root);
  return CREASE_RE.test(labels) || CUT_RE.test(labels);
};

function classify(el: Element, cs: CSSStyleDeclaration, root: Element): EdgeType | 'skip' {
  const labels = labelsOf(el, root);
  if (SKIP_RE.test(labels) && !CREASE_RE.test(labels) && !CUT_RE.test(labels)) return 'skip';
  if (CREASE_RE.test(labels)) return 'crease';
  if (CUT_RE.test(labels)) return 'cut';
  if (cs.strokeDasharray && cs.strokeDasharray !== 'none') return 'crease';
  const m = cs.stroke.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (m) {
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    if (b > 140 && b > r + 40) return 'crease'; // azul/ciano
    if (g > 140 && g > r + 40 && b < 140) return 'crease'; // verde
  }
  return 'cut';
}

// ---------- geometria ----------

type Mat = DOMMatrix;

/** Converte a geometria de um elemento em polilinhas (curvas são aproximadas). */
function elementPolylines(el: Element): Vec2[][] {
  const num = (a: string) => parseFloat(el.getAttribute(a) ?? '0') || 0;
  switch (el.tagName.toLowerCase()) {
    case 'line':
      return [[[num('x1'), num('y1')], [num('x2'), num('y2')]]];
    case 'rect': {
      const x = num('x'), y = num('y'), w = num('width'), h = num('height');
      return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
    }
    case 'polyline':
    case 'polygon': {
      const n = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(parseFloat);
      const pts: Vec2[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      if (el.tagName.toLowerCase() === 'polygon' && pts.length) pts.push(pts[0]);
      return [pts];
    }
    case 'circle':
    case 'ellipse': {
      const cx = num('cx'), cy = num('cy');
      const rx = el.hasAttribute('r') ? num('r') : num('rx'), ry = el.hasAttribute('r') ? num('r') : num('ry');
      const pts: Vec2[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
      }
      return [pts];
    }
    case 'path':
      return parsePath(el.getAttribute('d') ?? '');
  }
  return [];
}

const CURVE_STEPS = 16;

export function parsePath(d: string): Vec2[][] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Vec2[][] = [];
  let cur: Vec2[] = [];
  let i = 0, cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  let lcx = 0, lcy = 0; // último ponto de controle (S/T)
  let prevCmd = '';
  const n = () => parseFloat(tokens[i++]);
  const flag = () => {
    // flags de arco podem vir grudadas ("011")
    const t = tokens[i];
    if (t.length > 1 && /^[01]/.test(t)) { tokens[i] = t.slice(1); return +t[0]; }
    i++;
    return +t;
  };
  const push = (px: number, py: number) => { cur.push([px, py]); x = px; y = py; };
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush();
        const px = n() + ox, py = n() + oy;
        cur = [[px, py]]; x = px; y = py; sx = px; sy = py;
        cmd = rel ? 'l' : 'L'; // pares seguintes são L implícito
        break;
      }
      case 'L': push(n() + ox, n() + oy); break;
      case 'H': push(n() + ox, y); break;
      case 'V': push(x, n() + (rel ? y : 0)); break;
      case 'Z':
        if (x !== sx || y !== sy) push(sx, sy);
        flush();
        cur = [[sx, sy]];
        break;
      case 'C':
      case 'S': {
        let c1x: number, c1y: number;
        if (cmd.toUpperCase() === 'C') { c1x = n() + ox; c1y = n() + oy; }
        else if (/[CS]/i.test(prevCmd)) { c1x = 2 * x - lcx; c1y = 2 * y - lcy; }
        else { c1x = x; c1y = y; }
        const c2x = n() + ox, c2y = n() + oy, ex = n() + ox, ey = n() + oy;
        const x0 = x, y0 = y;
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS, mt = 1 - t;
          push(
            mt * mt * mt * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ex,
            mt * mt * mt * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ey,
          );
        }
        lcx = c2x; lcy = c2y;
        break;
      }
      case 'Q':
      case 'T': {
        let cx: number, cy: number;
        if (cmd.toUpperCase() === 'Q') { cx = n() + ox; cy = n() + oy; }
        else if (/[QT]/i.test(prevCmd)) { cx = 2 * x - lcx; cy = 2 * y - lcy; }
        else { cx = x; cy = y; }
        const ex = n() + ox, ey = n() + oy, x0 = x, y0 = y;
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS, mt = 1 - t;
          push(mt * mt * x0 + 2 * mt * t * cx + t * t * ex, mt * mt * y0 + 2 * mt * t * cy + t * t * ey);
        }
        lcx = cx; lcy = cy;
        break;
      }
      case 'A': {
        const rx = n(), ry = n(), rot = n(), large = flag(), sweep = flag();
        const ex = n() + ox, ey = n() + oy;
        for (const p of arcPoints(x, y, rx, ry, rot, large, sweep, ex, ey)) push(p[0], p[1]);
        break;
      }
      default:
        i++;
    }
    prevCmd = cmd;
  }
  flush();
  return out;
}

/** Arco SVG (endpoint) → pontos, via parametrização pelo centro (SVG spec F.6.5). */
function arcPoints(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number): Vec2[] {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil((Math.abs(dth) / (Math.PI / 2)) * CURVE_STEPS / 2));
  const pts: Vec2[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = th1 + (dth * k) / steps;
    pts.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  pts[pts.length - 1] = [x2, y2];
  return pts;
}

/** Transform acumulado do elemento até a raiz (sem o viewBox). */
function ctm(el: Element, root: Element): Mat {
  let m = new DOMMatrix();
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const t = n.getAttribute('transform');
    if (t) m = parseTransform(t).multiply(m);
  }
  return m;
}

/** Lista de transforms SVG (aplicada da esquerda para a direita). */
export function parseTransform(t: string): Mat {
  const m = new DOMMatrix();
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);
    switch (fn) {
      case 'translate': m.translateSelf(a[0] ?? 0, a[1] ?? 0); break;
      case 'scale': m.scaleSelf(a[0] ?? 1, a[1] ?? a[0] ?? 1); break;
      case 'rotate':
        m.translateSelf(a[1] ?? 0, a[2] ?? 0).rotateSelf(a[0] ?? 0).translateSelf(-(a[1] ?? 0), -(a[2] ?? 0));
        break;
      case 'skewX': m.skewXSelf(a[0] ?? 0); break;
      case 'skewY': m.skewYSelf(a[0] ?? 0); break;
      case 'matrix': m.multiplySelf(new DOMMatrix(a.slice(0, 6))); break;
    }
  }
  return m;
}

export function importSvg(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parsed = doc.documentElement;
  if (parsed.nodeName.toLowerCase() !== 'svg') throw new Error('Arquivo SVG inválido');

  // anexado (invisível) para que getComputedStyle resolva classes de <style>
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none';
  const root = document.importNode(parsed, true) as unknown as SVGSVGElement;
  host.appendChild(root);
  document.body.appendChild(host);

  try {
    // escala: unidade do usuário → mm
    const isIllustrator = /Illustrator/i.test(text);
    // página A4/A3 em pontos (842 × 595, 1191 × 842…), comum em exportações do Figma/Corel/Canva
    const pw = parseFloat(root.getAttribute('width') ?? ''), ph = parseFloat(root.getAttribute('height') ?? '');
    const near = (a: number, b: number) => Math.abs(a - b) <= 2;
    const pagePt = [[842, 595], [842, 596], [1191, 842], [612, 792]].some(([a, b]) => (near(pw, a) && near(ph, b)) || (near(pw, b) && near(ph, a)));
    const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(parseFloat);
    const w = parseLength(root.getAttribute('width'));
    let mmPerUnit = isIllustrator || pagePt ? 25.4 / 72 : 25.4 / 96;
    if (w && w.unit !== '%') {
      const unitMm = w.unit === 'px' || w.unit === '' ? mmPerUnit : UNIT_MM[w.unit] ?? mmPerUnit;
      // (sem unidade = px, a não ser que seja uma página em pontos)
      mmPerUnit = vb && vb[2] > 0 ? (w.n * unitMm) / vb[2] : unitMm;
    }
    const ox = vb?.[0] ?? 0, oy = vb?.[1] ?? 0;

    const segs: Seg[] = [];
    const stats = { cut: 0, crease: 0, skipped: 0 };
    const els = root.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
    let anyStroked = false;
    const candidates: { el: Element; type: EdgeType | 'skip'; stroked: boolean }[] = [];
    for (const el of els) {
      if (el.closest('defs, clipPath, mask, symbol, pattern, marker')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') { stats.skipped++; continue; }
      const stroked = cs.stroke !== 'none' && cs.stroke !== '' && parseFloat(cs.strokeWidth) > 0;
      anyStroked ||= stroked;
      candidates.push({ el, type: classify(el, cs, root), stroked });
    }
    // geometria de cada elemento já em mm
    const items: { type: EdgeType; lines: Vec2[][]; explicit: boolean }[] = [];
    for (const { el, type, stroked } of candidates) {
      // só contornos: preenchimentos sem traço costumam ser arte
      if (type === 'skip' || (anyStroked && !stroked)) { stats.skipped++; continue; }
      const m = ctm(el, root);
      const lines = elementPolylines(el).map((line) => line.map(([x, y]) => {
        const p = m.transformPoint(new DOMPoint(x, y));
        return [(p.x - ox) * mmPerUnit, (p.y - oy) * mmPerUnit] as Vec2;
      }));
      items.push({ type, lines, explicit: explicitType(el, root) });
    }

    // moldura da página: retângulo que envolve todo o resto sem encostar nele
    const others = (skip: number) => items.flatMap((it, i) => (i === skip ? [] : it.lines.flat()));
    for (let i = items.length - 1; i >= 0; i--) {
      const r = asAxisRect(items[i].lines);
      if (!r || items[i].explicit) continue;
      const pts = others(i);
      if (isPageFrame(r, pts)) {
        items.splice(i, 1);
        stats.skipped++;
      }
    }

    for (const it of items) {
      // vinco desenhado como tracinhos soltos: vira linha contínua
      if (isDrawnDashes(it.lines) && (it.type === 'crease' || !it.explicit)) {
        for (const [a, b] of mergeDashes(it.lines)) segs.push({ a, b, type: 'crease' });
        stats.crease++;
        continue;
      }
      for (const pts of it.lines) for (let k = 0; k + 1 < pts.length; k++) segs.push({ a: pts[k], b: pts[k + 1], type: it.type });
      stats[it.type]++;
    }
    return { segs: snapCreaseEnds(segs), stats, mmPerUnit };
  } finally {
    host.remove();
  }
}
