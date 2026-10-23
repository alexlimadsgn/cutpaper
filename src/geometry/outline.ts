import { Clipper, FillRule, type Paths64 } from 'clipper2-js';
import type { Dieline, Vec2 } from './types';

const SCALE = 1000; // mm → µm (Clipper trabalha com inteiros)

export const toPaths = (polys: Vec2[][]): Paths64 =>
  polys.map((poly) => Clipper.makePath(poly.flatMap(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)])));

export const fromPaths = (paths: Paths64): Vec2[][] =>
  paths.map((path) => path.map((pt) => [pt.x / SCALE, pt.y / SCALE] as Vec2));

/** Área de material = união das faces menos as janelas (furos). */
export function materialOutline(d: Dieline): Vec2[][] {
  if (!d.faces.length) return [];
  const union = Clipper.Union(toPaths(d.faces.map((f) => f.poly)), undefined, FillRule.NonZero);
  const holes = d.faces.flatMap((f) => f.holes);
  const result = holes.length ? Clipper.Difference(union, toPaths(holes), FillRule.NonZero) : union;
  return fromPaths(result).map(clean).filter((p) => p.length >= 3);
}

/** Remove pontos duplicados e colineares. */
function clean(poly: Vec2[]): Vec2[] {
  let pts = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

const area = (p: Vec2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

/**
 * Sangria = offset do contorno de corte com cantos arredondados:
 * - canto para fora: canto vivo; só vira arco quando a ponta passaria de 2× a sangria (ângulos fechados)
 * - canto para dentro: encontro das duas paralelas; o que passar para dentro do material some
 *   na união com o material, então entalhes estreitos (bico do coração) não deixam linhas cruzadas
 * Nos furos a mesma regra empurra a sangria para dentro do vazio (o furo encolhe).
 * (O InflatePaths do clipper2-js gera geometria inválida, por isso o offset é feito aqui.)
 */
export function bleedOutline(outline: Vec2[][], bleed: number): Vec2[][] {
  if (bleed <= 0 || !outline.length) return outline;
  const outer = outline.reduce((m, p) => (Math.abs(area(p)) > Math.abs(area(m)) ? p : m), outline[0]);
  const sign = area(outer) > 0 ? 1 : -1;
  const raw = outline.map((poly) => {
    const n = poly.length;
    const out: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
      const n1 = normal(a, b, sign), n2 = normal(b, c, sign);
      const dot = n1[0] * n2[0] + n1[1] * n2[1];
      const convex = n1[0] * (c[0] - b[0]) + n1[1] * (c[1] - b[1]) < 0;
      // para dentro (sempre) ou para fora sem ponta longa: encontro das duas paralelas (canto vivo)
      if ((!convex || bleed / Math.sqrt((1 + dot) / 2) <= bleed * 2) && 1 + dot > 1e-6) {
        const k = bleed / (1 + dot);
        out.push([b[0] + (n1[0] + n2[0]) * k, b[1] + (n1[1] + n2[1]) * k]);
        continue;
      }
      // arco de n1 até n2 pelo lado de fora
      const a1 = Math.atan2(n1[1], n1[0]);
      let d = Math.atan2(n2[1], n2[0]) - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 12)));
      for (let k = 0; k <= steps; k++) {
        const t = a1 + (d * k) / steps;
        out.push([b[0] + bleed * Math.cos(t), b[1] + bleed * Math.sin(t)]);
      }
    }
    return out;
  });
  // só conta o que gira no sentido do contorno externo: as pontas de entalhes estreitos viram
  // laços invertidos e somem (a sangria não aparece onde não cabe); depois, união com o material
  const grown = Clipper.Union(toPaths(raw), undefined, sign > 0 ? FillRule.Positive : FillRule.Negative);
  return fromPaths(Clipper.Union(grown, toPaths(outline), FillRule.NonZero)).map(clean).filter((p) => p.length >= 3);
}

function normal(a: Vec2, b: Vec2, sign: number): Vec2 {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [(sign * dy) / len, (-sign * dx) / len];
}


export function bounds(polys: Vec2[][]) {
  if (!polys.some((p) => p.length)) return { minX: 0, minY: 0, maxX: 100, maxY: 100, w: 100, h: 100 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export const polyToPath = (polys: Vec2[][]) =>
  polys.map((p) => 'M' + p.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join(' L') + ' Z').join(' ');

/**
 * Área de arte de cada face: a própria face + a faixa de sangria dos seus lados de CORTE
 * (bordas externas e furos). Nos lados de vinco a arte não avança, para não invadir a vizinha.
 */
export function faceArtRegions(d: Dieline, bleedPolys: Vec2[][], bleed: number): Vec2[][][] {
  if (bleed <= 0 || !bleedPolys.length) return d.faces.map((f) => [f.poly, ...f.holes]);
  const area = toPaths(bleedPolys);
  return d.faces.map((f, i) => {
    const grown = Clipper.Intersect(toPaths(bleedOutline([f.poly], bleed)), area, FillRule.NonZero);
    const others = d.faces.filter((_, j) => j !== i).map((o) => o.poly);
    const region = others.length ? Clipper.Difference(grown, toPaths(others), FillRule.NonZero) : grown;
    const out = fromPaths(region).filter((p) => p.length >= 3);
    return out.length ? out : [f.poly, ...f.holes];
  });
}
