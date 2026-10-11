import type { Vec2 } from './types';

/**
 * O molde é um grafo planar: vértices + arestas retas de corte ou vinco.
 * Faces, árvore de dobras e sangria são todas derivadas dele (ver faces.ts).
 */
export type EdgeType = 'cut' | 'crease';

export interface Vertex { x: number; y: number }
export interface Edge {
  a: string;
  b: string;
  type: EdgeType;
  /** Ângulo de dobra em graus (só vincos). Negativo = dobra no sentido oposto. */
  angle: number;
  /** Etapa de montagem definida pelo usuário (vinco); undefined = automática. */
  step?: number;
}
export interface Graph {
  v: Record<string, Vertex>;
  e: Record<string, Edge>;
  next: number;
}

export interface Seg { a: Vec2; b: Vec2; type: EdgeType; angle?: number }

export const DEFAULT_ANGLE = 90;
const idNum = (id: string) => +id.slice(1);
export const byId = (a: string, b: string) => idNum(a) - idNum(b);

export const emptyGraph = (): Graph => ({ v: {}, e: {}, next: 1 });

export function newId(g: Graph, prefix: 'v' | 'e') {
  return `${prefix}${g.next++}`;
}

export function cloneGraph(g: Graph): Graph {
  const v: Graph['v'] = {};
  const e: Graph['e'] = {};
  for (const k in g.v) v[k] = { ...g.v[k] };
  for (const k in g.e) e[k] = { ...g.e[k] };
  return { v, e, next: g.next };
}

export function graphFromSegments(segs: Seg[], tol = 0.01): Graph {
  const g = emptyGraph();
  for (const s of segs) {
    const a = newId(g, 'v'), b = newId(g, 'v');
    g.v[a] = { x: s.a[0], y: s.a[1] };
    g.v[b] = { x: s.b[0], y: s.b[1] };
    g.e[newId(g, 'e')] = { a, b, type: s.type, angle: s.angle ?? DEFAULT_ANGLE };
  }
  return normalize(g, tol);
}

/** Acrescenta segmentos ao grafo existente (ferramenta de desenho). */
export function addSegments(g0: Graph, segs: Seg[], tol = 0.01): Graph {
  const g = cloneGraph(g0);
  for (const s of segs) {
    const a = newId(g, 'v'), b = newId(g, 'v');
    g.v[a] = { x: s.a[0], y: s.a[1] };
    g.v[b] = { x: s.b[0], y: s.b[1] };
    g.e[newId(g, 'e')] = { a, b, type: s.type, angle: s.angle ?? DEFAULT_ANGLE };
  }
  return normalize(g, tol);
}

/**
 * Deixa o grafo planar e limpo, preservando ids sempre que possível:
 * 1. funde vértices próximos (< tol)
 * 2. divide arestas em cruzamentos e em junções em "T"
 * 3. remove arestas nulas e duplicadas (vinco tem prioridade sobre corte)
 * 4. remove vértices soltos
 */
export function normalize(g0: Graph, tol = 0.01, pass = 0): Graph {
  const g = cloneGraph(g0);

  // 1. fusão de vértices por hash espacial
  const cell = Math.max(tol, 1e-6) * 2;
  const buckets = new Map<string, string[]>();
  const alias = new Map<string, string>();
  for (const id of Object.keys(g.v).sort(byId)) {
    const p = g.v[id];
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    let found: string | undefined;
    for (let dx = -1; dx <= 1 && !found; dx++)
      for (let dy = -1; dy <= 1 && !found; dy++)
        for (const o of buckets.get(`${cx + dx},${cy + dy}`) ?? [])
          if (Math.hypot(g.v[o].x - p.x, g.v[o].y - p.y) <= tol) { found = o; break; }
    if (found) { alias.set(id, found); delete g.v[id]; }
    else {
      const k = `${cx},${cy}`;
      buckets.set(k, [...(buckets.get(k) ?? []), id]);
    }
  }
  for (const id in g.e) {
    const e = g.e[id];
    e.a = alias.get(e.a) ?? e.a;
    e.b = alias.get(e.b) ?? e.b;
    if (e.a === e.b) delete g.e[id];
  }

  // 2. pontos de divisão por aresta
  const splits = new Map<string, { t: number; v: string }[]>();
  const addSplit = (eid: string, t: number, v: string) => {
    const list = splits.get(eid) ?? [];
    if (!list.some((s) => s.v === v)) list.push({ t, v });
    splits.set(eid, list);
  };
  const eids = Object.keys(g.e).sort(byId);
  const box = (id: string) => {
    const e = g.e[id], a = g.v[e.a], b = g.v[e.b];
    return [Math.min(a.x, b.x) - tol, Math.min(a.y, b.y) - tol, Math.max(a.x, b.x) + tol, Math.max(a.y, b.y) + tol];
  };
  const boxes = new Map(eids.map((id) => [id, box(id)]));

  // vértice sobre o interior de uma aresta (junção em T / sobreposição colinear)
  for (const eid of eids) {
    const e = g.e[eid], A = g.v[e.a], B = g.v[e.b], bb = boxes.get(eid)!;
    const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
    for (const vid in g.v) {
      if (vid === e.a || vid === e.b) continue;
      const P = g.v[vid];
      if (P.x < bb[0] || P.x > bb[2] || P.y < bb[1] || P.y > bb[3]) continue;
      const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      if (Math.hypot(A.x + t * dx - P.x, A.y + t * dy - P.y) <= tol) addSplit(eid, t, vid);
    }
  }

  // cruzamentos próprios
  for (let i = 0; i < eids.length; i++) {
    const e1 = g.e[eids[i]], b1 = boxes.get(eids[i])!;
    for (let j = i + 1; j < eids.length; j++) {
      const b2 = boxes.get(eids[j])!;
      if (b1[2] < b2[0] || b2[2] < b1[0] || b1[3] < b2[1] || b2[3] < b1[1]) continue;
      const e2 = g.e[eids[j]];
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
      const hit = segIntersect(g.v[e1.a], g.v[e1.b], g.v[e2.a], g.v[e2.b]);
      if (!hit) continue;
      const [t, u, x, y] = hit;
      const eps = 1e-9;
      if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) continue;
      const vid = newId(g, 'v');
      g.v[vid] = { x, y };
      addSplit(eids[i], t, vid);
      addSplit(eids[j], u, vid);
    }
  }

  for (const [eid, list] of splits) {
    const e = g.e[eid];
    list.sort((p, q) => p.t - q.t);
    const chain = [e.a, ...list.map((s) => s.v), e.b];
    e.b = chain[1]; // o primeiro trecho mantém o id original
    for (let k = 1; k < chain.length - 1; k++)
      g.e[newId(g, 'e')] = { a: chain[k], b: chain[k + 1], type: e.type, angle: e.angle };
  }
  // novos vértices de cruzamento podem cair perto de vértices existentes: mais uma passada
  if (splits.size && pass < 2) return normalize(g, tol, pass + 1);

  // 3. duplicadas
  const seen = new Map<string, string>();
  for (const eid of Object.keys(g.e).sort(byId)) {
    const e = g.e[eid];
    if (e.a === e.b) { delete g.e[eid]; continue; }
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, eid); continue; }
    if (e.type === 'crease' && g.e[prev].type === 'cut') {
      g.e[prev].type = 'crease';
      g.e[prev].angle = e.angle;
    }
    delete g.e[eid];
  }

  // 4. vértices soltos
  const used = new Set<string>();
  for (const eid in g.e) { used.add(g.e[eid].a); used.add(g.e[eid].b); }
  for (const vid in g.v) if (!used.has(vid)) delete g.v[vid];
  return g;
}

function segIntersect(p: Vertex, p2: Vertex, q: Vertex, q2: Vertex): [number, number, number, number] | null {
  const rx = p2.x - p.x, ry = p2.y - p.y, sx = q2.x - q.x, sy = q2.y - q.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
  const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
  return [t, u, p.x + t * rx, p.y + t * ry];
}

// ---------- operações de edição ----------

export function moveVertices(g0: Graph, ids: string[], dx: number, dy: number, base: Graph): Graph {
  const g = { ...g0, v: { ...g0.v } };
  for (const id of ids) if (base.v[id]) g.v[id] = { x: base.v[id].x + dx, y: base.v[id].y + dy };
  return g;
}

/** Insere um vértice no meio de uma aresta (ponto mais próximo de p). */
export function splitEdge(g0: Graph, eid: string, p: Vec2): { g: Graph; vid: string } {
  const g = cloneGraph(g0);
  const e = g.e[eid], A = g.v[e.a], B = g.v[e.b];
  const dx = B.x - A.x, dy = B.y - A.y;
  const t = Math.min(0.999, Math.max(0.001, ((p[0] - A.x) * dx + (p[1] - A.y) * dy) / (dx * dx + dy * dy)));
  const vid = newId(g, 'v');
  g.v[vid] = { x: A.x + t * dx, y: A.y + t * dy };
  const oldB = e.b;
  e.b = vid;
  g.e[newId(g, 'e')] = { a: vid, b: oldB, type: e.type, angle: e.angle };
  return { g, vid };
}

export function deleteEdges(g0: Graph, ids: string[]): Graph {
  const g = cloneGraph(g0);
  for (const id of ids) delete g.e[id];
  return normalize(g, 1e-9);
}

/**
 * Remove vértices. Vértice de grau 2 é "dissolvido" (as duas arestas viram uma);
 * os demais são apagados junto com suas arestas.
 */
export function deleteVertices(g0: Graph, ids: string[]): Graph {
  const g = cloneGraph(g0);
  for (const vid of ids) {
    if (!g.v[vid]) continue;
    const inc = Object.keys(g.e).filter((k) => g.e[k].a === vid || g.e[k].b === vid).sort(byId);
    if (inc.length === 2) {
      const [k1, k2] = inc;
      const o1 = g.e[k1].a === vid ? g.e[k1].b : g.e[k1].a;
      const o2 = g.e[k2].a === vid ? g.e[k2].b : g.e[k2].a;
      g.e[k1] = { ...g.e[k1], a: o1, b: o2 };
      delete g.e[k2];
    } else for (const k of inc) delete g.e[k];
    delete g.v[vid];
  }
  return normalize(g, 1e-9);
}

export function updateEdges(g0: Graph, ids: string[], patch: Partial<Edge>): Graph {
  const g = { ...g0, e: { ...g0.e } };
  for (const id of ids) if (g.e[id]) g.e[id] = { ...g.e[id], ...patch };
  return g;
}

export function scaleGraph(g0: Graph, sx: number, sy: number, origin: Vec2): Graph {
  const g = cloneGraph(g0);
  for (const id in g.v) {
    g.v[id].x = origin[0] + (g.v[id].x - origin[0]) * sx;
    g.v[id].y = origin[1] + (g.v[id].y - origin[1]) * sy;
  }
  return g;
}

export function graphBounds(g: Graph) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in g.v) {
    const { x, y } = g.v[id];
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Muda o comprimento de uma aresta.
 * - Horizontal/vertical: "estica" o molde como no CAD — todo vértice além da ponta
 *   final (maior X ou Y) anda junto, mantendo painéis alinhados (ex.: largura de um painel).
 * - Inclinada: a ponta mais conectada fica fixa (ex.: o vértice do topo de um cone)
 *   e a outra se move ao longo da própria linha.
 */
/**
 * Eixo de uma linha "reta": 'x' se horizontal, 'y' se vertical, null se inclinada.
 * Tolera até 1° (arquivos importados costumam ter sobras decimais, ex.: 60,0004).
 */
export function axisOf(dx: number, dy: number): 'x' | 'y' | null {
  const l = Math.hypot(dx, dy);
  const tol = l * Math.tan((1 * Math.PI) / 180);
  return Math.abs(dy) <= tol ? 'x' : Math.abs(dx) <= tol ? 'y' : null;
}

export function setEdgeLength(g0: Graph, eid: string, length: number): Graph {
  const e = g0.e[eid];
  if (!e || length <= 0) return g0;
  const g = cloneGraph(g0);
  const A = g.v[e.a], B = g.v[e.b];
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  const axis = axisOf(dx, dy);
  if (axis) {
    // mede/estica no eixo (ignora a pequena sobra perpendicular de arquivos importados)
    const span = Math.abs(axis === 'x' ? dx : dy);
    const hi = Math.max(A[axis], B[axis]);
    const delta = length - span;
    for (const id in g.v) if (g.v[id][axis] >= hi - 0.05) g.v[id][axis] += delta;
  } else {
    const degree = (v: string) => Object.values(g.e).filter((x) => x.a === v || x.b === v).length;
    const [fixed, moving] = degree(e.b) > degree(e.a) ? [B, A] : [A, B];
    const ux = (moving.x - fixed.x) / len, uy = (moving.y - fixed.y) / len;
    moving.x = fixed.x + ux * length;
    moving.y = fixed.y + uy * length;
  }
  return normalize(g, 0.01);
}
