import { deriveDieline, flapIds } from '../geometry/faces';
import { normalize, type Graph } from '../geometry/graph';
import type { Face, Vec2 } from '../geometry/types';

export interface RectifyResult {
  graph: Graph;
  reference: string;
  /** Faces refeitas como retângulo / reposicionadas proporcionalmente. */
  rebuilt: number;
  moved: number;
  /** Faces não alcançadas pelos vincos a partir da referência (ficam como estão). */
  unreached: string[];
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const unit = (a: Vec2): Vec2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const rot90 = (a: Vec2): Vec2 => [-a[1], a[0]];

/** Índices dos cantos reais do polígono (descarta pontos quase colineares). */
function corners(poly: Vec2[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i - 1 + poly.length) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
    const u = unit(sub(a, b)), v = unit(sub(c, b));
    if (Math.abs(cross(u, v)) > Math.sin((3 * Math.PI) / 180)) out.push(i);
  }
  return out;
}

/** Maior desvio de 90° entre os cantos de um quadrilátero (∞ se não for quadrilátero). */
function rectDeviation(f: Face): number {
  const c = corners(f.poly);
  if (c.length !== 4) return Infinity;
  let worst = 0;
  for (let k = 0; k < 4; k++) {
    const a = f.poly[c[(k + 3) % 4]], b = f.poly[c[k]], d = f.poly[c[(k + 1) % 4]];
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(a, b)), unit(sub(d, b)))))) * 180) / Math.PI;
    worst = Math.max(worst, Math.abs(ang - 90));
  }
  return worst;
}

/** Leva cada ponto do polígono original para o novo, pelos cantos (pontos nos lados seguem proporcionalmente). */
function mapByCorners(poly: Vec2[], cIdx: number[], newCorners: Vec2[]): Vec2[] {
  return poly.map((p, i) => {
    const k = cIdx.indexOf(i);
    if (k >= 0) return newCorners[k];
    // ponto sobre o lado entre os cantos k e k+1
    for (let j = 0; j < cIdx.length; j++) {
      const a = poly[cIdx[j]], b = poly[cIdx[(j + 1) % cIdx.length]];
      const ab = sub(b, a);
      const t = dot(sub(p, a), ab) / (dot(ab, ab) || 1);
      if (t > -1e-6 && t < 1 + 1e-6 && Math.abs(cross(unit(ab), sub(p, a))) < 0.5) {
        const na = newCorners[j], nb = newCorners[(j + 1) % cIdx.length];
        return add(na, mul(sub(nb, na), t));
      }
    }
    return p;
  });
}

/**
 * "Endireita" um molde deformado: a face de referência vira retângulo alinhado aos eixos e,
 * seguindo os vincos, cada painel de 4 cantos é refeito como retângulo sobre a dobra já corrigida
 * (mantendo a profundidade; painéis gêmeos em lados opostos usam a medida do menos deformado).
 * Abas e faces de outro formato são reposicionadas proporcionalmente sobre a nova dobra.
 */
export function rectify(g0: Graph, names: Record<string, string>, root: string | undefined, referenceId?: string): RectifyResult {
  const d = deriveDieline(g0, names, root);
  const byId = new Map(d.faces.map((f) => [f.id, f]));
  const key = (p: Vec2) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const vid = new Map(Object.keys(g0.v).map((id) => [key([g0.v[id].x, g0.v[id].y]), id]));
  const idOf = (p: Vec2) => vid.get(key(p));

  // vizinhança por vinco: face → [vizinha, vértices compartilhados]
  const nb = new Map<string, Map<string, Set<string>>>();
  for (const [eid, owners] of Object.entries(d.edgeFaces)) {
    const e = g0.e[eid];
    if (!e || e.type !== 'crease' || owners.length < 2 || owners[0] === owners[1]) continue;
    const [A, B] = owners;
    for (const [x, y] of [[A, B], [B, A]]) {
      if (!nb.has(x)) nb.set(x, new Map());
      const set = nb.get(x)!.get(y) ?? new Set<string>();
      set.add(e.a); set.add(e.b);
      nb.get(x)!.set(y, set);
    }
  }

  // referência: a selecionada ou a mais retangular (desempate: maior área)
  const ref = (referenceId && byId.get(referenceId)) ||
    [...d.faces].sort((a, b) => rectDeviation(a) - rectDeviation(b) || Math.abs(b.area) - Math.abs(a.area))[0];

  const placed = new Map<string, Vec2>();
  const place = (f: Face, newPoly: Vec2[]) =>
    f.poly.forEach((p, i) => { const id = idOf(p); if (id && !placed.has(id)) placed.set(id, newPoly[i]); });

  // profundidade original de uma face em relação à dobra com a vizinha já posicionada
  const hingeOf = (n: Face, shared: Set<string>) => {
    const pts = [...shared].map((id) => [g0.v[id].x, g0.v[id].y] as Vec2);
    const dir = unit(sub(pts[pts.length - 1], pts[0]));
    pts.sort((a, b) => dot(a, dir) - dot(b, dir));
    return { P0: pts[0], Q0: pts[pts.length - 1], ids: [idOf(pts[0])!, idOf(pts[pts.length - 1])!], n };
  };
  /**
   * Profundidade do painel (distância entre a dobra e a borda oposta), a partir dos dois lados:
   * - lados com o mesmo comprimento → é essa a medida (confiável mesmo com a dobra torta)
   * - senão, vale o lado mais em esquadro (90° com a dobra OU com a borda oposta), pelo comprimento real
   * `dev` = quanto esse lado foge do esquadro (graus).
   */
  const quadInfo = (n: Face, P0: Vec2, Q0: Vec2) => {
    const c = corners(n.poly).map((i) => n.poly[i]);
    const iP = c.findIndex((p) => len(sub(p, P0)) < 1e-6), iQ = c.findIndex((p) => len(sub(p, Q0)) < 1e-6);
    const step = iP - iQ;
    const fP = c[(iP + step + 4) % 4], fQ = c[(iQ - step + 4) % 4];
    const l1 = len(sub(fP, P0)), l2 = len(sub(fQ, Q0));
    if (Math.abs(l1 - l2) <= 0.02 * Math.max(l1, l2)) return { depth: (l1 + l2) / 2, dev: 0 };
    const devTo = (v: Vec2, ref: Vec2) => 90 - (Math.acos(Math.min(1, Math.abs(dot(unit(v), unit(ref))))) * 180) / Math.PI;
    const hinge = sub(Q0, P0), far = sub(fQ, fP);
    const sides: [Vec2, number][] = [[sub(fP, P0), l1], [sub(fQ, Q0), l2]];
    let best = { depth: 0, dev: 90 };
    for (const [v, l] of sides) {
      const dev = Math.min(devTo(v, hinge), devTo(v, far));
      if (dev < best.dev) best = { depth: l, dev };
    }
    return best;
  };

  // abas: nunca viram retângulo (perderiam chanfros); são só reposicionadas
  const flaps = flapIds(d);

  // painéis gêmeos (lados opostos de um mesmo quadrilátero): se um está todo torto,
  // usa a profundidade do outro
  const depthOverride = new Map<string, number>();
  for (const f of d.faces) {
    const c = corners(f.poly);
    if (c.length !== 4) continue;
    const sideOf = new Map<number, Face>();
    for (const [nId, shared] of nb.get(f.id) ?? []) {
      const n = byId.get(nId)!;
      if (corners(n.poly).length !== 4 || flaps.has(n.id)) continue;
      for (let k = 0; k < 4; k++) {
        const a = idOf(f.poly[c[k]]), b = idOf(f.poly[c[(k + 1) % 4]]);
        if (a && b && shared.has(a) && shared.has(b)) sideOf.set(k, n);
      }
    }
    for (const k of [0, 1]) {
      const n1 = sideOf.get(k), n2 = sideOf.get(k + 2);
      if (!n1 || !n2) continue;
      const h1 = hingeOf(n1, nb.get(f.id)!.get(n1.id)!), h2 = hingeOf(n2, nb.get(f.id)!.get(n2.id)!);
      const i1 = quadInfo(n1, h1.P0, h1.Q0), i2 = quadInfo(n2, h2.P0, h2.Q0);
      if (i1.dev > 5 && i2.dev < i1.dev) depthOverride.set(n1.id, i2.depth);
      if (i2.dev > 5 && i1.dev < i2.dev) depthOverride.set(n2.id, i1.depth);
    }
  }

  // 1. referência → retângulo alinhado aos eixos, com o mesmo centro
  let rebuilt = 0, moved = 0;
  {
    const c = corners(ref.poly);
    if (c.length === 4) {
      const q = c.map((i) => ref.poly[i]);
      const e01 = len(sub(q[1], q[0])) + len(sub(q[3], q[2])), e12 = len(sub(q[2], q[1])) + len(sub(q[0], q[3]));
      const s = e01 >= e12 ? 0 : 1; // começa pelo lado mais longo
      const w = Math.max(e01, e12) / 2, h = Math.min(e01, e12) / 2;
      const ang = Math.atan2(q[s + 1][1] - q[s][1], q[s + 1][0] - q[s][0]);
      const snapped = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      const u: Vec2 = [Math.cos(snapped), Math.sin(snapped)];
      const side = Math.sign(cross(sub(q[s + 1], q[s]), sub(q[(s + 2) % 4], q[s]))) || 1;
      const v = mul(rot90(u), side);
      const C: Vec2 = [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
      const rect: Vec2[] = [
        add(C, add(mul(u, -w / 2), mul(v, -h / 2))), add(C, add(mul(u, w / 2), mul(v, -h / 2))),
        add(C, add(mul(u, w / 2), mul(v, h / 2))), add(C, add(mul(u, -w / 2), mul(v, h / 2))),
      ];
      const newCorners = [0, 1, 2, 3].map((k) => rect[(k - s + 4) % 4]);
      place(ref, mapByCorners(ref.poly, c, newCorners));
      rebuilt++;
    } else place(ref, ref.poly);
  }

  // 2. propagação pelos vincos (BFS)
  const done = new Set([ref.id]);
  const queue = [ref.id];
  while (queue.length) {
    const fId = queue.shift()!;
    for (const [nId, shared] of nb.get(fId) ?? []) {
      if (done.has(nId)) continue;
      done.add(nId);
      queue.push(nId);
      const n = byId.get(nId)!;
      const h = hingeOf(n, shared);
      const P = placed.get(h.ids[0]), Q = placed.get(h.ids[1]);
      if (!P || !Q) { place(n, n.poly); continue; }
      const c = corners(n.poly);
      const iP = c.findIndex((i) => len(sub(n.poly[i], h.P0)) < 1e-6), iQ = c.findIndex((i) => len(sub(n.poly[i], h.Q0)) < 1e-6);
      if (!flaps.has(n.id) && c.length === 4 && iP >= 0 && iQ >= 0 && (Math.abs(iP - iQ) === 1 || Math.abs(iP - iQ) === 3)) {
        // painel de 4 cantos → retângulo sobre a dobra corrigida
        const depth = depthOverride.get(n.id) ?? quadInfo(n, h.P0, h.Q0).depth;
        const farP = c[(iP + (iP - iQ) + 4) % 4];
        const sideSign = Math.sign(cross(sub(h.Q0, h.P0), sub(n.poly[farP], h.P0))) || 1;
        const nrm = mul(unit(rot90(sub(Q, P))), sideSign * Math.sign(cross(sub(Q, P), rot90(sub(Q, P)))));
        const newCorners: Vec2[] = [];
        newCorners[iP] = P;
        newCorners[iQ] = Q;
        newCorners[(iP + (iP - iQ) + 4) % 4] = add(P, mul(nrm, depth));
        newCorners[(iQ + (iQ - iP) + 4) % 4] = add(Q, mul(nrm, depth));
        place(n, mapByCorners(n.poly, c, newCorners));
        rebuilt++;
      } else {
        // aba/forma livre: mesma forma, levada proporcionalmente para a nova dobra
        const dir0 = sub(h.Q0, h.P0), L0 = len(dir0), u0 = unit(dir0), n0 = rot90(u0);
        const dir1 = sub(Q, P), u1 = unit(dir1), n1 = rot90(u1);
        const scale = len(dir1) / (L0 || 1);
        place(n, n.poly.map((p) => {
          const r = sub(p, h.P0);
          return add(P, add(mul(u1, dot(r, u0) * scale), mul(n1, dot(r, n0))));
        }));
        moved++;
      }
    }
  }

  // 3. abas tortas copiam o formato de uma aba gêmea regular (mesmo nº de cantos e mesma dobra)
  const flapInfo = [...flaps].map((id) => {
    const f = byId.get(id)!;
    const shared = [...(nb.get(id)?.values() ?? [])][0];
    if (!f.hinge || !shared || !done.has(id)) return null;
    const h = hingeOf(f, shared);
    const P = placed.get(h.ids[0]), Q = placed.get(h.ids[1]);
    if (!P || !Q) return null;
    // irregularidade: a borda de fora (entre os 2 cantos mais distantes da dobra) deveria ser paralela à dobra
    const u0 = unit(sub(h.Q0, h.P0));
    const far = [...f.poly].sort((p1, p2) => Math.abs(cross(u0, sub(p2, h.P0))) - Math.abs(cross(u0, sub(p1, h.P0)))).slice(0, 2);
    const irr = (Math.asin(Math.min(1, Math.abs(cross(unit(sub(far[1], far[0])), u0)))) * 180) / Math.PI;
    return { f, h, P, Q, irr, newLen: len(sub(Q, P)) };
  }).filter(Boolean) as { f: Face; h: ReturnType<typeof hingeOf>; P: Vec2; Q: Vec2; irr: number; newLen: number }[];
  // coordenadas locais: t ao longo da dobra (0..1), v = distância para fora (mm)
  const local = (x: (typeof flapInfo)[number]) => {
    const u0 = unit(sub(x.h.Q0, x.h.P0)), L0 = len(sub(x.h.Q0, x.h.P0));
    let n0 = rot90(u0);
    const cen = x.f.poly.reduce((acc, p) => add(acc, mul(p, 1 / x.f.poly.length)), [0, 0] as Vec2);
    if (dot(sub(cen, x.h.P0), n0) < 0) n0 = mul(n0, -1);
    return x.f.poly.map((p) => [dot(sub(p, x.h.P0), u0) / L0, dot(sub(p, x.h.P0), n0)] as Vec2);
  };
  for (const t of flapInfo) {
    if (t.irr < 3) continue;
    const twin = flapInfo
      .filter((o) => o !== t && o.irr < 1 && o.f.poly.length === t.f.poly.length && Math.abs(o.newLen - t.newLen) < 0.01 * t.newLen)
      .sort((a1, b1) => a1.irr - b1.irr)[0];
    if (!twin) continue;
    // referencial da aba alvo, já sobre a dobra corrigida; "para fora" = lado onde ela está hoje
    const u1 = unit(sub(t.Q, t.P)), L1 = len(sub(t.Q, t.P));
    let n1 = rot90(u1);
    const cur = t.f.poly.map((p) => placed.get(idOf(p)!) ?? p);
    const cen = cur.reduce((acc, p) => add(acc, mul(p, 1 / cur.length)), [0, 0] as Vec2);
    if (dot(sub(cen, t.P), n1) < 0) n1 = mul(n1, -1);
    const shape = local(twin);
    // tenta direto e espelhado; fica com o mais parecido com a posição atual
    const build = (flip: boolean) => shape.map(([tt, vv]) => add(t.P, add(mul(u1, (flip ? 1 - tt : tt) * L1), mul(n1, vv))));
    const cost = (pts: Vec2[]) => cur.reduce((acc, p) => acc + Math.min(...pts.map((q) => len(sub(p, q)))), 0);
    const pts = [build(false), build(true)].sort((a1, b1) => cost(a1) - cost(b1))[0];
    // cada vértice da aba (fora da dobra) vai para o ponto do molde gêmeo mais próximo
    const used = new Set<number>();
    for (const p of t.f.poly) {
      const id = idOf(p)!;
      const now = placed.get(id) ?? p;
      if (len(sub(now, t.P)) < 1e-6 || len(sub(now, t.Q)) < 1e-6) continue;
      let bi = -1, bd = Infinity;
      pts.forEach((q, i) => { if (!used.has(i) && len(sub(now, q)) < bd) { bd = len(sub(now, q)); bi = i; } });
      if (bi >= 0) { used.add(bi); placed.set(id, pts[bi]); }
    }
  }

  const g = { ...g0, v: { ...g0.v } };
  for (const [id, p] of placed) g.v[id] = { x: p[0], y: p[1] };
  return {
    graph: normalize(g, 0.01),
    reference: ref.name,
    rebuilt,
    moved,
    unreached: d.faces.filter((f) => !done.has(f.id)).map((f) => f.name),
  };
}
