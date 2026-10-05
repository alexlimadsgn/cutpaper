export type Vec2 = [number, number];

/** Painel do molde, derivado do grafo. Coordenadas em mm, eixo Y para baixo (igual ao SVG). */
export interface Face {
  /** Id estável: menor half-edge do contorno (sobrevive a movimentação de vértices). */
  id: string;
  name: string;
  poly: Vec2[];
  holes: Vec2[][];
  area: number;
  /** Face à qual esta está ligada por um vinco (raiz = undefined). */
  parent?: string;
  /** Linha de dobra (vinco) compartilhada com a face-pai. */
  hinge?: [Vec2, Vec2];
  /** Ângulo de dobra final em graus. */
  angle?: number;
}

export interface Dieline {
  faces: Face[];
  /** Linhas de corte encadeadas em polilinhas. */
  cuts: Vec2[][];
  /** Linhas de vinco encadeadas em polilinhas. */
  creases: Vec2[][];
}

export interface BoxParams {
  width: number; // L
  depth: number; // P
  height: number; // A
  tuck: number; // aba de encaixe da tampa
  glue: number; // abas de cola laterais
  thickness: number; // espessura do papel
}
