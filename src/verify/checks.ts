import * as THREE from 'three';
import { center, type ArtObject } from '../art/objects';
import { faceAt } from '../geometry/faces';
import { foldMatrices, type Conflict } from '../geometry/fold';
import type { Graph } from '../geometry/graph';
import { bounds } from '../geometry/outline';
import type { Dieline, Face, Vec2 } from '../geometry/types';
import type { ImageSizes } from './useImageSizes';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  /** Agrupa na lista (ex.: "Montagem", "Área de segurança"). */
  group: string;
  text: string;
  face?: string;
  object?: string;
  /** Correção automática disponível. */
  fix?: 'rotate180';
}

export interface CheckInput {
  dieline: Dieline;
  graph: Graph;
  conflicts: Conflict[];
  objects: ArtObject[];
  faceColors: Record<string, string>;
  faceImages: Record<string, string>;
  fullImage?: string;
  bgColor?: string;
  sizes: ImageSizes;
  /** Distância mínima entre texto e linhas de corte/vinco (mm). */
  margin: number;
  /** Resolução mínima recomendada para impressão. */
  minDpi: number;
}

export const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

const corners = (o: ArtObject): Vec2[] => {
  const [cx, cy] = center(o);
  const a = (o.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const dx = (sx * o.w) / 2, dy = (sy * o.h) / 2;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Vec2;
  });
};

function segDist(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

function segCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

function inside(p: Vec2, poly: Vec2[]) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

/** Menor distância entre a caixa (polígono) e um segmento; 0 se cruzar ou estiver dentro. */
function boxSegDist(box: Vec2[], a: Vec2, b: Vec2) {
  if (inside(a, box) || inside(b, box)) return 0;
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = box[i], q = box[(i + 1) % 4];
    if (segCross(p, q, a, b)) return 0;
    d = Math.min(d, segDist(p, a, b), segDist(q, a, b), segDist(a, p, q), segDist(b, p, q));
  }
  return d;
}

const faceOf = (d: Dieline, o: ArtObject): Face | undefined =>
  d.faces.find((f) => f.id === o.clip) ?? faceAt(d, center(o));

const label = (o: ArtObject) => (o.type === 'text' ? `Texto "${(o.text ?? '').split('\n')[0].slice(0, 24)}"` : o.name);

/** Todas as verificações de pré-impressão e montagem. */
export function runChecks(inp: CheckInput): Issue[] {
  const { dieline: d, graph: g, objects } = inp;
  const issues: Issue[] = [];
  const name = (id: string) => d.faces.find((f) => f.id === id)?.name ?? 'face';
  const visible = objects.filter((o) => !o.hidden);

  // --- montagem ---
  for (const c of inp.conflicts)
    issues.push({
      severity: 'error', group: 'Montagem', face: c.face,
      text: c.kind === 'overlap'
        ? `"${name(c.face)}" sobrepõe "${name(c.other)}" na caixa montada.`
        : `"${name(c.face)}" passa da borda de "${name(c.other)}", onde deveria ser colada.`,
    });
  const roots = d.faces.filter((f) => !f.parent);
  for (const f of [...roots].sort((a, b) => b.area - a.area).slice(1))
    issues.push({ severity: 'error', group: 'Montagem', face: f.id, text: `"${f.name}" não está ligada ao resto por nenhum vinco.` });

  // --- área de segurança: texto perto de corte/vinco ---
  const edges = Object.values(g.e).map((e) => ({ a: [g.v[e.a].x, g.v[e.a].y] as Vec2, b: [g.v[e.b].x, g.v[e.b].y] as Vec2, type: e.type }));
  for (const o of visible.filter((x) => x.type === 'text')) {
    const box = corners(o);
    let best = { d: Infinity, type: 'cut' as string };
    for (const e of edges) {
      const dist = boxSegDist(box, e.a, e.b);
      if (dist < best.d) best = { d: dist, type: e.type };
    }
    if (best.d < inp.margin)
      issues.push({
        severity: 'warning', group: 'Área de segurança', object: o.id, face: o.clip,
        text: best.d === 0
          ? `${label(o)} cruza uma linha de ${best.type === 'cut' ? 'corte' : 'vinco'}.`
          : `${label(o)} está a ${best.d.toFixed(1)} mm de uma linha de ${best.type === 'cut' ? 'corte' : 'vinco'} (mínimo ${inp.margin} mm).`,
      });
  }

  // --- resolução das imagens ---
  const dpiIssue = (src: string, wmm: number, hmm: number, mode: 'stretch' | 'cover', text: string, extra: Partial<Issue>) => {
    const sz = inp.sizes.get(src);
    if (!sz || wmm <= 0 || hmm <= 0) return;
    // cover: a imagem é ampliada até cobrir a área; stretch: ocupa exatamente a caixa
    const dpi = mode === 'cover'
      ? 25.4 / Math.max(wmm / sz.w, hmm / sz.h)
      : Math.min(sz.w / (wmm / 25.4), sz.h / (hmm / 25.4));
    if (dpi < inp.minDpi)
      issues.push({
        severity: dpi < inp.minDpi / 2 ? 'error' : 'warning', group: 'Resolução',
        text: `${text}: ${Math.round(dpi)} dpi no tamanho impresso (recomendado ${inp.minDpi}).`, ...extra,
      });
  };
  for (const o of visible.filter((x) => x.type === 'image' && x.src)) dpiIssue(o.src!, o.w, o.h, 'stretch', o.name, { object: o.id, face: o.clip });
  for (const f of d.faces) {
    const src = inp.faceImages[f.id];
    if (!src) continue;
    const b = bounds([f.poly]);
    dpiIssue(src, b.w, b.h, 'cover', `Imagem da face "${f.name}"`, { face: f.id });
  }
  if (inp.fullImage) {
    const b = bounds(d.faces.map((f) => f.poly));
    dpiIssue(inp.fullImage, b.w, b.h, 'cover', 'Imagem de fundo do molde', {});
  }

  // --- orientação do texto na caixa montada ---
  const mats = foldMatrices(d.faces, 1);
  for (const o of visible.filter((x) => x.type === 'text')) {
    const f = faceOf(d, o);
    if (!f) continue;
    const m = mats.get(f.id)!;
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
    if (Math.abs(normal.z) > 0.7) continue; // fundo/tampa: não há "para cima" definido
    const a = (o.rotation * Math.PI) / 180;
    // "para cima" do texto no papel (Y para baixo) → direção 3D após dobrar; +Z é para cima
    const up = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0).transformDirection(m);
    if (up.z < -0.7)
      issues.push({ severity: 'warning', group: 'Orientação', object: o.id, face: f.id, fix: 'rotate180', text: `${label(o)} fica de cabeça para baixo em "${f.name}" depois de montada.` });
    else if (up.z < 0.7)
      issues.push({ severity: 'warning', group: 'Orientação', object: o.id, face: f.id, text: `${label(o)} fica de lado em "${f.name}" depois de montada.` });
  }

  // --- faces sem arte (só avisa quando já existe alguma arte no projeto) ---
  const hasArt = !!(inp.bgColor || inp.fullImage || visible.length || Object.keys(inp.faceColors).length || Object.keys(inp.faceImages).length);
  if (hasArt && !inp.bgColor && !inp.fullImage) {
    const withObj = new Set(visible.map((o) => faceOf(d, o)?.id).filter(Boolean));
    const free = visible.some((o) => !o.clip);
    const largest = Math.max(...d.faces.map((f) => f.area));
    for (const f of d.faces) {
      // abas pequenas (cola/encaixe) costumam ficar escondidas: ignora
      if (f.area < largest * 0.2) continue;
      if (inp.faceColors[f.id] || inp.faceImages[f.id] || withObj.has(f.id) || free) continue;
      issues.push({ severity: 'info', group: 'Arte', face: f.id, text: `"${f.name}" está sem arte (vai sair branca).` });
    }
  }

  return issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}
