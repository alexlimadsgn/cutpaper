import type { Vec2 } from '../geometry/types';

/** Folhas comuns na papelaria (mm, retrato). */
export const PAPERS = [
  { id: 'a4', name: 'A4', w: 210, h: 297 },
  { id: 'a3', name: 'A3', w: 297, h: 420 },
  { id: 'letter', name: 'Carta', w: 215.9, h: 279.4 },
  { id: 'legal', name: 'Ofício', w: 215.9, h: 355.6 },
  { id: 'sra3', name: 'SRA3 (32 × 45)', w: 320, h: 450 },
  { id: 'g33', name: '33 × 48', w: 330, h: 480 },
  { id: 'custom', name: 'Personalizado', w: 0, h: 0 },
] as const;
export type PaperId = (typeof PAPERS)[number]['id'];

export interface ImposeOptions {
  /** Tamanho da folha em mm (retrato; a orientação é escolhida automaticamente). */
  sheetW: number;
  sheetH: number;
  /** Margem não imprimível da impressora (mm). */
  margin: number;
  /** Espaço entre as peças (mm). */
  gap: number;
  /** Quantidade de peças (0 = preencher uma folha). */
  quantity: number;
  /** Permite girar a peça 90° para caber mais. */
  rotate: boolean;
}

/** Posição de uma peça na folha: canto superior esquerdo da caixa ocupada (mm, Y para baixo). */
export interface Place { x: number; y: number; rot: 0 | 90 }

export interface Layout {
  pageW: number;
  pageH: number;
  perPage: Place[];
  pages: number;
  /** Peças na última folha. */
  lastCount: number;
  total: number;
  /** Fração da área útil coberta pelas peças (aproveitamento). */
  usage: number;
}

/** Distribui a peça (caixa w × h) em grade, testando orientação da folha e giro da peça. */
export function layoutSheet(pieceW: number, pieceH: number, o: ImposeOptions): Layout {
  let best: { pageW: number; pageH: number; cols: number; rows: number; rot: 0 | 90; n: number } | undefined;
  const sheets: [number, number][] = [[o.sheetW, o.sheetH], [o.sheetH, o.sheetW]];
  for (const [pageW, pageH] of sheets)
    for (const rot of (o.rotate ? [0, 90] : [0]) as (0 | 90)[]) {
      const w = rot ? pieceH : pieceW, h = rot ? pieceW : pieceH;
      const aw = pageW - 2 * o.margin, ah = pageH - 2 * o.margin;
      const cols = Math.max(0, Math.floor((aw + o.gap) / (w + o.gap) + 1e-9));
      const rows = Math.max(0, Math.floor((ah + o.gap) / (h + o.gap) + 1e-9));
      const n = cols * rows;
      // empate: prefere a folha em retrato e a peça sem giro (ordem do laço)
      if (!best || n > best.n) best = { pageW, pageH, cols, rows, rot, n };
    }
  const b = best!;
  const w = b.rot ? pieceH : pieceW, h = b.rot ? pieceW : pieceH;
  const want = o.quantity > 0 ? o.quantity : b.n;
  const perPageN = Math.min(b.n, want);
  // centraliza só as linhas/colunas usadas
  const usedCols = Math.min(b.cols, perPageN);
  const usedRows = Math.ceil(perPageN / Math.max(1, b.cols));
  const x0 = (b.pageW - (usedCols * w + (usedCols - 1) * o.gap)) / 2;
  const y0 = (b.pageH - (usedRows * h + (usedRows - 1) * o.gap)) / 2;
  const perPage: Place[] = [];
  for (let i = 0; i < perPageN; i++) {
    const c = i % b.cols, r = Math.floor(i / b.cols);
    perPage.push({ x: x0 + c * (w + o.gap), y: y0 + r * (h + o.gap), rot: b.rot });
  }
  const pages = b.n ? Math.ceil(want / b.n) : 0;
  const lastCount = b.n ? want - (pages - 1) * b.n : 0;
  const usage = b.n ? (perPageN * pieceW * pieceH) / ((b.pageW - 2 * o.margin) * (b.pageH - 2 * o.margin)) : 0;
  return { pageW: b.pageW, pageH: b.pageH, perPage, pages, lastCount, total: b.n ? want : 0, usage };
}

/**
 * Leva um ponto do molde (mm) para a folha. `vb` = [x, y, w, h] da caixa da peça.
 * Giro de 90° no sentido horário.
 */
export const placePoint = (vb: number[], pl: Place) => ([X, Y]: Vec2): Vec2 => {
  const lx = X - vb[0], ly = Y - vb[1];
  return pl.rot ? [pl.x + vb[3] - ly, pl.y + lx] : [pl.x + lx, pl.y + ly];
};
