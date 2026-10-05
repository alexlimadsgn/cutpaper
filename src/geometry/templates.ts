import { graphFromSegments, type Graph, type Seg } from './graph';
import { nameFaces } from './faces';
import type { BoxParams, Vec2 } from './types';

/** Painel de um template: polígono + vinco com a face-pai. */
interface TFace {
  id: string;
  name: string;
  poly: Vec2[];
  parent?: string;
  hinge?: [Vec2, Vec2];
  angle?: number;
}

const rect = (x: number, y: number, w: number, h: number): Vec2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * Caixa com tampa articulada (estilo "rectangular box" com abas de cola).
 * Fundo no centro; traseira → tampa → aba de encaixe para cima;
 * frente para baixo; laterais para os lados com abas de cola.
 */
export function lidBox(p: BoxParams): TFace[] {
  const { width: W, depth: D, height: H, tuck: T, glue: G, thickness: t } = p;
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
  for (const f of faces)
    f.poly.forEach((a, i) => segs.push({ a, b: f.poly[(i + 1) % f.poly.length], type: 'cut' }));
  for (const f of faces) if (f.hinge) segs.push({ a: f.hinge[0], b: f.hinge[1], type: 'crease', angle: f.angle });
  const graph = graphFromSegments(segs);
  const labels = faces.map((f) => ({
    name: f.name,
    at: [f.poly.reduce((s, q) => s + q[0], 0) / f.poly.length, f.poly.reduce((s, q) => s + q[1], 0) / f.poly.length] as Vec2,
  }));
  const names = nameFaces(graph, labels);
  // a primeira face do template (sem pai) é a base da dobra
  const root = Object.keys(names).find((k) => names[k] === faces[0].name);
  return { graph, names, root };
}

export const TEMPLATES = {
  lidBox: { name: 'Caixa com tampa', build: (p: BoxParams) => buildTemplate(lidBox(p)) },
} as const;
export type TemplateId = keyof typeof TEMPLATES;
