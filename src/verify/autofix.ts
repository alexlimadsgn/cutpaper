import * as THREE from 'three';
import { deriveDieline, flapIds, hingeEdges } from '../geometry/faces';
import { findConflicts, foldMatrices } from '../geometry/fold';
import { normalize, type Graph } from '../geometry/graph';
import type { Dieline, Face, Vec2 } from '../geometry/types';

export interface FixResult {
  graph: Graph;
  /** O que foi alterado, em linguagem simples. */
  changes: string[];
  conflictsBefore: number;
  conflictsAfter: number;
}

const ANGLE_STEP = 5;
const ANGLE_MAX = 135; // 180° (dobra sobre si mesma) gera encaixes falsos; fica fora da busca
const KEEP_BIAS = 0.3; // mm de "custo" por 90° de mudança: em empate, mantém o ângulo atual
const MIN_FLAP = 6; // mm: abaixo disso uma aba de cola não tem área útil para colar

type Seg = { face: string; edge: string; a: Vec2; b: Vec2; cap: number };

const v3 = new THREE.Vector3();
function pointSegDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = v3.copy(b).sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * Mede o quanto a caixa "fecha": para cada aresta de cada face, a distância até a aresta
 * mais próxima de OUTRA face na caixa montada (limitada por um teto). Arestas que se encontram
 * (cantos da caixa, tampa sobre a frente…) contam ~0; quanto menor o total, mais fechada.
 */
function closureScorer(d: Dieline, g: Graph) {
  const segs: Seg[] = [];
  for (const [edge, owners] of Object.entries(d.edgeFaces)) {
    const e = g.e[edge];
    if (!e) continue;
    const a: Vec2 = [g.v[e.a].x, g.v[e.a].y], b: Vec2 = [g.v[e.b].x, g.v[e.b].y];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const face of owners) segs.push({ face, edge, a, b, cap: Math.min(10, Math.max(1, len * 0.3)) });
  }
  return (faces: Face[]) => {
    const mats = foldMatrices(faces, 1);
    const w = segs.map((s) => {
      const m = mats.get(s.face)!;
      return { s, A: new THREE.Vector3(s.a[0], s.a[1], 0).applyMatrix4(m), B: new THREE.Vector3(s.b[0], s.b[1], 0).applyMatrix4(m) };
    });
    let score = 0;
    for (const i of w) {
      let best = i.s.cap;
      for (const j of w) {
        if (j.s.face === i.s.face || j.s.edge === i.s.edge) continue;
        // distância simétrica entre segmentos (0 quando coincidem)
        const dist = (pointSegDist(i.A, j.A, j.B) + pointSegDist(i.B, j.A, j.B) + pointSegDist(j.A, i.A, i.B) + pointSegDist(j.B, i.A, i.B)) / 4;
        if (dist < best) best = dist;
      }
      score += best;
    }
    return score;
  };
}

/** Busca, vinco a vinco, o ângulo (e o sentido) que mais fecha a caixa. */
function optimizeAngles(d: Dieline, g: Graph) {
  const faces = d.faces.map((f) => ({ ...f }));
  const original = new Map(faces.map((f) => [f.id, f.angle ?? 90]));
  const score = closureScorer(d, g);
  const byId = new Map(faces.map((f) => [f.id, f]));
  const depth = (f: Face): number => (f.parent ? 1 + depth(byId.get(f.parent)!) : 0);
  const order = faces.filter((f) => f.parent).sort((a, b) => depth(a) - depth(b));
  const bias = () => faces.reduce((s, f) => s + (f.parent ? (KEEP_BIAS * Math.abs((f.angle ?? 90) - original.get(f.id)!)) / 90 : 0), 0);

  const start = score(faces);
  let current = start + bias();
  for (let round = 0; round < 3; round++) {
    let improved = false;
    for (const f of order) {
      const keep = f.angle ?? 90;
      let best = keep, bestScore = current;
      for (let a = -ANGLE_MAX; a <= ANGLE_MAX; a += ANGLE_STEP) {
        if (a === keep) continue;
        f.angle = a;
        const sc = score(faces) + bias();
        if (sc < bestScore - 1e-6) { bestScore = sc; best = a; }
      }
      f.angle = best;
      if (best !== keep) { improved = true; current = bestScore; }
    }
    if (!improved) break;
  }
  return { faces, before: start, after: score(faces) };
}

/** Ponto da reta da dobradiça mais próximo de p. */
function project(p: Vec2, [a, b]: [Vec2, Vec2]): Vec2 {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
  return [a[0] + t * dx, a[1] + t * dy];
}

interface FlapSpec { id: string; name: string; hinge: [Vec2, Vec2]; ids: string[]; depth: number }

/** Vértices móveis de uma aba: fora da dobradiça e usados só por ela. */
function flapSpec(g: Graph, d: Dieline, flapId: string): FlapSpec | undefined {
  const f = d.faces.find((x) => x.id === flapId);
  if (!f?.hinge) return;
  const dist = (p: Vec2) => { const q = project(p, f.hinge!); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  const ids = Object.keys(g.v).filter((id) => {
    const p: Vec2 = [g.v[id].x, g.v[id].y];
    if (dist(p) < 1e-6 || !f.poly.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)) return false;
    const edges = Object.keys(g.e).filter((e) => g.e[e].a === id || g.e[e].b === id);
    return edges.every((e) => (d.edgeFaces[e] ?? []).every((x) => x === f.id));
  });
  if (!ids.length) return;
  const depth = Math.max(...ids.map((id) => dist([g.v[id].x, g.v[id].y])));
  return depth > 1e-3 ? { id: f.id, name: f.name, hinge: f.hinge, ids, depth } : undefined;
}

/** Aproxima (k < 1) ou afasta (k > 1) da dobradiça as pontas das abas. */
function scaleFlaps(g: Graph, specs: FlapSpec[], k: number) {
  const ng = { ...g, v: { ...g.v } };
  for (const sp of specs)
    for (const id of sp.ids) {
      const p: Vec2 = [g.v[id].x, g.v[id].y];
      const q = project(p, sp.hinge);
      ng.v[id] = { x: q[0] + (p[0] - q[0]) * k, y: q[1] + (p[1] - q[1]) * k };
    }
  return normalize(ng, 0.01);
}

/** Maior fator em [lo, hi] em que `ok` vale (supõe que vale em lo). */
function search(lo: number, hi: number, ok: (k: number) => boolean) {
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Ajusta a profundidade das abas de cola, em três fases:
 * 1. aba que passa da borda do painel onde é colada → encolhe sozinha
 * 2. abas que disputam o mesmo lugar → encolhem juntas, pelo mesmo fator (mantém a simetria)
 * 3. aba pequena demais para colar → cresce até o mínimo, se couber
 */
function fixFlaps(g0: Graph, names: Record<string, string>, root: string | undefined, changes: string[]) {
  let g = g0;
  const derive = (gg: Graph) => deriveDieline(gg, names, root);
  const conflictsOf = (gg: Graph) => findConflicts(derive(gg).faces);
  // abas: as pequenas de sempre + qualquer face-ponta envolvida num conflito (aba grande demais
  // pode passar do limite de área de "aba" justamente por ser grande)
  const d0 = derive(g);
  const leaves = new Set(d0.faces.filter((f) => f.parent && !d0.faces.some((x) => x.parent === f.id)).map((f) => f.id));
  const flaps = new Set([...flapIds(d0), ...conflictsOf(g).map((c) => c.face).filter((id) => leaves.has(id))]);
  const depth0 = new Map<string, { name: string; depth: number }>();
  for (const id of flaps) {
    const sp = flapSpec(g, derive(g), id);
    if (sp) depth0.set(id, { name: sp.name, depth: sp.depth });
  }

  const apply = (ids: string[], ok: (gg: Graph) => boolean, lo: number, hi: number) => {
    const d = derive(g);
    const specs = ids.map((id) => flapSpec(g, d, id)).filter(Boolean) as FlapSpec[];
    if (specs.length !== ids.length) return;
    if (!ok(scaleFlaps(g, specs, lo))) return;
    const k = search(lo, hi, (kk) => ok(scaleFlaps(g, specs, kk)));
    if (Math.abs(k - 1) > 0.01) g = scaleFlaps(g, specs, k < 1 ? k * 0.98 : k);
  };

  // 1. passa da borda
  for (const id of flaps) {
    if (!conflictsOf(g).some((c) => c.face === id && c.kind === 'overhang')) continue;
    apply([id], (gg) => !conflictsOf(gg).some((c) => c.face === id && c.kind === 'overhang'), 0.05, 1);
  }

  // 2. sobreposição entre abas: agrupa quem se sobrepõe e encolhe o grupo junto
  const pairs = conflictsOf(g).filter((c) => c.kind === 'overlap' && flaps.has(c.face) && flaps.has(c.other));
  const group = new Map<string, Set<string>>();
  for (const c of pairs) {
    const set = new Set([...(group.get(c.face) ?? [c.face]), ...(group.get(c.other) ?? [c.other])]);
    for (const id of set) group.set(id, set);
  }
  for (const set of new Set(group.values())) {
    const ids = [...set];
    apply(ids, (gg) => !conflictsOf(gg).some((c) => c.kind === 'overlap' && set.has(c.face) && set.has(c.other)), 0.05, 1);
  }

  // 3. pequena demais
  for (const id of flaps) {
    const sp = flapSpec(g, derive(g), id);
    if (!sp || sp.depth >= MIN_FLAP) continue;
    apply([id], (gg) => !conflictsOf(gg).some((c) => c.face === id || c.other === id), 1, MIN_FLAP / sp.depth);
  }

  // relatório
  const d = derive(g);
  for (const [id, { name, depth }] of depth0) {
    const now = flapSpec(g, d, id)?.depth;
    if (now !== undefined && Math.abs(now - depth) > 0.05)
      changes.push(`Aba "${name}": profundidade ${depth.toFixed(1).replace('.', ',')} → ${now.toFixed(1).replace('.', ',')} mm`);
  }
  return g;
}

/** Correção automática: ângulos/sentidos das dobras e tamanho das abas de cola. */
export function autoFix(g0: Graph, names: Record<string, string>, root?: string): FixResult {
  const d0 = deriveDieline(g0, names, root);
  const conflictsBefore = new Set(findConflicts(d0.faces).map((c) => c.face)).size;
  const changes: string[] = [];

  // 1) ângulos
  const opt = optimizeAngles(d0, g0);
  let g = { ...g0, e: { ...g0.e } };
  if (opt.after < opt.before - 0.5) {
    for (const f of opt.faces) {
      const old = d0.faces.find((x) => x.id === f.id)?.angle ?? 90;
      if (!f.parent || f.angle === old) continue;
      for (const id of hingeEdges(g0, d0.faces.find((x) => x.id === f.id)!)) g.e[id] = { ...g.e[id], angle: f.angle! };
      changes.push(`Dobra "${f.name}": ${old}° → ${f.angle}°${Math.sign(old) !== Math.sign(f.angle!) ? ' (sentido invertido)' : ''}`);
    }
  }

  // 2) abas de cola
  g = fixFlaps(g, names, root, changes);

  const conflictsAfter = new Set(findConflicts(deriveDieline(g, names, root).faces).map((c) => c.face)).size;
  return { graph: g, changes, conflictsBefore, conflictsAfter };
}
