import { byId, type EdgeType, type Graph } from './graph';
import type { Dieline, Face, Vec2 } from './types';

interface Loop {
  id: string;
  verts: string[];
  halfEdges: string[];
  edges: string[];
  area: number;
}

const he = (eid: string, dir: 0 | 1) => `${eid}:${dir}`;
const heOrder = (k: string) => {
  const [e, d] = k.split(':');
  return +e.slice(1) * 2 + +d;
};

export const polyArea = (p: Vec2[]) =>
  p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

export function pointInPoly([x, y]: Vec2, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Remove "espinhos" (ida e volta pela mesma aresta solta, ex.: fendas de corte). */
function removeSpikes(ids: string[]): string[] {
  const out = [...ids];
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length], next = out[(i + 1) % out.length];
      if (prev === next) {
        // remove o vértice da ponta e um dos repetidos
        const rm = [i, (i + 1) % out.length].sort((a, b) => b - a);
        for (const k of rm) out.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Percorre todas as faces do grafo planar mantendo a face à esquerda. */
function traceLoops(g: Graph): Loop[] {
  const adj = new Map<string, { to: string; eid: string; ang: number }[]>();
  for (const eid in g.e) {
    const { a, b } = g.e[eid];
    const A = g.v[a], B = g.v[b];
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, eid, ang: Math.atan2(B.y - A.y, B.x - A.x) });
    adj.get(b)!.push({ to: a, eid, ang: Math.atan2(A.y - B.y, A.x - B.x) });
  }
  for (const list of adj.values()) list.sort((p, q) => p.ang - q.ang);

  const visited = new Set<string>();
  const loops: Loop[] = [];
  for (const eid of Object.keys(g.e).sort(byId))
    for (const dir of [0, 1] as const) {
      const start = he(eid, dir);
      if (visited.has(start)) continue;
      const verts: string[] = [], halfEdges: string[] = [], edges: string[] = [];
      let cur = { eid, from: dir === 0 ? g.e[eid].a : g.e[eid].b, to: dir === 0 ? g.e[eid].b : g.e[eid].a };
      for (let guard = 0; guard < 100000; guard++) {
        const key = he(cur.eid, g.e[cur.eid].a === cur.from ? 0 : 1);
        if (visited.has(key)) break;
        visited.add(key);
        verts.push(cur.from);
        halfEdges.push(key);
        edges.push(cur.eid);
        const list = adj.get(cur.to)!;
        const i = list.findIndex((n) => n.eid === cur.eid);
        const nx = list[(i - 1 + list.length) % list.length];
        cur = { eid: nx.eid, from: cur.to, to: nx.to };
      }
      const pts = verts.map((v) => [g.v[v].x, g.v[v].y] as Vec2);
      const id = [...halfEdges].sort((p, q) => heOrder(p) - heOrder(q))[0];
      loops.push({ id, verts, halfEdges, edges, area: polyArea(pts) });
    }
  return loops;
}

function components(g: Graph) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };
  for (const v in g.v) parent.set(v, v);
  for (const eid in g.e) parent.set(find(g.e[eid].a), find(g.e[eid].b));
  return find;
}

function chain(g: Graph, type: EdgeType, skip: Set<string> = new Set()): Vec2[][] {
  const ids = Object.keys(g.e).filter((k) => g.e[k].type === type && !skip.has(k)).sort(byId);
  const adj = new Map<string, string[]>();
  for (const k of ids) {
    const { a, b } = g.e[k];
    adj.set(a, [...(adj.get(a) ?? []), k]);
    adj.set(b, [...(adj.get(b) ?? []), k]);
  }
  const used = new Set<string>();
  const out: Vec2[][] = [];
  const walk = (startV: string, startE: string) => {
    const pts: Vec2[] = [[g.v[startV].x, g.v[startV].y]];
    let v = startV, e: string | undefined = startE;
    while (e && !used.has(e)) {
      used.add(e);
      v = g.e[e].a === v ? g.e[e].b : g.e[e].a;
      pts.push([g.v[v].x, g.v[v].y]);
      const nexts = adj.get(v)!;
      e = nexts.length === 2 ? nexts.find((n) => !used.has(n)) : undefined;
    }
    out.push(pts);
  };
  // começa pelas pontas e bifurcações; depois os laços fechados
  for (const [v, list] of adj) if (list.length !== 2) for (const e of list) if (!used.has(e)) walk(v, e);
  for (const k of ids) if (!used.has(k)) walk(g.e[k].a, k);
  return out;
}

/**
 * Deriva o molde completo a partir do grafo:
 * faces (com furos), descarte de janelas, árvore de dobras e polilinhas de corte/vinco.
 */
export function deriveDieline(g: Graph, names: Record<string, string> = {}, rootId?: string): Dieline {
  const loops = traceLoops(g);
  const find = components(g);
  const pts = (l: Loop) => l.verts.map((v) => [g.v[v].x, g.v[v].y] as Vec2);
  const EPS = 1e-6;

  const inner = loops.filter((l) => l.area > EPS);
  const byComp = new Map<string, Loop[]>();
  for (const l of loops) {
    const c = find(l.verts[0]);
    byComp.set(c, [...(byComp.get(c) ?? []), l]);
  }

  const faces = new Map<string, Face & { comp: string; loop: Loop }>();
  for (const l of inner)
    faces.set(l.id, {
      id: l.id, name: '', poly: removeSpikes(l.verts).map((v) => [g.v[v].x, g.v[v].y] as Vec2),
      holes: [], area: l.area, comp: find(l.verts[0]), loop: l,
    });

  // componentes aninhados dentro de outra face viram furos (janelas)
  const waste = new Set<string>();
  for (const [comp, list] of byComp) {
    const outer = list.reduce((m, l) => (l.area < m.area ? l : m), list[0]);
    if (outer.area > -EPS) continue;
    const probe = pts(outer)[0];
    let container: (Face & { comp: string }) | undefined;
    for (const f of faces.values())
      if (f.comp !== comp && f.area > -outer.area && pointInPoly(probe, f.poly) && (!container || f.area < container.area))
        container = f;
    if (!container) continue;
    container.holes.push(removeSpikes(outer.verts).map((v) => [g.v[v].x, g.v[v].y] as Vec2));
    for (const l of list)
      if (l.area > EPS && l.edges.every((e) => g.e[e].type === 'cut')) waste.add(l.id);
  }
  // furos de corte que encostam em vincos (ex.: janela atravessada por uma dobra): uma região fechada
  // só por linhas de corte, dentro de outra região de corte, é vazio — tudo o que estiver nela é descartado
  const cutGraph: Graph = { v: g.v, e: Object.fromEntries(Object.entries(g.e).filter(([, e]) => e.type === 'cut')), next: g.next };
  const cutRegions = traceLoops(cutGraph)
    .filter((l) => l.area > EPS)
    .map((l) => ({ area: l.area, poly: pts(l), probe: interiorPoint(g, l) }));
  const cutHoles = cutRegions.filter((r) => cutRegions.some((o) => o !== r && o.area > r.area && pointInPoly(r.probe, o.poly)));
  if (cutHoles.length)
    for (const f of faces.values()) {
      const probe = interiorPoint(g, f.loop);
      if (cutHoles.some((h) => pointInPoly(probe, h.poly))) waste.add(f.id);
    }
  for (const id of waste) faces.delete(id);

  // adjacência por vinco
  const faceOfHe = new Map<string, string>();
  for (const f of faces.values()) for (const k of f.loop.halfEdges) faceOfHe.set(k, f.id);
  const adj = new Map<string, { to: string; eid: string }[]>();
  for (const eid in g.e) {
    if (g.e[eid].type !== 'crease') continue;
    const f0 = faceOfHe.get(he(eid, 0)), f1 = faceOfHe.get(he(eid, 1));
    if (!f0 || !f1 || f0 === f1) continue;
    adj.set(f0, [...(adj.get(f0) ?? []), { to: f1, eid }]);
    adj.set(f1, [...(adj.get(f1) ?? []), { to: f0, eid }]);
  }

  // árvore de dobras: BFS a partir da raiz de cada grupo
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of faces.keys()) {
    if (seen.has(id)) continue;
    const grp: string[] = [];
    const q = [id];
    seen.add(id);
    while (q.length) {
      const f = q.shift()!;
      grp.push(f);
      for (const n of adj.get(f) ?? []) if (!seen.has(n.to)) { seen.add(n.to); q.push(n.to); }
    }
    groups.push(grp);
  }
  for (const grp of groups) {
    const root = rootId && grp.includes(rootId)
      ? rootId
      : grp.reduce((m, f) => (faces.get(f)!.area > faces.get(m)!.area ? f : m), grp[0]);
    const done = new Set([root]);
    const q = [root];
    while (q.length) {
      const f = q.shift()!;
      for (const n of adj.get(f) ?? []) {
        if (done.has(n.to)) continue;
        done.add(n.to);
        const e = g.e[n.eid];
        const child = faces.get(n.to)!;
        child.parent = f;
        child.hinge = [[g.v[e.a].x, g.v[e.a].y], [g.v[e.b].x, g.v[e.b].y]];
        child.angle = e.angle;
        if (e.step) { child.step = e.step; child.stepManual = true; }
        q.push(n.to);
      }
    }
  }

  const list = [...faces.values()]
    .map((f) => {
      const c = centroid(f.poly);
      return { f, key: Math.round(c[1] / 5) * 1e6 + c[0] };
    })
    .sort((a, b) => a.key - b.key)
    .map(({ f }, i): Face => ({
      id: f.id, name: names[f.id] ?? `Face ${i + 1}`, poly: f.poly, holes: f.holes, area: f.area,
      parent: f.parent, hinge: f.hinge, angle: f.angle, step: f.step, stepManual: f.stepManual,
    }));
  assignSteps(list);

  // vincos que não tocam nenhum painel (o trecho que passa pelo vazio de um furo) não existem no papel
  const panelHe = new Set([...faces.values()].flatMap((f) => f.loop.halfEdges));
  const dead = Object.keys(g.e).filter((e) => g.e[e].type === 'crease' && !panelHe.has(he(e, 0)) && !panelHe.has(he(e, 1)));

  return { faces: list, cuts: chain(g, 'cut'), creases: chain(g, 'crease', new Set(dead)), dead };
}

/**
 * Etapas de montagem. Automática: profundidade na árvore de dobras (paredes → abas → tampa…);
 * a partir do 2º nível, faces que ainda têm filhas dobram depois das que não têm
 * (ex.: abas de cola antes da tampa, e a aba de encaixe por último).
 * As etapas manuais entram na mesma escala; no fim tudo vira 1..N sem buracos.
 */
function assignSteps(faces: Face[]) {
  const byId = new Map(faces.map((f) => [f.id, f]));
  const hasKids = new Set(faces.map((f) => f.parent).filter(Boolean));
  const depth = (f: Face): number => (f.parent ? 1 + depth(byId.get(f.parent)!) : 0);
  const raw = new Map<string, number>();
  for (const f of faces) {
    if (!f.parent) continue;
    const d = depth(f);
    raw.set(f.id, f.stepManual && f.step ? f.step : d + (d >= 2 && hasKids.has(f.id) ? 0.5 : 0));
  }
  const ranks = [...new Set(raw.values())].sort((a, b) => a - b);
  for (const f of faces) f.step = f.parent ? ranks.indexOf(raw.get(f.id)!) + 1 : undefined;
}

/**
 * Ponto garantidamente dentro de um laço de área positiva: meio da aresta mais longa,
 * deslocado um pouco para a esquerda (lado interno no sentido anti-horário).
 */
function interiorPoint(g: Graph, l: Loop): Vec2 {
  let best = 0, bi = 0;
  for (let i = 0; i < l.verts.length; i++) {
    const a = g.v[l.verts[i]], b = g.v[l.verts[(i + 1) % l.verts.length]];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) { best = len; bi = i; }
  }
  const a = g.v[l.verts[bi]], b = g.v[l.verts[(bi + 1) % l.verts.length]];
  const dx = (b.x - a.x) / best, dy = (b.y - a.y) / best;
  const off = Math.min(0.05, best * 0.1);
  return [(a.x + b.x) / 2 - dy * off, (a.y + b.y) / 2 + dx * off];
}

export const centroid = (p: Vec2[]): Vec2 => [
  p.reduce((s, q) => s + q[0], 0) / p.length,
  p.reduce((s, q) => s + q[1], 0) / p.length,
];

/** Dá nome às faces que contêm os pontos de rótulo (usado pelos templates). */
export function nameFaces(g: Graph, labels: { at: Vec2; name: string }[]) {
  const d = deriveDieline(g);
  const names: Record<string, string> = {};
  for (const l of labels) {
    const f = d.faces.find((f) => pointInPoly(l.at, f.poly));
    if (f) names[f.id] = l.name;
  }
  return names;
}

/** Face sob um ponto (a menor que o contém, respeitando furos). */
export function faceAt(d: Dieline, p: Vec2) {
  return d.faces
    .filter((f) => pointInPoly(p, f.poly) && !f.holes.some((h) => pointInPoly(p, h)))
    .sort((a, b) => a.area - b.area)[0];
}

/** Arestas do grafo que formam a dobradiça de uma face (vinco com a face-pai). */
export function hingeEdges(g: Graph, f: Face): string[] {
  if (!f.hinge) return [];
  const [p, q] = f.hinge;
  const at = (id: string, pt: Vec2) => Math.hypot(g.v[id].x - pt[0], g.v[id].y - pt[1]) < 1e-6;
  return Object.keys(g.e).filter((id) => {
    const e = g.e[id];
    return e.type === 'crease' && ((at(e.a, p) && at(e.b, q)) || (at(e.a, q) && at(e.b, p)));
  });
}

/** Face que dobra numa aresta de vinco (a filha na árvore de dobras). */
export function faceOfHinge(g: Graph, d: Dieline, edgeId: string): Face | undefined {
  return d.faces.find((f) => hingeEdges(g, f).includes(edgeId));
}

/**
 * Grava a ordem de montagem atual (etapa efetiva de cada face) nos vincos e então
 * aplica `override` (aresta → etapa). Assim o número que o usuário vê é o que fica salvo.
 */
export function withSteps(g: Graph, d: Dieline, override: Record<string, number>): Graph {
  const e = { ...g.e };
  for (const f of d.faces)
    for (const id of hingeEdges(g, f)) e[id] = { ...e[id], step: f.step };
  for (const [id, step] of Object.entries(override)) if (e[id]) e[id] = { ...e[id], step };
  return { ...g, e };
}

/** Remove todas as etapas manuais (volta à ordem automática). */
export function clearSteps(g: Graph): Graph {
  const e: Graph['e'] = {};
  for (const id in g.e) {
    const { step: _s, ...rest } = g.e[id];
    void _s;
    e[id] = rest;
  }
  return { ...g, e };
}
