import type { Edge, Graph } from './graph';
import type { Vec2 } from './types';

/*
 * Curvas Bézier cúbicas nas arestas de corte. A aresta guarda as alças em coordenadas absolutas:
 * c1 sai do vértice `a`, c2 chega no vértice `b`. Para faces, sangria e exportação a curva é
 * aproximada por pequenos segmentos (flattenCurves), então o resto do motor continua trabalhando com retas.
 */

export const isCurved = (e: Edge) => !!(e.c1 && e.c2);

export function bezier(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
  return [k0 * a[0] + k1 * c1[0] + k2 * c2[0] + k3 * b[0], k0 * a[1] + k1 * c1[1] + k2 * c2[1] + k3 * b[1]];
}

/** Quantos trechos usar: ~1 a cada 1,5 mm de contorno de controle, entre 8 e 48. */
const segmentsFor = (a: Vec2, c1: Vec2, c2: Vec2, b: Vec2) => {
  const l = Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(b[0] - c2[0], b[1] - c2[1]);
  return Math.max(8, Math.min(48, Math.ceil(l / 1.5)));
};

/** Pontos da curva de a até b (inclusive). */
export function bezierPoints(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, n = segmentsFor(a, c1, c2, b)): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => (i === 0 ? a : i === n ? b : bezier(a, c1, c2, b, i / n)));
}

/** Pontos de uma aresta do grafo (reta = 2 pontos). */
export function edgePoints(g: Graph, id: string): Vec2[] {
  const e = g.e[id], a: Vec2 = [g.v[e.a].x, g.v[e.a].y], b: Vec2 = [g.v[e.b].x, g.v[e.b].y];
  return isCurved(e) ? bezierPoints(a, e.c1!, e.c2!, b) : [a, b];
}

/** Divide a curva em t (de Casteljau). */
export function splitBezier(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, t: number): [[Vec2, Vec2, Vec2, Vec2], [Vec2, Vec2, Vec2, Vec2]] {
  const L = (p: Vec2, q: Vec2): Vec2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const p01 = L(a, c1), p12 = L(c1, c2), p23 = L(c2, b);
  const p012 = L(p01, p12), p123 = L(p12, p23);
  const m = L(p012, p123);
  return [[a, p01, p012, m], [m, p123, p23, b]];
}

/** Parâmetro t do ponto da curva mais próximo de p. */
export function nearestT(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, p: Vec2): number {
  const d = (t: number) => { const q = bezier(a, c1, c2, b, t); return Math.hypot(q[0] - p[0], q[1] - p[1]); };
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 64; i++) { const t = i / 64; const x = d(t); if (x < bd) { bd = x; best = t; } }
  for (let step = 1 / 128; step > 1e-5; step /= 2)
    for (const t of [best - step, best + step]) if (t >= 0 && t <= 1) { const x = d(t); if (x < bd) { bd = x; best = t; } }
  return best;
}

/** Distância de p até a aresta (reta ou curva). */
export function distToEdge(g: Graph, id: string, p: Vec2): { d: number; q: Vec2 } {
  const pts = edgePoints(g, id);
  let best = { d: Infinity, q: pts[0] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q: Vec2 = [A[0] + t * dx, A[1] + t * dy];
    const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (dd < best.d) best = { d: dd, q };
  }
  return best;
}

/** Caminho SVG da aresta. */
export function edgePath(g: Graph, id: string): string {
  const e = g.e[id], A = g.v[e.a], B = g.v[e.b];
  const f = (n: number) => +n.toFixed(3);
  return isCurved(e)
    ? `M${f(A.x)} ${f(A.y)}C${f(e.c1![0])} ${f(e.c1![1])} ${f(e.c2![0])} ${f(e.c2![1])} ${f(B.x)} ${f(B.y)}`
    : `M${f(A.x)} ${f(A.y)}L${f(B.x)} ${f(B.y)}`;
}

/** Id da aresta original de um trecho de curva (e12.003 → e12). */
export const baseEdgeId = (id: string) => id.replace(/\.\d+$/, '');

/**
 * Troca cada aresta curva por uma cadeia de retas. Os ids dos trechos ficam entre o da aresta e o
 * próximo (e12 → e12.001, e12.002…), assim a ordem por id e as faces continuam estáveis.
 */
export function flattenCurves(g: Graph): Graph {
  if (!Object.values(g.e).some(isCurved)) return g;
  const v = { ...g.v };
  const e: Graph['e'] = {};
  for (const id in g.e) {
    const ed = g.e[id];
    if (!isCurved(ed)) { e[id] = ed; continue; }
    const pts = edgePoints(g, id);
    const num = id.slice(1);
    const pad = (k: number) => String(k).padStart(3, '0');
    let prev = ed.a;
    for (let k = 1; k < pts.length; k++) {
      const vid = k === pts.length - 1 ? ed.b : `v${num}.${pad(k)}`;
      if (k < pts.length - 1) v[vid] = { x: pts[k][0], y: pts[k][1] };
      e[k === 1 ? id : `e${num}.${pad(k)}`] = { a: prev, b: vid, type: ed.type, angle: ed.angle };
      prev = vid;
    }
  }
  return { v, e, next: g.next };
}

/** Alças padrão de uma reta que vai virar curva (sobre a própria reta, a 1/3 e 2/3). */
export function straightHandles(a: Vec2, b: Vec2): [Vec2, Vec2] {
  return [[a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3]];
}
