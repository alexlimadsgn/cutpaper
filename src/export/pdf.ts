import {
  PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFOperatorNames as Ops, type PDFRef,
} from 'pdf-lib';
import { ensureFonts } from '../art/fonts';
import type { ArtObject } from '../art/objects';
import { bleedOutline, materialOutline } from '../geometry/outline';
import type { Dieline, Vec2 } from '../geometry/types';
import { buildBackSvg, buildSvg, viewBoxOf } from './svg';

export interface PdfInput {
  dieline: Dieline;
  bleed: number;
  fullImage?: string;
  faceImages: Record<string, string>;
  faceColors?: Record<string, string>;
  bgColor?: string;
  objects: ArtObject[];
  /** Arte do interior (verso). Se houver, vira a página 2. */
  interior?: { bgColor?: string; fullImage?: string; faceColors: Record<string, string>; faceImages: Record<string, string> };
  /** Resolução da arte rasterizada. */
  dpi?: number;
}

const PT = 72 / 25.4; // pontos por mm

/** Rasteriza só a camada de arte (fundo transparente) para PNG. */
async function rasterArt(inp: PdfInput, vb: number[], dpi: number, svgOverride?: string): Promise<Uint8Array> {
  const svg = svgOverride ?? buildSvg({ ...inp, layers: { artwork: true, bleed: false, cut: false, crease: false } });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = url; });
    // limita o tamanho do canvas (memória do navegador)
    const scale = Math.min(dpi / 25.4, 12000 / Math.max(vb[2], vb[3]));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vb[2] * scale);
    canvas.height = Math.round(vb[3] * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PDF para gráfica/plotter, 1:1 em mm:
 * - camada "Arte": arte em PNG (300 dpi), com texto já em contornos
 * - camadas "Corte" e "Vinco": vetores em cores especiais (Separation) "CutContour" e "Crease",
 *   o padrão lido por RIPs de plotters de recorte (Roland, Mimaki, Summa, Graphtec…)
 * - camada "Sangria (guia)": linha de referência, desligada e não impressa por padrão
 */
export async function buildPdf(inp: PdfInput): Promise<Uint8Array> {
  await ensureFonts(inp.objects);
  const material = materialOutline(inp.dieline);
  const bl = bleedOutline(material, inp.bleed);
  const vb = viewBoxOf(bl.length ? bl : material);
  const [vx, vy, vw, vh] = vb;

  const pdf = await PDFDocument.create();
  pdf.setTitle('CutPaper — molde');
  pdf.setCreator('CutPaper');
  const page = pdf.addPage([vw * PT, vh * PT]);
  const ctx = pdf.context;

  // camadas (Optional Content Groups)
  const layer = (name: string) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) }));
  const L = { art: layer('Arte'), bleed: layer('Sangria (guia)'), cut: layer('Corte'), crease: layer('Vinco') };
  const order: PDFRef[] = [L.art, L.bleed, L.cut, L.crease];
  pdf.catalog.set(
    PDFName.of('OCProperties'),
    ctx.obj({ OCGs: order, D: { Order: order, ON: [L.art, L.cut, L.crease], OFF: [L.bleed] } }),
  );

  // cores especiais: tinta 100% → CMYK de pré-visualização
  const separation = (name: string, cmyk: number[]) =>
    ctx.obj(['Separation', name, 'DeviceCMYK', { FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: cmyk, N: 1 }]);
  const res = page.node.Resources()!;
  res.set(PDFName.of('Properties'), ctx.obj({ OCArt: L.art, OCBleed: L.bleed, OCCut: L.cut, OCCrease: L.crease }));
  res.set(PDFName.of('ColorSpace'), ctx.obj({
    CSCut: separation('CutContour', [0, 1, 0, 0]),
    CSCrease: separation('Crease', [1, 0, 0, 0]),
    CSGuide: separation('Bleed', [1, 0, 1, 0]),
  }));

  const op = (name: Ops, ...args: (number | string)[]) =>
    PDFOperator.of(name, args.map((a) => (typeof a === 'number' ? PDFNumber.of(a) : PDFName.of(a))));
  // mm (Y para baixo) → pontos PDF (Y para cima)
  const P = ([x, y]: Vec2) => [+((x - vx) * PT).toFixed(3), +((vy + vh - y) * PT).toFixed(3)];
  const begin = (oc: string) => PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of('OC'), PDFName.of(oc)]);
  const end = () => PDFOperator.of(Ops.EndMarkedContent);

  const strokeLayer = (oc: string, cs: string, lines: Vec2[][], closed = false) => {
    if (!lines.length) return;
    const ops: PDFOperator[] = [begin(oc), PDFOperator.of(Ops.PushGraphicsState), op(Ops.StrokingColorspace, cs), op(Ops.StrokingColorN, 1), op(Ops.SetLineWidth, 0.25)];
    for (const line of lines) {
      line.forEach((p, i) => ops.push(op(i ? Ops.LineTo : Ops.MoveTo, ...P(p))));
      if (closed) ops.push(PDFOperator.of(Ops.ClosePath));
      ops.push(PDFOperator.of(Ops.StrokePath));
    }
    ops.push(PDFOperator.of(Ops.PopGraphicsState), end());
    page.pushOperators(...ops);
  };

  // arte
  const png = await pdf.embedPng(await rasterArt(inp, vb, inp.dpi ?? 300));
  page.pushOperators(begin('OCArt'));
  page.drawImage(png, { x: 0, y: 0, width: vw * PT, height: vh * PT });
  page.pushOperators(end());

  strokeLayer('OCBleed', 'CSGuide', bl, true);
  strokeLayer('OCCut', 'CSCut', inp.dieline.cuts);
  strokeLayer('OCCrease', 'CSCrease', inp.dieline.creases);

  // página 2: verso (interior), espelhado para impressão frente e verso virando pela borda longa
  const inside = inp.interior;
  const hasBack = inside && (inside.bgColor || inside.fullImage || Object.keys(inside.faceColors).length ||
    Object.keys(inside.faceImages).length || inp.objects.some((o) => o.side === 'in'));
  if (hasBack) {
    const backSvg = buildBackSvg({ dieline: inp.dieline, bleed: inp.bleed, art: inside!, objects: inp.objects, guides: false });
    const backPng = await pdf.embedPng(await rasterArt(inp, vb, inp.dpi ?? 300, backSvg));
    const back = pdf.addPage([vw * PT, vh * PT]);
    back.node.Resources()!.set(PDFName.of('Properties'), ctx.obj({ OCArt: L.art }));
    back.pushOperators(begin('OCArt'));
    back.drawImage(backPng, { x: 0, y: 0, width: vw * PT, height: vh * PT });
    back.pushOperators(end());
  }

  // sem object streams: mais compatível com RIPs e softwares de plotter antigos
  return pdf.save({ useObjectStreams: false });
}
