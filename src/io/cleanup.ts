import type { Seg } from '../geometry/graph';
import type { Vec2 } from '../geometry/types';

/**
 * Limpeza de moldes importados (funções puras, em mm).
 * Muitos arquivos desenham o vinco como centenas de tracinhos soltos (ex.: exportado do Figma/Corel)
 * e trazem a moldura da página como se fosse corte.
 */

const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polyLen = (p: Vec2[]) => p.reduce((s, q, i) => (i ? s + len(p[i - 1], q) : s), 0);

/** O elemento é uma linha tracejada desenhada com traços soltos (e não um contorno de corte)? */
export function isDrawnDashes(lines: Vec2[][]): boolean {
  if (lines.length < 8) return false;
  const lens = lines.map(polyLen);
  if (Math.max(...lens) > 20) return false;
  return lens.filter((l) => l < 6).length >= lines.length * 0.8;
}

/**
 * Junta os traços colineares em linhas contínuas. Traços na mesma reta são unidos enquanto
 * a falha entre eles for pequena (até ~4× o traço típico).
 */
export function mergeDashes(lines: Vec2[][]): [Vec2, Vec2][] {
  const pieces: [Vec2, Vec2][] = [];
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) if (len(l[i], l[i + 1]) > 1e-6) pieces.push([l[i], l[i + 1]]);
  if (!pieces.length) return [];
  const typical = pieces.map(([a, b]) => len(a, b)).sort((x, y) => x - y)[Math.floor(pieces.length / 2)];
  const maxGap = Math.max(typical * 4, 2.5);

  // agrupa por reta: ângulo (0..π) e distância à origem
  type G = { th: number; d: number; cos: number; sin: number; iv: [number, number][] };
  const groups: G[] = [];
  const ANG = (1.2 * Math.PI) / 180, OFF = 0.35;
  for (const [a, b] of pieces) {
    let th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 1e-9) th -= Math.PI;
    const cos = Math.cos(th), sin = Math.sin(th);
    const d = -sin * a[0] + cos * a[1];
    const ta = cos * a[0] + sin * a[1], tb = cos * b[0] + sin * b[1];
    const g = groups.find((g) => {
      const dt = Math.min(Math.abs(g.th - th), Math.PI - Math.abs(g.th - th));
      if (dt > ANG) return false;
      // distância dos dois extremos à reta do grupo
      const off = (q: Vec2) => Math.abs(-g.sin * q[0] + g.cos * q[1] - g.d);
      return off(a) <= OFF && off(b) <= OFF;
    });
    if (g) {
      const ga = g.cos * a[0] + g.sin * a[1], gb = g.cos * b[0] + g.sin * b[1];
      g.iv.push([Math.min(ga, gb), Math.max(ga, gb)]);
    } else groups.push({ th, d, cos, sin, iv: [[Math.min(ta, tb), Math.max(ta, tb)]] });
  }

  const out: [Vec2, Vec2][] = [];
  for (const g of groups) {
    g.iv.sort((x, y) => x[0] - y[0]);
    let [s, e] = g.iv[0];
    const emit = () => {
      if (e - s < 0.5) return;
      const P = (t: number): Vec2 => [g.cos * t - g.sin * g.d, g.sin * t + g.cos * g.d];
      out.push([P(s), P(e)]);
    };
    for (const [a, b] of g.iv.slice(1)) {
      if (a - e <= maxGap) e = Math.max(e, b);
      else { emit(); s = a; e = b; }
    }
    emit();
  }
  return out;
}

/** Retângulo alinhado aos eixos (um único contorno com 4 cantos)? Devolve a caixa. */
export function asAxisRect(lines: Vec2[][]) {
  if (lines.length !== 1) return undefined;
  const p = lines[0];
  if (p.length < 4 || p.length > 6) return undefined;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const tol = 0.2;
  const ok = p.every(([x, y]) => (Math.abs(x - minX) < tol || Math.abs(x - maxX) < tol) && (Math.abs(y - minY) < tol || Math.abs(y - maxY) < tol));
  return ok ? { minX, maxX, minY, maxY } : undefined;
}

/**
 * Ajusta as pontas dos vincos para encostarem no corte: o desenhista costuma parar o tracejado
 * um pouco antes (ou depois) da borda, e aí o vinco não divide os painéis.
 */
export function snapCreaseEnds(segs: Seg[], reach = 2.5): Seg[] {
  const cuts = segs.filter((s) => s.type === 'cut');
  const others = (self: Seg) => segs.filter((s) => s !== self);
  const onAny = (p: Vec2, self: Seg) => others(self).some((s) => distToSeg(p, s.a, s.b) < 0.05);
  return segs.map((s) => {
    if (s.type !== 'crease') return s;
    const L = len(s.a, s.b);
    if (L < 1e-6) return s;
    const u: Vec2 = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L];
    const fix = (p: Vec2, dir: number): Vec2 => {
      // 1º: um canto próximo (ponta de outra linha ou cruzamento de duas linhas) — o tracejado
      // costuma começar um pouco antes ou depois do canto do painel
      const near = others(s).filter((o) => distToSeg(p, o.a, o.b) < reach);
      const cands: Vec2[] = near.flatMap((o) => [o.a, o.b]);
      for (let i = 0; i < near.length; i++)
        for (let j = i + 1; j < near.length; j++) {
          const x = segX(near[i], near[j]);
          if (x) cands.push(x);
        }
      let snap: Vec2 | undefined, bd = reach;
      for (const c of cands) { const dd = len(p, c); if (dd < bd) { bd = dd; snap = c; } }
      if (snap) return bd < 0.02 ? p : snap;
      if (onAny(p, s)) return p;
      let best: number | undefined;
      for (const c of [...cuts, ...segs.filter((x) => x.type === 'crease' && x !== s)]) {
        const t = rayHit(p, [u[0] * dir, u[1] * dir], c.a, c.b);
        if (t !== undefined && Math.abs(t) <= reach && (best === undefined || Math.abs(t) < Math.abs(best))) best = t;
      }
      return best === undefined ? p : [p[0] + u[0] * dir * best, p[1] + u[1] * dir * best];
    };
    return { ...s, a: fix(s.a, -1), b: fix(s.b, 1) };
  });
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Interseção da reta p + t·d com o segmento ab; devolve t (pode ser negativo). */
function rayHit(p: Vec2, d: Vec2, a: Vec2, b: Vec2): number | undefined {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-9) return undefined;
  const wx = a[0] - p[0], wy = a[1] - p[1];
  const t = (wx * ey - wy * ex) / den;
  const s = (wx * d[1] - wy * d[0]) / den;
  return s >= -1e-6 && s <= 1 + 1e-6 ? t : undefined;
}

/** Cruzamento de dois segmentos (com folga de 1 mm nas pontas). */
function segX(p: Seg, q: Seg): Vec2 | undefined {
  const d1: Vec2 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2: Vec2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
  if (Math.abs(den) < 1e-6 * l1 * l2) return undefined;
  const wx = q.a[0] - p.a[0], wy = q.a[1] - p.a[1];
  const t = (wx * d2[1] - wy * d2[0]) / den, u = (wx * d1[1] - wy * d1[0]) / den;
  const e1 = 1 / l1, e2 = 1 / l2;
  if (t < -e1 || t > 1 + e1 || u < -e2 || u > 1 + e2) return undefined;
  return [p.a[0] + t * d1[0], p.a[1] + t * d1[1]];
}

/**
 * Moldura da página: retângulo que contém todo o resto. Pode encostar no molde em até dois lados
 * (molde que vai até a margem), mas não em todos.
 */
export function isPageFrame(r: { minX: number; maxX: number; minY: number; maxY: number }, pts: Vec2[]) {
  if (!pts.length) return false;
  const t = 0.5;
  if (!pts.every(([x, y]) => x >= r.minX - t && x <= r.maxX + t && y >= r.minY - t && y <= r.maxY + t)) return false;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const free = [Math.min(...xs) - r.minX, r.maxX - Math.max(...xs), Math.min(...ys) - r.minY, r.maxY - Math.max(...ys)].filter((m) => m > 1).length;
  return free >= 2;
}
