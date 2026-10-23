import { Clipper, FillRule } from 'clipper2-js';
import * as THREE from 'three';
import { polyArea } from './faces';
import { toPaths, fromPaths } from './outline';
import type { Dieline, Face, Vec2 } from './types';

/** Número de etapas de montagem do molde. */
export const stepCount = (faces: Face[]) => Math.max(0, ...faces.map((f) => f.step ?? 0));

/** Quanto (0..1) a face já dobrou quando a montagem inteira está em t (0..1), etapa por etapa. */
export function stepProgress(f: Face, t: number, steps: number) {
  if (!f.step || steps <= 1) return t;
  return Math.max(0, Math.min(1, t * steps - (f.step - 1)));
}

/** Matriz de cada face: compõe as rotações ao longo da árvore de dobras. */
export function foldMatrices(faces: Face[], t: number) {
  const steps = stepCount(faces);
  const byId = new Map(faces.map((f) => [f.id, f]));
  const cache = new Map<string, THREE.Matrix4>();
  const get = (f: Face): THREE.Matrix4 => {
    const hit = cache.get(f.id);
    if (hit) return hit;
    let m = new THREE.Matrix4();
    if (f.parent && f.hinge) {
      const [a, b] = f.hinge;
      const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
      // centroide da face relativo à dobradiça
      const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length - a[0];
      const cy = f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length - a[1];
      // Com Y para baixo, quem olha o SVG vê o lado −Z (lado impresso).
      // A dobra vai para +Z, deixando a impressão do lado de fora.
      if (axis.x * cy - axis.y * cx < 0) axis.negate();
      const angle = THREE.MathUtils.degToRad((f.angle ?? 90) * stepProgress(f, t, steps));
      const local = new THREE.Matrix4()
        .makeTranslation(a[0], a[1], 0)
        .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
        .multiply(new THREE.Matrix4().makeTranslation(-a[0], -a[1], 0));
      m = get(byId.get(f.parent)!).clone().multiply(local);
    }
    cache.set(f.id, m);
    return m;
  };
  return new Map(faces.map((f) => [f.id, get(f)]));
}

/**
 * Como foldMatrices, mas mantendo inteiras as faces ligadas por vincos fora da árvore (fole):
 * os ângulos das faces no caminho entre as duas pontas de cada ligação são ajustados para que o
 * vinco comum continue no mesmo lugar nas duas faces.
 * O caminho da montagem é resolvido uma vez, em pequenos passos que partem do anterior
 * (movimento contínuo, sem tremer), e cada quadro interpola entre os dois passos vizinhos.
 */
const SAMPLES = 400;
const pathCache = new WeakMap<Face[], { free: string[]; solved: Map<string, number>[] }>();

export function foldMatricesLinked(faces: Face[], links: Dieline['links'], t: number) {
  if (!links.length || t >= 1 || t <= 0) return foldMatrices(faces, t);
  const steps = stepCount(faces);
  let cache = pathCache.get(faces);
  if (!cache) {
    // só as duas peças de cada ligação se ajustam (fole e cantos); paredes e telhados seguem a própria
    // dobra — senão o ajuste entortaria o corpo da caixa para fechar o vinco
    // peças marcadas como fole no molde; sem marcação, as duas pontas de cada ligação
    const marked = faces.filter((f) => f.flex).map((f) => f.id);
    const free = new Set<string>(marked.length ? marked : links.flatMap((l) => [l.a, l.b]));
    cache = { free: [...free], solved: [new Map(faces.map((f) => [f.id, 0]))] };
    pathCache.set(faces, cache);
  }
  const { free, solved } = cache;
  const live = faces.map((f) => ({ ...f, step: undefined as number | undefined }));
  const matsFor = (ang: Map<string, number>) => { for (const f of live) f.angle = ang.get(f.id); return foldMatrices(live, 1); };
  const v = new THREE.Vector3(), w = new THREE.Vector3();

  const solveAt = (k: number) => {
    const tk = k / SAMPLES;
    const target = new Map(faces.map((f) => [f.id, (f.angle ?? 90) * stepProgress(f, tk, steps)]));
    // parte do passo anterior: as faces livres continuam de onde estavam
    const ang = new Map(target);
    for (const id of free) ang.set(id, solved[k - 1].get(id)! + (target.get(id)! - (solved[k - 1].get(`~${id}`) ?? 0)));
    // Gauss-Newton (com amortecimento): resíduo = distância entre as duas cópias de cada vinco
    // + um puxão fraco para o andamento normal da dobra (escolhe o ramo natural)
    const W = 1e-2;
    const residual = (): number[] => {
      const m = matsFor(ang);
      const r: number[] = [];
      for (const l of links)
        for (const p of [l.p, l.q]) {
          v.set(p[0], p[1], 0).applyMatrix4(m.get(l.a)!);
          w.set(p[0], p[1], 0).applyMatrix4(m.get(l.b)!);
          r.push(v.x - w.x, v.y - w.y, v.z - w.z);
        }
      for (const id of free) r.push(W * (ang.get(id)! - target.get(id)!));
      return r;
    };
    const n = free.length;
    for (let it = 0; it < 40; it++) {
      const r0 = residual();
      const J: number[][] = [];
      for (const id of free) {
        const old = ang.get(id)!;
        ang.set(id, old + 1e-3);
        const r1 = residual();
        ang.set(id, old);
        J.push(r1.map((x, i) => (x - r0[i]) / 1e-3));
      }
      // (JᵀJ + μI) Δ = −Jᵀ r
      const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J[i].reduce((sum, x, k) => sum + x * J[j][k], 0) + (i === j ? 1e-2 : 0)));
      const g = J.map((col) => -col.reduce((sum, x, k) => sum + x * r0[k], 0));
      for (let i = 0; i < n; i++) {
        let piv = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
        [A[i], A[piv]] = [A[piv], A[i]]; [g[i], g[piv]] = [g[piv], g[i]];
        if (Math.abs(A[i][i]) < 1e-12) continue;
        for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; g[k] -= f * g[i]; }
      }
      const d = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(A[i][i]) < 1e-12) continue;
        let x = g[i];
        for (let j = i + 1; j < n; j++) x -= A[i][j] * d[j];
        d[i] = x / A[i][i];
      }
      // passo limitado (evita saltos de ramo)
      const big = Math.max(...d.map(Math.abs));
      const k = big > 5 ? 5 / big : 1;
      free.forEach((id, i) => ang.set(id, ang.get(id)! + d[i] * k));
      if (big * k < 1e-5) break;
    }
    // perto das dobras de 180° o Gauss-Newton fica mal condicionado: acabamento por coordenadas
    const cost = () => residual().reduce((sum, x) => sum + x * x, 0);
    let best = cost();
    if (best > 1e-3)
      for (let step = 1; step > 1e-3; step /= 2)
        for (let round = 0, improved = true; improved && round < 25; round++) {
          improved = false;
          for (const id of free)
            for (const dd of [step, -step]) {
              const old = ang.get(id)!;
              ang.set(id, old + dd);
              const c = cost();
              if (c < best - 1e-12) { best = c; improved = true; } else ang.set(id, old);
            }
        }
    for (const id of free) ang.set(`~${id}`, target.get(id)!);
    solved[k] = ang;
  };

  const x = t * SAMPLES;
  const k1 = Math.min(SAMPLES, Math.ceil(x));
  for (let k = solved.length; k <= k1; k++) solveAt(k);
  const k0 = Math.floor(x), f = x - k0;
  const a0 = solved[k0], a1 = solved[k1];
  const ang = new Map<string, number>();
  for (const face of faces) ang.set(face.id, a0.get(face.id)! * (1 - f) + a1.get(face.id)! * f);
  return matsFor(ang);
}

export interface Conflict {
  /** Face com problema. */
  face: string;
  /** Face com a qual colide/sobre a qual não cabe. */
  other: string;
  kind: 'overlap' | 'overhang';
  /** Área problemática em mm². */
  area: number;
}

const PLANE_TOL = 0.6; // mm — espessura de papel tolerada entre faces "encostadas"
const MIN_AREA = 1; // mm²

/**
 * Simula a caixa montada (dobra 100%) e procura problemas de colagem entre faces coplanares:
 * - "overhang": a aba encosta em painéis mais próximos da base mas não fica totalmente coberta por eles
 *   (passa da borda de onde seria colada)
 * - "overlap": duas abas equivalentes (mesma profundidade na árvore de dobras, ex.: abas de cola
 *   esquerda e direita) disputam o mesmo lugar. Abas de níveis diferentes podem se empilhar
 *   (ex.: aba da tampa por cima das abas de cola).
 */
export function findConflicts(faces: Face[]): Conflict[] {
  const mats = foldMatrices(faces, 1);
  const byId = new Map(faces.map((f) => [f.id, f]));
  const depth = (f: Face): number => (f.parent ? 1 + depth(byId.get(f.parent)!) : 0);
  // só as folhas da árvore de dobras (abas) são coladas/encaixadas; paredes com filhos não são abas
  const parents = new Set(faces.map((f) => f.parent).filter(Boolean));
  const world = faces.map((f) => {
    const m = mats.get(f.id)!;
    const pts = f.poly.map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(m));
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const box = new THREE.Box3().setFromPoints(pts).expandByScalar(PLANE_TOL);
    return { f, pts, normal, d: normal.dot(pts[0]), box, depth: depth(f), area: Math.abs(f.area), leaf: !parents.has(f.id) };
  });
  type W = (typeof world)[number];

  const coplanar = (A: W, B: W) => {
    if (A.f.parent === B.f.id || B.f.parent === A.f.id || !A.box.intersectsBox(B.box)) return false;
    const dot = A.normal.dot(B.normal);
    return Math.abs(dot) >= 0.999 && Math.abs(A.d - Math.sign(dot) * B.d) <= PLANE_TOL;
  };
  // projeção no plano de A
  const basis = (A: W) => {
    const u = A.pts[1].clone().sub(A.pts[0]).normalize();
    const v = A.normal.clone().cross(u);
    return (pts: THREE.Vector3[]): Vec2[] => pts.map((p) => [p.dot(u), p.dot(v)]);
  };
  const areaOf = (polys: Vec2[][]) => polys.reduce((s, p) => s + Math.abs(polyArea(p)), 0);

  const out: Conflict[] = [];
  for (const A of world) {
    const proj = basis(A);
    const pa = toPaths([proj(A.pts)]);
    const neighbors = world
      .filter((B) => B !== A && coplanar(A, B))
      .map((B) => ({ B, inter: areaOf(fromPaths(Clipper.Intersect(pa, toPaths([proj(B.pts)]), FillRule.NonZero))) }))
      .filter((n) => n.inter >= MIN_AREA);

    // abas irmãs ocupando o mesmo lugar
    for (const { B, inter } of neighbors)
      // (abas que dobram em etapas diferentes se empilham; costas com costas, como alças, se encostam)
      if (B.depth === A.depth && A.f.parent && B.f.parent && A.leaf && B.leaf && A.normal.dot(B.normal) > 0 && (A.f.step ?? 0) === (B.f.step ?? 0)) out.push({ face: A.f.id, other: B.f.id, kind: 'overlap', area: inter });

    // cobertura pelos painéis mais próximos da base em que a aba encosta
    if (!A.leaf) continue;
    const bigger = neighbors.filter((n) => n.B.depth < A.depth || !n.B.leaf);
    if (!bigger.length) continue;
    // a aba precisa ficar dentro da área formada pelos painéis em que encosta (fundo travado,
    // tampas que se encontram no meio…): contorno convexo de todos os vizinhos no mesmo plano
    const support = toPaths([hull(neighbors.flatMap((n) => proj(n.B.pts)))]);
    const covered = areaOf(fromPaths(Clipper.Intersect(pa, support, FillRule.NonZero)));
    const excess = A.area - covered;
    // tolera uma faixa da espessura do papel ao longo da maior borda
    const longest = Math.max(...A.f.poly.map((p, i) => {
      const q = A.f.poly[(i + 1) % A.f.poly.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    }));
    if (excess > Math.max(MIN_AREA, A.area * 0.02, PLANE_TOL * longest)) {
      const main = bigger.reduce((m, n) => (n.inter > m.inter ? n : m), bigger[0]);
      out.push({ face: A.f.id, other: main.B.f.id, kind: 'overhang', area: excess });
    }
  }
  return out;
}

/** Contorno convexo (cadeia monótona). */
function hull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [], up: Vec2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
