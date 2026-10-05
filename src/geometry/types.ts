export type Vec2 = [number, number];

/** Painel do molde. Coordenadas em mm, eixo Y para baixo (igual ao SVG). */
export interface Face {
  id: string;
  name: string;
  poly: Vec2[];
  /** Face à qual esta está ligada por um vinco (raiz = undefined). */
  parent?: string;
  /** Linha de dobra (vinco) compartilhada com a face-pai. */
  hinge?: [Vec2, Vec2];
  /** Ângulo de dobra final em graus. */
  angle?: number;
}

export interface Crease {
  a: Vec2;
  b: Vec2;
}

export interface Dieline {
  faces: Face[];
  creases: Crease[];
}

export interface BoxParams {
  width: number; // L
  depth: number; // P
  height: number; // A
  tuck: number; // aba de encaixe da tampa
  glue: number; // abas de cola laterais
  thickness: number; // espessura do papel
}
