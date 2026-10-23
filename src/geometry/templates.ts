import * as THREE from 'three';
import { graphFromSegments, type Graph, type Seg } from './graph';
import { nameFaces, polyArea } from './faces';
import { foldMatrices } from './fold';
import { coracaoBox, gableBox, milkBox, tallPyramid } from './models';
import type { BoxParams, Face, Vec2 } from './types';

/** Painel de um template: polígono + vinco com a face-pai. */
export interface TFace {
  id: string;
  name: string;
  poly: Vec2[];
  parent?: string;
  hinge?: [Vec2, Vec2];
  angle?: number;
  /** Etapa de montagem (opcional; sem ela a etapa é automática). */
  step?: number;
  /** Furos (ex.: passagem de fita), cortados dentro do painel. */
  holes?: Vec2[][];
  /** Ponto dentro da face para o nome (quando o centro cai fora dela ou num furo). */
  label?: Vec2;
  /**
   * Vincos extras com outras faces (fora da árvore de dobras, ex.: fole da caixa milk).
   * O ângulo é calculado da caixa montada, para a dobra fechar igual pelos dois caminhos.
   */
  links?: { other: string; a: Vec2; b: Vec2 }[];
  /** Peça de fole: na animação os vincos dela se ajustam (ver Edge.flex). */
  flex?: boolean;
}

export const rect = (x: number, y: number, w: number, h: number): Vec2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * Limites físicos das abas da caixa com tampa:
 * - as abas de cola das duas laterais se encontram na frente/traseira → cada uma ≤ metade da largura
 * - a aba da tampa entra na frente → ≤ altura da frente
 */
export function lidBoxLimits(p: BoxParams) {
  const clearance = 1; // folga entre as abas
  return {
    glue: Math.max(0, +(p.width / 2 - clearance).toFixed(2)),
    tuck: Math.max(0, +(p.height - p.thickness - clearance).toFixed(2)),
  };
}

/**
 * Caixa com tampa articulada (estilo "rectangular box" com abas de cola).
 * Fundo no centro; traseira → tampa → aba de encaixe para cima;
 * frente para baixo; laterais para os lados com abas de cola.
 */
export function lidBox(p: BoxParams): TFace[] {
  const { width: W, depth: D, height: H, thickness: t } = p;
  // abas limitadas ao que realmente dá para colar/encaixar
  const lim = lidBoxLimits(p);
  const G = Math.min(p.glue, lim.glue);
  const T = Math.min(p.tuck, lim.tuck);
  const inset = Math.min(G * 0.35, D / 4);
  const tuckInset = Math.min(T * 0.5, W / 6);

  const faces: TFace[] = [
    { id: 'fundo', name: 'Fundo', poly: rect(0, 0, W, D) },
    {
      id: 'traseira', name: 'Traseira', poly: rect(0, -H, W, H),
      parent: 'fundo', hinge: [[0, 0], [W, 0]], angle: 90,
    },
    {
      id: 'tampa', name: 'Tampa', poly: rect(0, -H - D - t, W, D + t),
      parent: 'traseira', hinge: [[0, -H], [W, -H]], angle: 90,
    },
    {
      id: 'aba-tampa', name: 'Aba da tampa',
      poly: [
        [tuckInset, -H - D - t - T],
        [W - tuckInset, -H - D - t - T],
        [W, -H - D - t],
        [0, -H - D - t],
      ],
      parent: 'tampa', hinge: [[0, -H - D - t], [W, -H - D - t]], angle: 90,
    },
    {
      id: 'frente', name: 'Frente', poly: rect(0, D, W, H - t),
      parent: 'fundo', hinge: [[0, D], [W, D]], angle: 90,
    },
    {
      id: 'lateral-esq', name: 'Lateral esq.', poly: rect(-H, 0, H, D),
      parent: 'fundo', hinge: [[0, 0], [0, D]], angle: 90,
    },
    {
      id: 'lateral-dir', name: 'Lateral dir.', poly: rect(W, 0, H, D),
      parent: 'fundo', hinge: [[W, 0], [W, D]], angle: 90,
    },
  ];

  // Abas de cola das laterais (dobram para dentro, coladas na frente/traseira)
  const flap = (id: string, side: 'esq' | 'dir', edge: 'top' | 'bottom'): TFace => {
    const x0 = side === 'esq' ? -H : W;
    const x1 = side === 'esq' ? 0 : W + H;
    const y = edge === 'top' ? 0 : D;
    const dy = edge === 'top' ? -G : G;
    const g = Math.min(G * 0.4, H / 4);
    // chanfro maior do lado oposto ao fundo para não colidir
    const nearIn = side === 'esq' ? x1 : x0;
    const farOut = side === 'esq' ? x0 : x1;
    const s = side === 'esq' ? 1 : -1;
    return {
      id, name: `Aba ${side} ${edge === 'top' ? 'sup.' : 'inf.'}`,
      poly: [
        [farOut, y],
        [farOut + s * g, y + dy],
        [nearIn - s * inset, y + dy],
        [nearIn, y],
      ],
      parent: `lateral-${side}`, hinge: [[x0, y], [x1, y]], angle: 90,
    };
  };
  faces.push(
    flap('aba-esq-sup', 'esq', 'top'),
    flap('aba-esq-inf', 'esq', 'bottom'),
    flap('aba-dir-sup', 'dir', 'top'),
    flap('aba-dir-inf', 'dir', 'bottom'),
  );

  return faces;
}

/** Converte os painéis do template no grafo editável (+ nomes das faces). */
export function buildTemplate(faces: TFace[]): { graph: Graph; names: Record<string, string>; root?: string } {
  const segs: Seg[] = [];
  const ring = (poly: Vec2[]) => poly.forEach((a, i) => segs.push({ a, b: poly[(i + 1) % poly.length], type: 'cut' }));
  for (const f of faces) { ring(f.poly); f.holes?.forEach(ring); }
  for (const f of faces) if (f.hinge) segs.push({ a: f.hinge[0], b: f.hinge[1], type: 'crease', angle: f.angle, step: f.step, flex: f.flex });
  if (faces.some((f) => f.links?.length)) {
    const mats = foldTFaces(faces);
    for (const f of faces)
      for (const l of f.links ?? [])
        segs.push({ a: l.a, b: l.b, type: 'crease', angle: +linkAngle(mats, l.other, f, l.a, l.b).toFixed(2), step: f.step, flex: true });
  }
  const graph = graphFromSegments(segs);
  const labels = faces.map((f) => ({
    name: f.name,
    at: f.label ?? [f.poly.reduce((s, q) => s + q[0], 0) / f.poly.length, f.poly.reduce((s, q) => s + q[1], 0) / f.poly.length] as Vec2,
  }));
  const names = nameFaces(graph, labels);
  // a primeira face do template (sem pai) é a base da dobra
  const root = Object.keys(names).find((k) => names[k] === faces[0].name);
  return { graph, names, root };
}

// ---------- caixa montada a partir dos painéis ----------

const asFace = (f: TFace): Face => ({
  id: f.id, name: f.name, poly: f.poly, holes: [], area: polyArea(f.poly), parent: f.parent, hinge: f.hinge, angle: f.angle,
});
/** Matrizes da caixa montada (100%) direto dos painéis do template. */
export const foldTFaces = (faces: TFace[]) => foldMatrices(faces.map(asFace), 1);

/** Gira o ponto p da face (plano) em torno da dobra a→b pelo ângulo, no mesmo sentido de foldMatrices. */
function hingeRotation(f: TFace, a: Vec2, b: Vec2, angle: number) {
  const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
  const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length - a[0];
  const cy = f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length - a[1];
  if (axis.x * cy - axis.y * cx < 0) axis.negate();
  return { axis, m: new THREE.Matrix4().makeTranslation(a[0], a[1], 0)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(angle)))
    .multiply(new THREE.Matrix4().makeTranslation(-a[0], -a[1], 0)) };
}

/** Ângulo da dobra a→b entre a face `other` e a face `f`, lido da caixa montada. */
function linkAngle(mats: Map<string, THREE.Matrix4>, other: string, f: TFace, a: Vec2, b: Vec2) {
  const inv = mats.get(other)!.clone().invert();
  const { axis } = hingeRotation(f, a, b, 0);
  // vértice de f mais longe da dobra
  const dist = (p: Vec2) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  const p = f.poly.reduce((m, q) => (dist(q) > dist(m) ? q : m), f.poly[0]);
  const q = new THREE.Vector3(p[0], p[1], 0).applyMatrix4(mats.get(f.id)!).applyMatrix4(inv);
  const A = new THREE.Vector3(a[0], a[1], 0);
  const r = new THREE.Vector3(p[0], p[1], 0).sub(A), s = q.sub(A);
  r.addScaledVector(axis, -r.dot(axis));
  s.addScaledVector(axis, -s.dot(axis));
  return THREE.MathUtils.radToDeg(Math.atan2(axis.dot(r.clone().cross(s)), r.dot(s)));
}

/**
 * Confere a caixa montada: cada vinco extra precisa fechar igual pelos dois caminhos da árvore.
 * Devolve a maior diferença (mm) entre as duas posições de um vértice.
 */
export function linkResidual(faces: TFace[]) {
  const mats = foldTFaces(faces);
  let worst = 0;
  for (const f of faces)
    for (const l of f.links ?? []) {
      const ang = linkAngle(mats, l.other, f, l.a, l.b);
      const via = mats.get(l.other)!.clone().multiply(hingeRotation(f, l.a, l.b, ang).m);
      for (const p of f.poly) {
        const v = new THREE.Vector3(p[0], p[1], 0);
        worst = Math.max(worst, v.clone().applyMatrix4(via).distanceTo(v.applyMatrix4(mats.get(f.id)!)));
      }
    }
  return worst;
}

/** Ângulo da dobra de `id` que leva o vértice p dessa face até o vértice q da face `target`. */
export function solveAngle(faces: TFace[], id: string, p: Vec2, target: string, q: Vec2): number {
  const f = faces.find((x) => x.id === id)!;
  const err = (ang: number) => {
    f.angle = ang;
    const m = foldTFaces(faces);
    return new THREE.Vector3(p[0], p[1], 0).applyMatrix4(m.get(id)!).distanceTo(new THREE.Vector3(q[0], q[1], 0).applyMatrix4(m.get(target)!));
  };
  let best = 0, be = Infinity;
  for (let a = -180; a <= 180; a += 1) { const e = err(a); if (e < be) { be = e; best = a; } }
  for (let step = 0.5; step > 0.001; step /= 2)
    for (const a of [best - step, best + step]) { const e = err(a); if (e < be) { be = e; best = a; } }
  f.angle = +best.toFixed(3);
  return f.angle;
}

// ---------- outros modelos ----------

export const deg = (r: number) => (r * 180) / Math.PI;

/** Aba trapezoidal sobre a aresta a→b, para fora do painel (lado esquerdo de a→b, com Y para baixo). */
export function tab(a: Vec2, b: Vec2, depth: number, inset: number): Vec2[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = uy, ny = -ux; // normal à esquerda (no SVG, "para cima" quando a→b vai para a direita)
  const k = Math.min(inset, len / 2 - 0.5);
  return [a, b, [b[0] - ux * k + nx * depth, b[1] - uy * k + ny * depth], [a[0] + ux * k + nx * depth, a[1] + uy * k + ny * depth]];
}

/** Aba de cola vertical à direita de x, de y0 a y1. */
export const glueStrip = (x: number, y0: number, y1: number, G: number): Vec2[] => {
  const c = Math.min(G * 0.45, (y1 - y0) / 4);
  return [[x, y0], [x + G, y0 + c], [x + G, y1 - c], [x, y1]];
};

export const circle = (cx: number, cy: number, r: number, n = 20): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as Vec2);

/** Ordem de montagem por id de face: dobra o corpo, fecha o fundo e só então a tampa. */
export const withOrder = (faces: TFace[], order: Record<string, number>) =>
  faces.map((f) => (f.parent ? { ...f, step: order[f.id] ?? order[f.id.replace(/-\d+$/, '-*')] } : f));

/** Bandeja / cachepô: caixa aberta, paredes com abas de cola. */
export function openBox(p: BoxParams): TFace[] {
  const { width: W, depth: D, height: H } = p;
  return lidBox({ ...p, tuck: 0 })
    .filter((f) => f.id !== 'tampa' && f.id !== 'aba-tampa')
    .map((f) => (f.id === 'frente' ? { ...f, poly: rect(0, D, W, H) } : f));
}
export const openBoxLimits = (p: BoxParams) => ({ glue: Math.max(0, +(p.width / 2 - 1).toFixed(2)), tuck: Infinity });

/**
 * Caixa reta com encaixe nas duas pontas (caixa bala, cubo, embalagem de produto):
 * frente · lateral · traseira · lateral · aba de cola em linha; tampa em cima, fundo embaixo, abas contra pó.
 */
export function tuckEnd(p: BoxParams): TFace[] {
  const { width: W, depth: D, height: H } = p;
  const lim = tuckEndLimits(p);
  const G = Math.min(p.glue, lim.glue);
  const T = Math.min(p.tuck, lim.tuck);
  const dust = Math.max(1, Math.min(D * 0.85, W / 2 - 1));
  const ti = Math.min(T * 0.5, W / 6);
  const x = [0, W, W + D, 2 * W + D];
  const dustFlap = (x0: number, y: number, dir: -1 | 1): Vec2[] => {
    const c = Math.min(D * 0.2, dust * 0.5);
    return [[x0, y], [x0 + c, y + dir * dust], [x0 + D - c * 0.4, y + dir * dust], [x0 + D, y]];
  };
  return withOrder([
    { id: 'frente', name: 'Frente', poly: rect(0, 0, W, H) },
    { id: 'lat-dir', name: 'Lateral dir.', poly: rect(x[1], 0, D, H), parent: 'frente', hinge: [[x[1], 0], [x[1], H]], angle: 90 },
    { id: 'traseira', name: 'Traseira', poly: rect(x[2], 0, W, H), parent: 'lat-dir', hinge: [[x[2], 0], [x[2], H]], angle: 90 },
    { id: 'lat-esq', name: 'Lateral esq.', poly: rect(x[3], 0, D, H), parent: 'traseira', hinge: [[x[3], 0], [x[3], H]], angle: 90 },
    // aba de cola na borda da frente: cola por dentro da lateral esquerda (não disputa lugar com a aba da tampa)
    { id: 'aba-cola', name: 'Aba de cola', poly: glueStrip(0, 0, H, G).map(([px, py]) => [-px, py] as Vec2), parent: 'frente', hinge: [[0, 0], [0, H]], angle: 90 },
    // tampa (presa na traseira) e fundo (preso na frente): encaixe invertido, como nas caixas de farmácia
    { id: 'tampa', name: 'Tampa', poly: rect(x[2], -D, W, D), parent: 'traseira', hinge: [[x[2], 0], [x[2] + W, 0]], angle: 90 },
    {
      id: 'aba-tampa', name: 'Aba da tampa', parent: 'tampa', hinge: [[x[2], -D], [x[2] + W, -D]], angle: 90,
      poly: [[x[2], -D], [x[2] + W, -D], [x[2] + W - ti, -D - T], [x[2] + ti, -D - T]],
    },
    { id: 'base', name: 'Fundo', poly: rect(0, H, W, D), parent: 'frente', hinge: [[0, H], [W, H]], angle: 90 },
    {
      id: 'aba-base', name: 'Aba do fundo', parent: 'base', hinge: [[0, H + D], [W, H + D]], angle: 90,
      poly: [[0, H + D], [W, H + D], [W - ti, H + D + T], [ti, H + D + T]],
    },
    { id: 'po-dir-sup', name: 'Aba pó dir. sup.', poly: dustFlap(x[1], 0, -1), parent: 'lat-dir', hinge: [[x[1], 0], [x[1] + D, 0]], angle: 90 },
    { id: 'po-esq-sup', name: 'Aba pó esq. sup.', poly: dustFlap(x[3], 0, -1), parent: 'lat-esq', hinge: [[x[3], 0], [x[3] + D, 0]], angle: 90 },
    { id: 'po-dir-inf', name: 'Aba pó dir. inf.', poly: dustFlap(x[1], H, 1), parent: 'lat-dir', hinge: [[x[1], H], [x[1] + D, H]], angle: 90 },
    { id: 'po-esq-inf', name: 'Aba pó esq. inf.', poly: dustFlap(x[3], H, 1), parent: 'lat-esq', hinge: [[x[3], H], [x[3] + D, H]], angle: 90 },
  ], {
    'aba-cola': 1, 'lat-dir': 2, traseira: 2, 'lat-esq': 2, 'po-dir-inf': 3, 'po-esq-inf': 3, base: 4, 'aba-base': 5,
    'po-dir-sup': 6, 'po-esq-sup': 6, tampa: 7, 'aba-tampa': 8,
  });
}
export const tuckEndLimits = (p: BoxParams) => ({
  glue: Math.max(0, +(p.depth - 1).toFixed(2)),
  tuck: Math.max(0, +(p.height - 1).toFixed(2)),
});

/** Caixa pirâmide de base quadrada, com furos no topo para amarrar com fita. */
export function pyramid(p: BoxParams): TFace[] {
  const { width: W, height: H } = p;
  const S = Math.hypot(H, W / 2); // altura de cada triângulo
  const angle = +(180 - deg(Math.atan2(2 * H, W))).toFixed(2);
  const r = Math.min(2.5, W / 20);
  const k = Math.min(S * 0.16, 14); // distância do furo até a ponta
  return [
    { id: 'base', name: 'Base', poly: rect(0, 0, W, W) },
    { id: 'tri-sup', name: 'Lado 1', poly: [[0, 0], [W, 0], [W / 2, -S]], parent: 'base', hinge: [[0, 0], [W, 0]], angle, holes: [circle(W / 2, -S + k, r)] },
    { id: 'tri-dir', name: 'Lado 2', poly: [[W, 0], [W + S, W / 2], [W, W]], parent: 'base', hinge: [[W, 0], [W, W]], angle, holes: [circle(W + S - k, W / 2, r)] },
    { id: 'tri-inf', name: 'Lado 3', poly: [[W, W], [W / 2, W + S], [0, W]], parent: 'base', hinge: [[0, W], [W, W]], angle, holes: [circle(W / 2, W + S - k, r)] },
    { id: 'tri-esq', name: 'Lado 4', poly: [[0, W], [-S, W / 2], [0, 0]], parent: 'base', hinge: [[0, 0], [0, W]], angle, holes: [circle(-S + k, W / 2, r)] },
  ];
}

/** Caixa prisma triangular (tubo de 3 lados) com tampas triangulares de encaixe. */
export function prism(p: BoxParams): TFace[] {
  const { width: W, height: L } = p;
  const G = Math.min(p.glue, W * 0.6);
  const h = (W * Math.sqrt(3)) / 2;
  const T = Math.min(p.tuck, h * 0.6);
  const top: Vec2 = [W / 2, -h], bot: Vec2 = [W / 2, L + h];
  return withOrder([
    { id: 'lado-1', name: 'Lado 1', poly: rect(0, 0, W, L) },
    { id: 'lado-2', name: 'Lado 2', poly: rect(W, 0, W, L), parent: 'lado-1', hinge: [[W, 0], [W, L]], angle: 120 },
    { id: 'lado-3', name: 'Lado 3', poly: rect(2 * W, 0, W, L), parent: 'lado-2', hinge: [[2 * W, 0], [2 * W, L]], angle: 120 },
    { id: 'aba-cola', name: 'Aba de cola', poly: glueStrip(3 * W, 0, L, G), parent: 'lado-3', hinge: [[3 * W, 0], [3 * W, L]], angle: 120 },
    { id: 'tampa', name: 'Tampa', poly: [[0, 0], [W, 0], top], parent: 'lado-1', hinge: [[0, 0], [W, 0]], angle: 90 },
    { id: 'aba-tampa', name: 'Aba da tampa', poly: tab(top, [W, 0], T, T * 0.6), parent: 'tampa', hinge: [top, [W, 0]], angle: 90 },
    { id: 'fundo', name: 'Fundo', poly: [[W, L], [0, L], bot], parent: 'lado-1', hinge: [[0, L], [W, L]], angle: 90 },
    { id: 'aba-fundo', name: 'Aba do fundo', poly: tab(bot, [0, L], T, T * 0.6), parent: 'fundo', hinge: [bot, [0, L]], angle: 90 },
  ], { 'aba-cola': 1, 'lado-2': 2, 'lado-3': 2, fundo: 3, 'aba-fundo': 4, tampa: 5, 'aba-tampa': 6 });
}

/** Caixa sextavada: 6 paredes em linha, tampa e fundo hexagonais com aba de encaixe. */
export function hexBox(p: BoxParams): TFace[] {
  const { width: S, height: H } = p;
  const G = Math.min(p.glue, S * 0.8);
  const h = (S * Math.sqrt(3)) / 2;
  const T = Math.min(p.tuck, H - 1, S * 0.8);
  const faces: TFace[] = [];
  for (let i = 0; i < 6; i++) {
    const x = i * S;
    faces.push({
      id: `parede-${i + 1}`, name: `Parede ${i + 1}`, poly: rect(x, 0, S, H),
      ...(i ? { parent: `parede-${i}`, hinge: [[x, 0], [x, H]] as [Vec2, Vec2], angle: 60 } : {}),
    });
  }
  faces.push({ id: 'aba-cola', name: 'Aba de cola', poly: glueStrip(6 * S, 0, H, G), parent: 'parede-6', hinge: [[6 * S, 0], [6 * S, H]], angle: 60 });
  const hex = (y: number, dir: -1 | 1): Vec2[] => [[0, y], [S, y], [1.5 * S, y + dir * h], [S, y + dir * 2 * h], [0, y + dir * 2 * h], [-0.5 * S, y + dir * h]];
  const ti = Math.min(T * 0.5, S / 5);
  faces.push(
    { id: 'tampa', name: 'Tampa', poly: hex(0, -1), parent: 'parede-1', hinge: [[0, 0], [S, 0]], angle: 90 },
    { id: 'aba-tampa', name: 'Aba da tampa', poly: [[S, -2 * h], [0, -2 * h], [ti, -2 * h - T], [S - ti, -2 * h - T]], parent: 'tampa', hinge: [[0, -2 * h], [S, -2 * h]], angle: 90 },
    { id: 'fundo', name: 'Fundo', poly: hex(H, 1), parent: 'parede-1', hinge: [[0, H], [S, H]], angle: 90 },
    { id: 'aba-fundo', name: 'Aba do fundo', poly: [[0, H + 2 * h], [S, H + 2 * h], [S - ti, H + 2 * h + T], [ti, H + 2 * h + T]], parent: 'fundo', hinge: [[0, H + 2 * h], [S, H + 2 * h]], angle: 90 },
  );
  return withOrder(faces, { 'aba-cola': 1, 'parede-*': 2, fundo: 3, 'aba-fundo': 4, tampa: 5, 'aba-tampa': 6 });
}

export type ParamKey = keyof BoxParams;
export interface ParamField { key: ParamKey; prefix: string; title: string; step?: number }

const F = {
  W: { key: 'width', prefix: 'L', title: 'Largura (mm)' },
  D: { key: 'depth', prefix: 'P', title: 'Profundidade (mm)' },
  H: { key: 'height', prefix: 'A', title: 'Altura (mm)' },
  tuck: { key: 'tuck', prefix: 'Aba tampa', title: 'Aba de encaixe da tampa (mm)' },
  glue: { key: 'glue', prefix: 'Abas cola', title: 'Abas de cola (mm)' },
  t: { key: 'thickness', prefix: 'Espessura', title: 'Espessura do papel (mm)', step: 0.1 },
} satisfies Record<string, ParamField>;

interface TemplateDef {
  name: string;
  build: (p: BoxParams) => ReturnType<typeof buildTemplate>;
  limits: (p: BoxParams) => { glue: number; tuck: number };
  fields: ParamField[];
}

const def = (name: string, fn: (p: BoxParams) => TFace[], limits: TemplateDef['limits'], fields: ParamField[]): TemplateDef =>
  ({ name, build: (p) => buildTemplate(fn(p)), limits, fields });

const noLimits = () => ({ glue: Infinity, tuck: Infinity });

export const TEMPLATES = {
  lidBox: def('Caixa com tampa', lidBox, lidBoxLimits, [F.W, F.D, F.H, F.tuck, F.glue, F.t]),
  tuckEnd: def('Caixa reta (encaixe)', tuckEnd, tuckEndLimits, [F.W, F.D, F.H, F.tuck, F.glue]),
  openBox: def('Bandeja / cachepô', openBox, openBoxLimits, [F.W, F.D, F.H, F.glue]),
  pyramid: def('Caixa pirâmide', pyramid, noLimits, [{ ...F.W, prefix: 'Base', title: 'Lado da base (mm)' }, F.H]),
  prism: def('Caixa prisma', prism, noLimits, [{ ...F.W, prefix: 'Lado', title: 'Lado do triângulo (mm)' }, { ...F.H, prefix: 'C', title: 'Comprimento (mm)' }, F.tuck, F.glue]),
  hexBox: def('Caixa sextavada', hexBox, noLimits, [{ ...F.W, prefix: 'Lado', title: 'Lado do hexágono (mm)' }, F.H, F.tuck, F.glue]),
  milk: def('Caixa milk', milkBox, noLimits, [F.W, F.D, F.H, { ...F.tuck, prefix: 'Alça', title: 'Altura da alça (mm)' }, F.glue]),
  gable: def('Caixa maleta', gableBox, noLimits, [F.W, F.D, F.H, { ...F.tuck, prefix: 'Alça', title: 'Altura da alça (mm)' }, F.glue]),
  heart: def('Caixa coração', coracaoBox, noLimits, [F.W, F.D, F.H, F.glue]),
  tallPyramid: def('Pirâmide alta', tallPyramid, noLimits, [{ ...F.W, prefix: 'Base', title: 'Lado da base (mm)' }, F.H]),
};
export type TemplateId = keyof typeof TEMPLATES;

/** Modelos prontos da galeria inicial (um modelo paramétrico + medidas). */
export interface Preset { id: string; name: string; desc: string; template: TemplateId; params: Partial<BoxParams> }
export const PRESETS: Preset[] = [
  { id: 'lid', name: 'Caixa com tampa', desc: 'Presente, kit, lembrancinha', template: 'lidBox', params: { width: 100, depth: 80, height: 40, tuck: 15, glue: 20 } },
  { id: 'cube', name: 'Caixa cubo', desc: 'Lembrancinha, doces', template: 'tuckEnd', params: { width: 50, depth: 50, height: 50, tuck: 12, glue: 12 } },
  { id: 'candy', name: 'Caixa bala', desc: 'Embalagem reta, sabonete, bombom', template: 'tuckEnd', params: { width: 50, depth: 25, height: 90, tuck: 12, glue: 12 } },
  { id: 'tray', name: 'Cachepô', desc: 'Centro de mesa, porta-doces', template: 'openBox', params: { width: 60, depth: 60, height: 60, glue: 18 } },
  { id: 'pyramid', name: 'Caixa pirâmide', desc: 'Festa, fechada com fita', template: 'pyramid', params: { width: 50, height: 60 } },
  { id: 'prism', name: 'Caixa prisma', desc: 'Chocolate, tubete triangular', template: 'prism', params: { width: 45, height: 120, tuck: 12, glue: 12 } },
  { id: 'milk', name: 'Caixa milk', desc: 'Lembrancinha de festa com alça', template: 'milk', params: { width: 60, depth: 60, height: 90, tuck: 14, glue: 12 } },
  { id: 'gable', name: 'Caixa maleta', desc: 'Caixa surpresa com alça e visor', template: 'gable', params: { width: 88, depth: 44, height: 53, tuck: 22, glue: 13 } },
  { id: 'heart', name: 'Caixa coração', desc: 'Corações no topo e visor', template: 'heart', params: { width: 62, depth: 62, height: 62, glue: 12 } },
  { id: 'tallPyramid', name: 'Pirâmide alta', desc: 'Obelisco para doces e bombons', template: 'tallPyramid', params: { width: 55, height: 110 } },
  { id: 'hex', name: 'Caixa sextavada', desc: 'Brinde, vela, doces finos', template: 'hexBox', params: { width: 30, height: 45, tuck: 12, glue: 12 } },
];
