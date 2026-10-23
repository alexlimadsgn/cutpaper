import { deg, glueStrip, rect, solveAngle, tab, withOrder, type TFace } from './templates';
import type { BoxParams, Vec2 } from './types';

/*
 * Caixas de papelaria de festa desenhadas para o CutPaper (paramétricas).
 * Todas usam o mesmo corpo: lateral esq. · frente · lateral dir. · traseira em linha (frente = base da dobra),
 * aba de cola numa das pontas e fundo travado de quatro abas.
 */

/** Aba trapezoidal na aresta p0–p1, do lado oposto ao ponto `inside`. */
function outTab(p0: Vec2, p1: Vec2, inside: Vec2, depth: number, inset: number): Vec2[] {
  const t = tab(p0, p1, depth, inset);
  const mid: Vec2 = [(t[2][0] + t[3][0]) / 2, (t[2][1] + t[3][1]) / 2];
  const side = (q: Vec2) => (p1[0] - p0[0]) * (q[1] - p0[1]) - (p1[1] - p0[1]) * (q[0] - p0[0]);
  return Math.sign(side(mid)) === Math.sign(side(inside)) ? tab(p1, p0, depth, inset) : t;
}

const mirrorX = (pts: Vec2[], x0: number): Vec2[] => pts.map(([x, y]) => [2 * x0 - x, y]);

/** Arco de cantos arredondados: pontos de `from` até `to` em volta de `c`. */
function arc(c: Vec2, r: number, from: number, to: number, n = 6): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n;
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as Vec2;
  });
}

/** Retângulo de cantos arredondados (para furos e visores). */
function roundRect(x: number, y: number, w: number, h: number, r: number): Vec2[] {
  r = Math.min(r, w / 2 - 0.1, h / 2 - 0.1);
  const P = Math.PI;
  return [
    ...arc([x + w - r, y + r], r, -P / 2, 0),
    ...arc([x + w - r, y + h - r], r, 0, P / 2),
    ...arc([x + r, y + h - r], r, P / 2, P),
    ...arc([x + r, y + r], r, P, (3 * P) / 2),
  ];
}

/** Curva do coração (t em radianos), com a ponta para baixo (Y do SVG). Largura 32, de −12 a 17. */
const heartPt = (t: number): Vec2 => [
  16 * Math.sin(t) ** 3,
  -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
];

/** Coração inteiro de largura w centrado em (cx, cy). */
function heart(cx: number, cy: number, w: number, n = 48): Vec2[] {
  const k = w / 32;
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = heartPt((i / n) * 2 * Math.PI);
    return [cx + k * x, cy + k * (y - 2.5)] as Vec2;
  });
}

interface Body { W: number; D: number; H: number; G: number; x: number[] }

/** Corpo: quatro paredes em linha e a aba de cola (à esquerda ou à direita). */
function body(p: BoxParams, glue: 'left' | 'right'): { faces: TFace[]; b: Body } {
  const { width: W, depth: D, height: H } = p;
  const G = Math.min(p.glue, D * 0.8);
  const x = [0, D, D + W, 2 * D + W, 2 * D + 2 * W];
  const faces: TFace[] = [
    { id: 'frente', name: 'Frente', poly: rect(x[1], 0, W, H) },
    { id: 'lat-esq', name: 'Lateral esq.', poly: rect(0, 0, D, H), parent: 'frente', hinge: [[x[1], 0], [x[1], H]], angle: 90 },
    { id: 'lat-dir', name: 'Lateral dir.', poly: rect(x[2], 0, D, H), parent: 'frente', hinge: [[x[2], 0], [x[2], H]], angle: 90 },
    { id: 'traseira', name: 'Traseira', poly: rect(x[3], 0, W, H), parent: 'lat-dir', hinge: [[x[3], 0], [x[3], H]], angle: 90 },
    glue === 'left'
      ? { id: 'aba-cola', name: 'Aba de cola', poly: mirrorX(glueStrip(0, 0, H, G), 0), parent: 'lat-esq', hinge: [[0, 0], [0, H]], angle: 90 }
      : { id: 'aba-cola', name: 'Aba de cola', poly: glueStrip(x[4], 0, H, G), parent: 'traseira', hinge: [[x[4], 0], [x[4], H]], angle: 90 },
  ];
  return { faces, b: { W, D, H, G, x } };
}

/**
 * Fundo travado (sem cola): as abas das laterais dobram primeiro, a da frente por cima
 * e a da traseira por último, com um recorte no meio.
 */
function lockBottom({ W, D, H, x }: Body): TFace[] {
  const side = Math.max(4, W / 2 - 1);
  const c = Math.min(side * 0.45, D * 0.3);
  const sideFlap = (x0: number): Vec2[] => [[x0, H], [x0 + D, H], [x0 + D - c, H + side], [x0 + c, H + side]];
  const fd = D * 0.6;
  const c2 = W * 0.18;
  const n0 = x[3] + W * 0.3, n1 = x[3] + W * 0.7;
  return [
    { id: 'fundo-esq', name: 'Fundo esq.', poly: sideFlap(0), parent: 'lat-esq', hinge: [[0, H], [D, H]], angle: 90 },
    { id: 'fundo-dir', name: 'Fundo dir.', poly: sideFlap(x[2]), parent: 'lat-dir', hinge: [[x[2], H], [x[2] + D, H]], angle: 90 },
    { id: 'fundo-frente', name: 'Fundo frente', poly: [[x[1], H], [x[2], H], [x[2] - c2, H + fd], [x[1] + c2, H + fd]], parent: 'frente', hinge: [[x[1], H], [x[2], H]], angle: 90 },
    {
      id: 'fundo-tras', name: 'Fundo traseira', parent: 'traseira', hinge: [[x[3], H], [x[4], H]], angle: 90,
      poly: [[x[3], H], [x[4], H], [x[4], H + fd], [n1, H + fd], [n1, H + fd * 0.55], [n0, H + fd * 0.55], [n0, H + fd], [x[3], H + fd]],
      label: [x[3] + W * 0.15, H + fd * 0.5],
    },
  ];
}

const BOTTOM_ORDER = { 'aba-cola': 1, 'lat-esq': 2, 'lat-dir': 2, traseira: 2, 'fundo-esq': 3, 'fundo-dir': 3, 'fundo-frente': 4, 'fundo-tras': 5 };

/** Alça arredondada com dois furos para fita, presa no alto de um telhado. */
function handle(id: string, x0: number, w: number, y: number, T: number, parent: string, angle: number): TFace {
  const r = Math.min(T * 0.45, 5, w / 4);
  const hr = Math.min(2.2, T * 0.18);
  return {
    id, name: id === 'alca-f' ? 'Alça frente' : 'Alça traseira', parent, angle, hinge: [[x0, y], [x0 + w, y]],
    poly: [[x0, y], [x0 + w, y], ...arc([x0 + w - r, y - T + r], r, 0, -Math.PI / 2), ...arc([x0 + r, y - T + r], r, -Math.PI / 2, -Math.PI)],
    holes: [[x0 + w * 0.36, y - T / 2], [x0 + w * 0.64, y - T / 2]].map(([cx, cy]) => arc([cx, cy], hr, 0, 2 * Math.PI, 16).slice(0, 16)),
    label: [x0 + w / 2, y - T * 0.2],
  };
}

/**
 * Caixa milk: telhado em duas águas que fecha com fole nas laterais (triângulo do meio para dentro,
 * cantos dobrados sobre o telhado) e alças com furos para fita.
 */
export function milkBox(p: BoxParams): TFace[] {
  const { faces, b } = body(p, 'left');
  const { W, D, x, G } = b;
  const R = Math.max(D * 0.6, D / 2 + 2); // altura do telhado (inclinado)
  const T = Math.max(6, p.tuck);
  const alpha = deg(Math.asin(D / (2 * R)));
  const m1 = D / 2, m3 = x[2] + D / 2;
  const g = Math.min(G * 0.5, R / 4);
  faces.push(
    ...lockBottom(b),
    { id: 'telhado-f', name: 'Telhado frente', poly: rect(x[1], -R, W, R), parent: 'frente', hinge: [[x[1], 0], [x[2], 0]], angle: alpha },
    { id: 'telhado-t', name: 'Telhado traseira', poly: rect(x[3], -R, W, R), parent: 'traseira', hinge: [[x[3], 0], [x[4], 0]], angle: alpha },
    handle('alca-f', x[1], W, -R, T, 'telhado-f', -alpha),
    handle('alca-t', x[3], W, -R, T, 'telhado-t', -alpha),
    // fole da lateral esquerda
    { id: 'fole-esq', name: 'Fole esq.', poly: [[0, 0], [D, 0], [m1, -R]], parent: 'lat-esq', hinge: [[0, 0], [D, 0]], angle: alpha },
    {
      id: 'canto-esq-d', name: 'Canto esq. 2', poly: [[m1, -R], [D, 0], [D, -R]], parent: 'telhado-f', hinge: [[D, 0], [D, -R]], angle: 180,
      links: [{ other: 'fole-esq', a: [D, 0], b: [m1, -R] }],
    },
    { id: 'canto-esq-e', name: 'Canto esq. 1', poly: [[0, 0], [m1, -R], [0, -R]], parent: 'fole-esq', hinge: [[0, 0], [m1, -R]], angle: 180 },
    { id: 'cola-alta', name: 'Aba de cola alta', poly: [[0, 0], [0, -R], [-G, -R + g], [-G, -g]], parent: 'canto-esq-e', hinge: [[0, 0], [0, -R]], angle: 180 },
    // fole da lateral direita
    { id: 'fole-dir', name: 'Fole dir.', poly: [[x[2], 0], [x[3], 0], [m3, -R]], parent: 'lat-dir', hinge: [[x[2], 0], [x[3], 0]], angle: alpha },
    {
      id: 'canto-dir-e', name: 'Canto dir. 1', poly: [[x[2], 0], [m3, -R], [x[2], -R]], parent: 'telhado-f', hinge: [[x[2], 0], [x[2], -R]], angle: 180,
      links: [{ other: 'fole-dir', a: [x[2], 0], b: [m3, -R] }],
    },
    {
      id: 'canto-dir-d', name: 'Canto dir. 2', poly: [[m3, -R], [x[3], 0], [x[3], -R]], parent: 'telhado-t', hinge: [[x[3], 0], [x[3], -R]], angle: 180,
      links: [{ other: 'fole-dir', a: [x[3], 0], b: [m3, -R] }],
    },
  );
  // o canto da esquerda (preso só ao fole) vai até o telhado da traseira, onde é colado
  solveAngle(faces, 'canto-esq-e', [0, -R], 'telhado-t', [x[4], -R]);
  return withOrder(faces, {
    ...BOTTOM_ORDER, 'fole-esq': 6, 'fole-dir': 6, 'canto-esq-e': 6, 'canto-esq-d': 6, 'canto-dir-e': 6, 'canto-dir-d': 6, 'cola-alta': 6,
    'telhado-f': 6, 'telhado-t': 6, 'alca-f': 7, 'alca-t': 7,
  });
}

/**
 * Caixa maleta (caixa surpresa), nas proporções do molde de referência:
 * frente · lateral · traseira (com visor) · lateral em linha, aba de cola na frente.
 * Telhados na frente e na traseira com alças de "orelhas"; as laterais sobem em triângulos de ponta
 * redonda com uma fenda que abraça as duas alças juntas. Fundo travado 1-2-3.
 */
export function gableBox(p: BoxParams): TFace[] {
  const { width: W, depth: D, height: H } = p;
  const G = Math.min(p.glue, D * 0.6);
  const x = [0, W, W + D, 2 * W + D, 2 * W + 2 * D];
  const R = Math.max(D * 0.578, D / 2 + 1); // telhado (inclinado)
  const h = Math.sqrt(R * R - (D * D) / 4); // altura do telhado
  const e = Math.min(D * 0.166, W * 0.2); // recuo das pontas do telhado
  const Th = Math.max(8, p.tuck); // altura da alça
  const alpha = deg(Math.asin(D / (2 * R)));
  const gamma = deg(Math.atan(e / h));
  const P = Math.PI;

  const roof = (x0: number): Vec2[] => [[x0, 0], [x0 + W, 0], [x0 + W - e, -R], [x0 + e, -R]];

  // alça: orelhas redondas nas pontas, rampa até o topo reto, recorte para a mão
  const grip = (x0: number, id: string, parent: string): TFace => {
    const w = W - 2 * e, x1 = x0 + w;
    const r = Math.min(D * 0.087, w * 0.12, Th * 0.3);
    const cy = -R - Th * 0.627;
    const top = -R - Th;
    const ramp = 2 * r + Th * 0.216;
    const hw = w * 0.4, hy0 = -R - Th * 0.507, hy1 = -R - 0.8;
    return {
      id, name: id === 'alca-f' ? 'Alça frente' : 'Alça traseira', parent, angle: -alpha, hinge: [[x0, -R], [x1, -R]],
      poly: [
        [x0, -R], [x1, -R],
        ...arc([x1 - r, cy], r, 0, -P), // orelha direita (de baixo para cima, por fora)
        [x1 - ramp, top], [x0 + ramp, top],
        ...arc([x0 + r, cy], r, 0, -P), // orelha esquerda
      ],
      holes: [roundRect(x0 + (w - hw) / 2, hy0, hw, hy1 - hy0, Math.min((hy1 - hy0) * 0.35, hw * 0.12))],
      label: [x0 + r, -R - Th * 0.2],
    };
  };

  // lateral: triângulo de ponta redonda com fenda que prende as alças
  const Ht = D * 0.878, rt = D * 0.12;
  const s0 = Math.hypot(h, e); // altura (no plano do triângulo) do topo do telhado
  const tri = (x0: number, id: string, name: string, parent: string): TFace => {
    const c: Vec2 = [x0 + D / 2, -Ht + rt];
    const th = Math.atan2(Ht, D / 2); // inclinação das bordas
    const a0 = -P / 2 - (P / 2 - th), a1 = -P / 2 + (P / 2 - th);
    const sl = Math.min(D * 0.38, Ht - rt - s0 - 1);
    return {
      id, name, parent, hinge: [[x0, 0], [x0 + D, 0]], angle: gamma,
      poly: [[x0, 0], [x0 + D, 0], ...arc(c, rt, a1, a0, 8)],
      holes: sl > 2 ? [roundRect(x0 + D / 2 - 0.45, -s0 - sl, 0.9, sl, 0.45)] : [],
      label: [x0 + D * 0.3, -2],
    };
  };

  // fundo 1-2-3
  const fd = D * 0.7, rc = D * 0.053, half = D / 2;
  const nx0 = W * 0.25, nx1 = W * 0.75, nd = fd * 0.286;
  const front: Vec2[] = [
    [0, H], [W, H], ...arc([W - rc, H + fd - rc], rc, 0, P / 2, 3), [nx1, H + fd], [nx1, H + fd - nd], [nx0, H + fd - nd], [nx0, H + fd],
    ...arc([rc, H + fd - rc], rc, P / 2, P, 3),
  ];
  const sideR = (x0: number): Vec2[] => [[x0, H], [x0 + D, H], [x0 + D, H + fd], ...arc([x0 + half + rc, H + fd - rc], rc, P / 2, P, 3), [x0 + half, H + half]];
  const sideL = (x0: number): Vec2[] => [[x0, H], [x0 + D, H], [x0 + half, H + half], ...arc([x0 + half - rc, H + fd - rc], rc, 0, P / 2, 3), [x0, H + fd]];
  const tongue = (x0: number): Vec2[] => [
    [x0, H], [x0 + W, H], [x0 + W - half, H + half], ...arc([x0 + W - half - rc, H + fd - rc], rc, 0, P / 2, 3),
    ...arc([x0 + half + rc, H + fd - rc], rc, P / 2, P, 3), [x0 + half, H + half],
  ];

  const vw = W * 0.8, vh = H * 0.667;
  const g = Math.min(G * 0.3, H / 4);
  const faces: TFace[] = [
    { id: 'frente', name: 'Frente', poly: rect(0, 0, W, H) },
    { id: 'lat-dir', name: 'Lateral dir.', poly: rect(x[1], 0, D, H), parent: 'frente', hinge: [[x[1], 0], [x[1], H]], angle: 90 },
    { id: 'traseira', name: 'Traseira', poly: rect(x[2], 0, W, H), parent: 'lat-dir', hinge: [[x[2], 0], [x[2], H]], angle: 90,
      holes: [roundRect(x[2] + (W - vw) / 2, (H - vh) / 2, vw, vh, H * 0.08)], label: [x[2] + W / 2, (H - vh) / 4] },
    { id: 'lat-esq', name: 'Lateral esq.', poly: rect(x[3], 0, D, H), parent: 'traseira', hinge: [[x[3], 0], [x[3], H]], angle: 90 },
    { id: 'aba-cola', name: 'Aba de cola', poly: [[0, 0], [-G, g], [-G, H - g], [0, H]], parent: 'frente', hinge: [[0, 0], [0, H]], angle: 90 },
    { id: 'telhado-f', name: 'Telhado frente', poly: roof(0), parent: 'frente', hinge: [[0, 0], [W, 0]], angle: alpha },
    { id: 'telhado-t', name: 'Telhado traseira', poly: roof(x[2]), parent: 'traseira', hinge: [[x[2], 0], [x[3], 0]], angle: alpha },
    grip(e, 'alca-f', 'telhado-f'),
    grip(x[2] + e, 'alca-t', 'telhado-t'),
    tri(x[1], 'topo-dir', 'Topo dir.', 'lat-dir'),
    tri(x[3], 'topo-esq', 'Topo esq.', 'lat-esq'),
    { id: 'fundo-frente', name: 'Fundo frente', poly: front, parent: 'frente', hinge: [[0, H], [W, H]], angle: 90, label: [W * 0.1, H + fd * 0.5] },
    { id: 'fundo-dir', name: 'Fundo dir.', poly: sideR(x[1]), parent: 'lat-dir', hinge: [[x[1], H], [x[2], H]], angle: 90, label: [x[1] + D * 0.8, H + D * 0.2] },
    { id: 'fundo-tras', name: 'Fundo traseira', poly: tongue(x[2]), parent: 'traseira', hinge: [[x[2], H], [x[3], H]], angle: 90 },
    { id: 'fundo-esq', name: 'Fundo esq.', poly: sideL(x[3]), parent: 'lat-esq', hinge: [[x[3], H], [x[4], H]], angle: 90, label: [x[3] + D * 0.2, H + D * 0.2] },
  ];
  return withOrder(faces, {
    'aba-cola': 1, 'lat-dir': 2, traseira: 2, 'lat-esq': 2, 'fundo-dir': 3, 'fundo-esq': 3, 'fundo-tras': 4, 'fundo-frente': 5,
    'telhado-f': 6, 'telhado-t': 6, 'alca-f': 7, 'alca-t': 7, 'topo-dir': 8, 'topo-esq': 8,
  });
}

/**
 * Caixa coração: tampas da frente e da traseira (metade da profundidade cada) com corações em pé
 * que se encostam no meio; os triângulos das laterais deitam por cima e os corações passam pela fenda.
 */
export function coracaoBox(p: BoxParams): TFace[] {
  const { faces, b } = body(p, 'right');
  const { W, D, H, x } = b;
  const L = D / 2 - 0.5; // cada tampa vai até quase o meio
  const r = Math.min(3, L / 4);
  const lid = (x0: number): Vec2[] => [[x0, 0], [x0 + W, 0], [x0 + W, -L + r], ...arc([x0 + W - r, -L + r], r, 0, -Math.PI / 2), ...arc([x0 + r, -L + r], r, -Math.PI / 2, -Math.PI)];

  // coração em pé: a parte de baixo é cortada numa reta (o vinco), na largura do "pescoço"
  const hw = Math.min(W * 0.55, D * 0.9);
  const k = hw / 32;
  const yc = 9; // altura do corte na curva do coração (de −12 a 17)
  let tc = Math.PI / 2;
  for (let lo = Math.PI / 2, hi = Math.PI, i = 0; i < 40; i++) { tc = (lo + hi) / 2; if (heartPt(tc)[1] < yc) lo = tc; else hi = tc; }
  const heartFlap = (cx: number, id: string, parent: string): TFace => {
    const n = 40;
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const [hx, hy] = heartPt(-tc + (2 * tc * i) / n);
      pts.push([cx + k * hx, -L + k * (hy - yc)]);
    }
    const neck = k * heartPt(tc)[0];
    const inner = heart(cx, -L + k * (-1.5 - yc), hw * 0.42);
    return {
      id, name: id === 'coracao-f' ? 'Coração frente' : 'Coração traseira', parent, angle: -90,
      hinge: [[cx + neck, -L], [cx - neck, -L]], poly: pts, holes: [inner], label: [cx, -L - k * 2],
    };
  };
  const Ht = W - 2; // triângulo deita sobre a tampa, quase até o outro lado
  const tri = (x0: number): Vec2[] => {
    const tip = Math.min(3, D * 0.06);
    return [[x0, 0], [x0 + D, 0], [x0 + D / 2 + tip, -Ht + tip * 0.5], [x0 + D / 2, -Ht], [x0 + D / 2 - tip, -Ht + tip * 0.5]];
  };
  const slit = (x0: number): Vec2[] => roundRect(x0 + D / 2 - 0.7, -Ht * 0.85, 1.4, Ht * 0.7, 0.7);
  faces.push(
    ...lockBottom(b),
    { id: 'tampa-f', name: 'Tampa frente', poly: lid(x[1]), parent: 'frente', hinge: [[x[1], 0], [x[2], 0]], angle: 90, label: [x[1] + W * 0.1, -L / 2] },
    { id: 'tampa-t', name: 'Tampa traseira', poly: lid(x[3]), parent: 'traseira', hinge: [[x[3], 0], [x[4], 0]], angle: 90, label: [x[3] + W * 0.1, -L / 2] },
    heartFlap(x[1] + W / 2, 'coracao-f', 'tampa-f'),
    heartFlap(x[3] + W / 2, 'coracao-t', 'tampa-t'),
    { id: 'topo-esq', name: 'Triângulo esq.', poly: tri(0), parent: 'lat-esq', hinge: [[0, 0], [D, 0]], angle: 90, holes: [slit(0)], label: [D * 0.25, -Ht * 0.1] },
    { id: 'topo-dir', name: 'Triângulo dir.', poly: tri(x[2]), parent: 'lat-dir', hinge: [[x[2], 0], [x[3], 0]], angle: 90, holes: [slit(x[2])], label: [x[2] + D * 0.25, -Ht * 0.1] },
  );
  // visores em coração na frente e na traseira
  for (const id of ['frente', 'traseira']) {
    const f = faces.find((q) => q.id === id)!;
    const x0 = f.poly[0][0];
    f.holes = [heart(x0 + W / 2, H / 2, Math.min(W, H) * 0.55)];
    f.label = [x0 + W * 0.08, H * 0.08];
  }
  return withOrder(faces, {
    'aba-cola': 1, 'lat-esq': 2, 'lat-dir': 2, traseira: 2, 'fundo-esq': 3, 'fundo-dir': 3, 'fundo-frente': 4, 'fundo-tras': 5,
    'tampa-f': 6, 'tampa-t': 6, 'coracao-f': 7, 'coracao-t': 7, 'topo-esq': 8, 'topo-dir': 9,
  });
}

/**
 * Pirâmide alta (obelisco): quatro triângulos em leque + triângulo de cola, base quadrada
 * com aba de encaixe e abas de apoio sob a base.
 */
export function tallPyramid(p: BoxParams): TFace[] {
  const s = p.width, H = p.height;
  const a = s / 2;
  const L = Math.sqrt(H * H + 2 * a * a); // aresta lateral (ponta → canto da base)
  const ht = Math.sqrt(L * L - a * a); // altura de cada triângulo
  const phi = 2 * Math.asin(a / L);
  const th0 = Math.PI / 2 - 2.5 * phi;
  const P = Array.from({ length: 6 }, (_, i) => [L * Math.cos(th0 + i * phi), L * Math.sin(th0 + i * phi)] as Vec2);
  const A: Vec2 = [0, 0];
  const fan = deg(Math.acos((a * a) / (H * H + a * a))); // entre triângulos vizinhos
  const base = 180 - deg(Math.atan2(H, a)); // entre triângulo e base
  // quadrado para fora da aresta P[i]→P[i+1] (longe da ponta)
  const out = (i: number) => {
    const [p0, p1] = [P[i], P[i + 1]];
    const n: Vec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const l = Math.hypot(n[0], n[1]);
    return [n[0] / l, n[1] / l] as Vec2;
  };
  const n2 = out(2);
  const B: Vec2[] = [P[2], P[3], [P[3][0] + n2[0] * s, P[3][1] + n2[1] * s], [P[2][0] + n2[0] * s, P[2][1] + n2[1] * s]];
  const f = Math.min(s * 0.35, 14);
  const t = Math.min(s * 0.3, 12);
  const tuckInset = (t * a) / ht + 1;
  return withOrder([
    { id: 'lado-3', name: 'Lado 3', poly: [A, P[2], P[3]] },
    { id: 'lado-2', name: 'Lado 2', poly: [A, P[1], P[2]], parent: 'lado-3', hinge: [A, P[2]], angle: fan },
    { id: 'lado-4', name: 'Lado 4', poly: [A, P[3], P[4]], parent: 'lado-3', hinge: [A, P[3]], angle: fan },
    { id: 'lado-1', name: 'Lado 1', poly: [A, P[0], P[1]], parent: 'lado-2', hinge: [A, P[1]], angle: fan },
    { id: 'aba-cola', name: 'Aba de cola', poly: [A, P[4], P[5]], parent: 'lado-4', hinge: [A, P[4]], angle: fan },
    { id: 'base', name: 'Base', poly: B, parent: 'lado-3', hinge: [P[2], P[3]], angle: base },
    { id: 'apoio-2', name: 'Apoio 2', poly: outTab(P[1], P[2], A, f, f * 0.8), parent: 'lado-2', hinge: [P[1], P[2]], angle: base },
    { id: 'apoio-4', name: 'Apoio 4', poly: outTab(P[3], P[4], A, f, f * 0.8), parent: 'lado-4', hinge: [P[3], P[4]], angle: base },
    { id: 'aba-base', name: 'Aba da base', poly: outTab(B[2], B[3], P[2], t, tuckInset), parent: 'base', hinge: [B[2], B[3]], angle: base },
  ], { 'lado-2': 1, 'lado-4': 1, 'aba-cola': 2, 'lado-1': 3, 'apoio-2': 4, 'apoio-4': 4, base: 5, 'aba-base': 6 });
}
