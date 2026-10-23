import { Box, Button, Group, IconButton, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { center, createObject, imageRect, objectToSvg, toLocal, toWorld, type ArtObject, type ArtType } from '../art/objects';
import { buildArt, COLORS, objectClip } from '../export/svg';
import { sideArt } from '../store';
import { bezierPoints, distToEdge, edgePath, isCurved, straightHandles } from '../geometry/curve';
import { faceAt, flapIds } from '../geometry/faces';
import {
  addSegments, deleteEdges, deleteVertices, moveVertices, normalize, setEdgeLength, splitEdge, type Graph,
} from '../geometry/graph';
import { polyToPath } from '../geometry/outline';
import type { Vec2 } from '../geometry/types';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

interface View { cx: number; cy: number; scale: number } // scale = px por mm

type Interaction =
  | { kind: 'drag'; ids: string[]; anchor: string; start: Vec2; base: Graph; moved: boolean }
  | { kind: 'pan'; client: Vec2; view: View }
  | { kind: 'marquee'; start: Vec2; cur: Vec2; additive: boolean; face?: string; moved: boolean }
  | { kind: 'obj-move'; base: ArtObject; start: Vec2; moved: boolean }
  | { kind: 'obj-resize'; base: ArtObject; hx: number; hy: number; moved: boolean }
  | { kind: 'obj-rotate'; base: ArtObject; moved: boolean }
  | { kind: 'obj-pan'; base: ArtObject; start: Vec2; moved: boolean }
  | { kind: 'obj-create'; type: ArtType; start: Vec2; cur: Vec2; face?: string }
  /** Alça de curva (end 1 = c1, perto de a; 2 = c2, perto de b). */
  | { kind: 'ctrl'; eid: string; end: 1 | 2; base: Graph; moved: boolean }
  /** Curvar uma linha arrastando o meio dela (Ctrl + arrastar). */
  | { kind: 'bend'; eid: string; start: Vec2; base: Graph; h: [Vec2, Vec2]; moved: boolean }
  /** Caneta: ponto pressionado; arrastar puxa as alças. */
  | { kind: 'pen'; p: Vec2; drag: Vec2 | null; close: boolean };

interface Snap {
  p: Vec2;
  kind: 'vertex' | 'edge' | 'align' | 'grid' | 'free';
  vid?: string;
  /** Linhas-guia de alinhamento: de um ponto de referência até o ponto encaixado. */
  guides?: [Vec2, Vec2][];
}

const SNAP_PX = 8;

export function Editor2D({ compact = false }: { compact?: boolean }) {
  const { dieline, material, bleedPolys, conflicts, viewBox: fitBox } = useDieline();
  const bad = new Set(conflicts.map((c) => c.face));
  const s = useStore();
  const { graph } = s.doc;
  // Interior (verso): a planificação aparece espelhada, como ao virar a folha; só os objetos do verso
  const back = (s.mode === 'art' || s.mode === 'structure') && s.artSide === 'in' && !compact;
  const mx = back ? -1 : 1;
  const toPaper = (p: Vec2): Vec2 => [p[0] * mx, p[1]];
  const objects = s.doc.objects.filter((o) => (o.side === 'in') === back);
  // fora do modo Edição (ou na miniatura) o molde fica travado: só faces são clicáveis
  const editable = s.mode === 'structure' && !compact;
  const artMode = s.mode === 'art' && !compact;
  const isLineTool = s.tool === 'cut' || s.tool === 'crease';
  const isPen = s.tool === 'pen';
  const selObj = objects.find((o) => o.id === s.sel.object);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const act = useRef<Interaction | null>(null);
  const [marquee, setMarquee] = useState<[Vec2, Vec2] | null>(null);
  const [draw, setDraw] = useState<{ start: Vec2 | null; hover: Snap | null }>({ start: null, hover: null });
  /** Caneta: último ponto e a alça que sai dele (null = canto). */
  const [pen, setPen] = useState<{ start: Vec2 | null; out: Vec2 | null; drag: Vec2 | null }>({ start: null, out: null, drag: null });
  const [creating, setCreating] = useState<{ type: ArtType; a: Vec2; b: Vec2 } | null>(null);
  const [space, setSpace] = useState(false);
  const [dragGuides, setDragGuides] = useState<[Vec2, Vec2][]>([]);
  /** Cota em edição: aresta e texto digitado. */
  const [editDim, setEditDim] = useState<{ id: string; value: string } | null>(null);
  const dimInput = useRef<HTMLInputElement>(null);
  const dimOpenedAt = useRef(0);
  // foca o campo depois que ele aparece (e de o clique terminar)
  useEffect(() => {
    if (!editDim) return;
    const t = setTimeout(() => { dimInput.current?.focus(); dimInput.current?.select(); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDim?.id]);

  // ---------- viewport ----------
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const scale = Math.min(size.w / fitBox[2], size.h / fitBox[3]) * 0.9;
    setView({ cx: (fitBox[0] + fitBox[2] / 2) * mx, cy: fitBox[1] + fitBox[3] / 2, scale });
  }, [size, fitBox]);
  useEffect(() => { if (!view && size.w) fit(); }, [view, size, fit]);
  // trocar exterior/interior espelha o centro da vista (o molde continua enquadrado)
  const prevBack = useRef(back);
  useEffect(() => {
    if (prevBack.current !== back) setView((cur) => cur && { ...cur, cx: -cur.cx });
    prevBack.current = back;
  }, [back]);
  // molde substituído (importação/novo modelo): reenquadra
  useEffect(() => { setView(null); }, [s.fitToken]);

  const v = view ?? { cx: 0, cy: 0, scale: 1 };
  const px = 1 / v.scale; // mm por pixel de tela
  const vb = [v.cx - size.w / 2 / v.scale, v.cy - size.h / 2 / v.scale, size.w / v.scale, size.h / v.scale];

  const toMM = (clientX: number, clientY: number): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [vb[0] + (clientX - r.left) / v.scale, vb[1] + (clientY - r.top) / v.scale];
  };

  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((cur) => {
        if (!cur) return cur;
        const r = el.getBoundingClientRect();
        const mx = cur.cx + (e.clientX - r.left - r.width / 2) / cur.scale;
        const my = cur.cy + (e.clientY - r.top - r.height / 2) / cur.scale;
        const scale = Math.min(200, Math.max(0.05, cur.scale * Math.exp(-e.deltaY * 0.0015)));
        const k = cur.scale / scale;
        return { scale, cx: mx + (cur.cx - mx) * k, cy: my + (cur.cy - my) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- snap ----------
  const snapGrid = (p: Vec2): Vec2 => (s.grid > 0 ? [Math.round(p[0] / s.grid) * s.grid, Math.round(p[1] / s.grid) * s.grid] : p);

  const snapPoint = (p: Vec2, exclude: Set<string> = new Set(), edges = true, from?: Vec2 | null): Snap => {
    const r = SNAP_PX * px;
    let best: Snap | null = null, bd = r;
    for (const id in graph.v) {
      if (exclude.has(id)) continue;
      const d = Math.hypot(graph.v[id].x - p[0], graph.v[id].y - p[1]);
      if (d < bd) { bd = d; best = { p: [graph.v[id].x, graph.v[id].y], kind: 'vertex', vid: id }; }
    }
    if (best) return best;
    if (edges) {
      bd = r * 0.75;
      for (const id in graph.e) {
        const { d, q } = distToEdge(graph, id, p);
        if (d < bd) { bd = d; best = { p: q, kind: 'edge' }; }
      }
      if (best) return best;
    }
    // alinhamento horizontal/vertical com vértices existentes (e com o início da linha)
    const ar = 6 * px;
    let ax: { v: number; ref: Vec2; d: number } | undefined, ay: typeof ax;
    const refs: Vec2[] = Object.keys(graph.v).filter((id) => !exclude.has(id)).map((id) => [graph.v[id].x, graph.v[id].y]);
    if (from) refs.push(from);
    for (const q of refs) {
      const dx = Math.abs(q[0] - p[0]), dy = Math.abs(q[1] - p[1]);
      if (dx < ar && (!ax || dx < ax.d || (dx === ax.d && Math.abs(q[1] - p[1]) < Math.abs(ax.ref[1] - p[1])))) ax = { v: q[0], ref: q, d: dx };
      if (dy < ar && (!ay || dy < ay.d || (dy === ay.d && Math.abs(q[0] - p[0]) < Math.abs(ay.ref[0] - p[0])))) ay = { v: q[1], ref: q, d: dy };
    }
    if (ax || ay) {
      const g = snapGrid(p);
      const pt: Vec2 = [ax ? ax.v : g[0], ay ? ay.v : g[1]];
      const guides: [Vec2, Vec2][] = [];
      if (ax) guides.push([ax.ref, pt]);
      if (ay) guides.push([ay.ref, pt]);
      return { p: pt, kind: 'align', guides };
    }
    return s.grid > 0 ? { p: snapGrid(p), kind: 'grid' } : { p, kind: 'free' };
  };

  /** Restringe a 0/45/90° a partir de `from`. */
  const constrain = (from: Vec2, p: Vec2): Vec2 => {
    const dx = p[0] - from[0], dy = p[1] - from[1];
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len];
  };

  /** Snap do objeto: centro e bordas das faces, senão grade. */
  const snapObject = (o: ArtObject): Vec2 => {
    const r = 6 * px;
    const [cx, cy] = center(o);
    let bx: number | undefined, by: number | undefined, dx = r, dy = r;
    for (const f of dieline.faces) {
      const xs = f.poly.map((q) => q[0] * mx), ys = f.poly.map((q) => q[1]);
      const fx = [Math.min(...xs), (Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...xs)];
      const fy = [Math.min(...ys), (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...ys)];
      // alinha centro, borda esquerda/superior ou direita/inferior do objeto
      for (const t of fx)
        for (const [val, off] of [[cx, 0], [o.x, o.w / 2], [o.x + o.w, -o.w / 2]])
          if (Math.abs(val - t) < dx) { dx = Math.abs(val - t); bx = t + off; }
      for (const t of fy)
        for (const [val, off] of [[cy, 0], [o.y, o.h / 2], [o.y + o.h, -o.h / 2]])
          if (Math.abs(val - t) < dy) { dy = Math.abs(val - t); by = t + off; }
    }
    const g = snapGrid([o.x, o.y]);
    return [bx !== undefined ? bx - o.w / 2 : g[0], by !== undefined ? by - o.h / 2 : g[1]];
  };

  /** Redimensiona pela alça (hx, hy ∈ {-1,0,1}) no referencial do objeto (respeita rotação). */
  const resizeBox = (o: ArtObject, hx: number, hy: number, p: Vec2, shift: boolean): Partial<ArtObject> => {
    const l = toLocal(o, p);
    let left = -o.w / 2, right = o.w / 2, top = -o.h / 2, bottom = o.h / 2;
    if (hx === 1) right = Math.max(left + 1, l[0]);
    if (hx === -1) left = Math.min(right - 1, l[0]);
    if (hy === 1) bottom = Math.max(top + 1, l[1]);
    if (hy === -1) top = Math.min(bottom - 1, l[1]);
    let w = right - left, h = bottom - top;
    // imagem e texto mantêm a proporção (Shift inverte); texto sempre proporcional
    const keep = o.type === 'text' || ((o.type === 'image') !== shift && hx !== 0 && hy !== 0);
    if (keep) {
      const k = hx === 0 ? h / o.h : hy === 0 ? w / o.w : Math.max(w / o.w, h / o.h);
      w = o.w * k; h = o.h * k;
      if (hx === -1) left = right - w; else if (hx === 1) right = left + w; else { left = -w / 2; right = w / 2; }
      if (hy === -1) top = bottom - h; else if (hy === 1) bottom = top + h; else { top = -h / 2; bottom = h / 2; }
    }
    const [cx, cy] = toWorld(o, [(left + right) / 2, (top + bottom) / 2]);
    const patch: Partial<ArtObject> = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (o.type === 'text') patch.fontSize = +((o.fontSize ?? 12) * (h / o.h)).toFixed(2);
    if (o.type === 'image') {
      const c = imageRect(o);
      if (hx && hy) {
        // cantos: escala moldura e imagem juntas
        const kx = w / o.w, ky = h / o.h;
        patch.crop = o.crop ? { x: c.x * kx, y: c.y * ky, w: c.w * kx, h: c.h * ky } : undefined;
      } else {
        // lados: corta (só a moldura anda; a imagem fica parada no lugar)
        patch.crop = { x: -o.w / 2 + c.x - left, y: -o.h / 2 + c.y - top, w: c.w, h: c.h };
      }
    }
    return patch;
  };

  // ---------- ponteiro ----------
  /** Alvo real do último clique (com a captura do ponteiro, o dblclick chega com o <svg> como alvo). */
  const lastDown = useRef<Element | null>(null);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    lastDown.current = e.target as Element;
    svgRef.current!.setPointerCapture(e.pointerId);
    // na Edição, trabalha nas coordenadas do papel (desfaz o espelho do verso)
    const p0 = toMM(e.clientX, e.clientY);
    const p = s.mode === 'structure' ? toPaper(p0) : p0;
    if (e.button === 1 || space) {
      act.current = { kind: 'pan', client: [e.clientX, e.clientY], view: v };
      return;
    }
    if (e.button !== 0) return;

    if (artMode && (s.tool === 'rect' || s.tool === 'ellipse')) {
      const start = snapGrid(p);
      act.current = { kind: 'obj-create', type: s.tool, start, cur: start, face: faceAt(dieline, toPaper(p))?.id };
      return;
    }
    if (artMode && s.tool === 'text') {
      s.addObject(createObject('text', { x: p[0], y: p[1], w: 0, h: 0 }, { clip: faceAt(dieline, toPaper(p))?.id }));
      return;
    }

    if (isPen && editable) {
      const snap = snapPoint(p, undefined, true, pen.start);
      let pt = snap.p;
      if (pen.start && e.shiftKey && snap.kind !== 'vertex') pt = constrain(pen.start, p);
      act.current = { kind: 'pen', p: pt, drag: null, close: !!pen.start && snap.kind === 'vertex' };
      setDraw({ start: pen.start, hover: { ...snap, p: pt } });
      return;
    }

    if (isLineTool) {
      const snap = snapPoint(p, undefined, true, draw.start);
      let pt = snap.p;
      if (draw.start && e.shiftKey && snap.kind !== 'vertex') pt = constrain(draw.start, p);
      if (!draw.start) return setDraw({ start: pt, hover: snap });
      if (Math.hypot(pt[0] - draw.start[0], pt[1] - draw.start[1]) > 0.01)
        s.commit({ graph: addSegments(graph, [{ a: draw.start, b: pt, type: s.tool as 'cut' | 'crease' }]) });
      // fechar sobre um vértice existente encerra a linha
      setDraw({ start: snap.kind === 'vertex' ? null : pt, hover: snap });
      return;
    }

    const target = e.target as Element;
    const kind = target.getAttribute('data-kind');
    const id = target.getAttribute('data-id') ?? undefined;

    if (kind === 'dim' && id && editable) {
      // impede o mousedown padrão de levar o foco para o canvas (fecharia o campo recém-aberto)
      e.preventDefault();
      dimOpenedAt.current = performance.now();
      const ed = graph.e[id];
      const len = Math.hypot(graph.v[ed.b].x - graph.v[ed.a].x, graph.v[ed.b].y - graph.v[ed.a].y);
      setEditDim({ id, value: (+len.toFixed(2)).toString().replace('.', ',') });
      return;
    }

    if (artMode) {
      if (kind === 'obj-handle' && selObj) {
        const [hx, hy] = target.getAttribute('data-h')!.split(',').map(Number);
        act.current = { kind: 'obj-resize', base: selObj, hx, hy, moved: false };
        s.beginDrag();
        return;
      }
      if (kind === 'obj-rot' && selObj) {
        act.current = { kind: 'obj-rotate', base: selObj, moved: false };
        s.beginDrag();
        return;
      }
      if (kind === 'object' && id && s.cropEdit === id) {
        // ajuste no corte: arrastar move a imagem dentro da moldura
        const o = objects.find((x) => x.id === id)!;
        act.current = { kind: 'obj-pan', base: o, start: p, moved: false };
        s.beginDrag();
        return;
      }
      if (kind === 'object' && id) {
        const o = objects.find((x) => x.id === id)!;
        s.select({ object: id, face: o.clip });
        act.current = { kind: 'obj-move', base: o, start: p, moved: false };
        s.beginDrag();
        return;
      }
    }

    if (kind === 'ctrl' && id && editable) {
      const [eid, end] = id.split(':');
      act.current = { kind: 'ctrl', eid, end: +end as 1 | 2, base: graph, moved: false };
      s.beginDrag();
      return;
    }
    if (kind === 'edge' && id && editable && (e.ctrlKey || e.metaKey) && graph.e[id]?.type === 'cut') {
      // Ctrl + arrastar: curva a linha (como a ferramenta de dobrar curvas do Figma)
      const ed = graph.e[id], A: Vec2 = [graph.v[ed.a].x, graph.v[ed.a].y], B: Vec2 = [graph.v[ed.b].x, graph.v[ed.b].y];
      const h: [Vec2, Vec2] = isCurved(ed) ? [ed.c1!, ed.c2!] : straightHandles(A, B);
      s.select({ edges: [id] });
      act.current = { kind: 'bend', eid: id, start: p, base: graph, h, moved: false };
      s.beginDrag();
      return;
    }

    if (kind === 'vertex' && id) {
      let verts = s.sel.vertices;
      if (e.shiftKey) {
        verts = verts.includes(id) ? verts.filter((x) => x !== id) : [...verts, id];
        s.select({ vertices: verts, edges: s.sel.edges });
        if (!verts.includes(id)) return;
      } else if (!verts.includes(id)) {
        verts = [id];
        s.select({ vertices: verts });
      }
      const ids = new Set(verts);
      for (const eid of s.sel.edges) { ids.add(graph.e[eid]?.a); ids.add(graph.e[eid]?.b); }
      startDrag([...ids].filter(Boolean), id, p);
      return;
    }
    if (kind === 'edge' && id) {
      let edges = s.sel.edges;
      if (e.shiftKey) {
        edges = edges.includes(id) ? edges.filter((x) => x !== id) : [...edges, id];
        s.select({ vertices: s.sel.vertices, edges });
        if (!edges.includes(id)) return;
      } else if (!edges.includes(id)) {
        edges = [id];
        s.select({ edges });
      }
      const ids = new Set(s.sel.vertices.filter(() => e.shiftKey));
      for (const eid of edges) { ids.add(graph.e[eid].a); ids.add(graph.e[eid].b); }
      startDrag([...ids], graph.e[id].a, p);
      return;
    }
    act.current = { kind: 'marquee', start: p, cur: p, additive: e.shiftKey, face: kind === 'face' ? id : undefined, moved: false };
  };

  const startDrag = (ids: string[], anchor: string, start: Vec2) => {
    act.current = { kind: 'drag', ids, anchor, start, base: graph, moved: false };
    s.beginDrag();
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p0 = toMM(e.clientX, e.clientY);
    const p = s.mode === 'structure' ? toPaper(p0) : p0;
    const a = act.current;
    if (a?.kind === 'pen') {
      if (Math.hypot(p[0] - a.p[0], p[1] - a.p[1]) > 2 * px) { a.drag = p; setPen((cur) => ({ ...cur, drag: p })); }
      return;
    }
    if (!a && isPen) {
      const snap = snapPoint(p, undefined, true, pen.start);
      if (pen.start && e.shiftKey && snap.kind !== 'vertex') { snap.p = constrain(pen.start, p); snap.guides = undefined; }
      setDraw({ start: pen.start, hover: snap });
      return;
    }
    if (a?.kind === 'ctrl') {
      const ed = a.base.e[a.eid];
      if (!ed) return;
      const anchorId = a.end === 1 ? ed.a : ed.b;
      const anchor = a.base.v[anchorId];
      let q: Vec2 = p;
      if (e.shiftKey) q = constrain([anchor.x, anchor.y], p);
      const ng = { ...a.base, e: { ...a.base.e, [a.eid]: { ...ed, [a.end === 1 ? 'c1' : 'c2']: q } } };
      // ponto suave: a alça do outro lado acompanha (alinhada, mantém o próprio tamanho); Alt solta
      if (!e.altKey) {
        const mine = a.end === 1 ? ed.c1! : ed.c2!;
        for (const oid in a.base.e) {
          if (oid === a.eid) continue;
          const o = a.base.e[oid];
          if (!isCurved(o) || (o.a !== anchorId && o.b !== anchorId)) continue;
          const key = o.a === anchorId ? 'c1' : 'c2';
          const h = o[key]!;
          const u: Vec2 = [mine[0] - anchor.x, mine[1] - anchor.y], w: Vec2 = [h[0] - anchor.x, h[1] - anchor.y];
          const lu = Math.hypot(...u), lw = Math.hypot(...w);
          if (lu < 1e-6 || lw < 1e-6 || (u[0] * w[0] + u[1] * w[1]) / (lu * lw) > -0.995) continue; // não era suave
          const nq: Vec2 = [q[0] - anchor.x, q[1] - anchor.y], lq = Math.hypot(...nq) || 1;
          ng.e[oid] = { ...o, [key]: [anchor.x - (nq[0] / lq) * lw, anchor.y - (nq[1] / lq) * lw] };
        }
      }
      a.moved = true;
      s.setGraphLive(ng);
      return;
    }
    if (a?.kind === 'bend') {
      const d: Vec2 = [((p[0] - a.start[0]) * 4) / 3, ((p[1] - a.start[1]) * 4) / 3];
      const ed = a.base.e[a.eid];
      a.moved ||= Math.hypot(...d) > 1e-6;
      s.setGraphLive({ ...a.base, e: { ...a.base.e, [a.eid]: { ...ed, c1: [a.h[0][0] + d[0], a.h[0][1] + d[1]], c2: [a.h[1][0] + d[0], a.h[1][1] + d[1]] } } });
      return;
    }
    if (!a) {
      if (isLineTool) {
        const snap = snapPoint(p, undefined, true, draw.start);
        if (draw.start && e.shiftKey && snap.kind !== 'vertex') { snap.p = constrain(draw.start, p); snap.guides = undefined; }
        setDraw((d) => ({ ...d, hover: snap }));
      }
      return;
    }
    if (a.kind === 'pan') {
      setView({ ...a.view, cx: a.view.cx - (e.clientX - a.client[0]) / a.view.scale, cy: a.view.cy - (e.clientY - a.client[1]) / a.view.scale });
    } else if (a.kind === 'marquee') {
      a.cur = p;
      a.moved ||= Math.hypot(p[0] - a.start[0], p[1] - a.start[1]) > 3 * px;
      if (a.moved) setMarquee([a.start, p]);
    } else if (a.kind === 'obj-create') {
      a.cur = snapGrid(p);
      setCreating({ type: a.type, a: a.start, b: a.cur });
    } else if (a.kind === 'obj-move') {
      let nx = a.base.x + p[0] - a.start[0], ny = a.base.y + p[1] - a.start[1];
      if (e.shiftKey) {
        if (Math.abs(nx - a.base.x) > Math.abs(ny - a.base.y)) ny = a.base.y;
        else nx = a.base.x;
      } else [nx, ny] = snapObject({ ...a.base, x: nx, y: ny });
      a.moved ||= Math.hypot(nx - a.base.x, ny - a.base.y) > 1e-6;
      s.setObjectLive(a.base.id, { x: nx, y: ny });
    } else if (a.kind === 'obj-pan') {
      // deslocamento no referencial da moldura (respeita a rotação)
      const r = (-a.base.rotation * Math.PI) / 180;
      const dx = p[0] - a.start[0], dy = p[1] - a.start[1];
      const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
      const c = imageRect(a.base);
      a.moved = true;
      s.setObjectLive(a.base.id, { crop: { ...c, x: c.x + lx, y: c.y + ly } });
    } else if (a.kind === 'obj-resize') {
      a.moved = true;
      s.setObjectLive(a.base.id, resizeBox(a.base, a.hx, a.hy, p, e.shiftKey));
    } else if (a.kind === 'obj-rotate') {
      const [cx, cy] = center(a.base);
      let deg = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      a.moved = true;
      s.setObjectLive(a.base.id, { rotation: +deg.toFixed(2) });
    } else if (a.kind === 'drag') {
      setDragGuides([]);
      const base = a.base.v[a.anchor];
      let target: Vec2 = [base.x + p[0] - a.start[0], base.y + p[1] - a.start[1]];
      if (e.shiftKey) target = Math.abs(target[0] - base.x) > Math.abs(target[1] - base.y) ? [target[0], base.y] : [base.x, target[1]];
      else {
        const snap = snapPoint(target, new Set(a.ids), false);
        if (snap.kind === 'vertex') target = snap.p;
        else {
          // alinhamento com X/Y de outros vértices, senão grade
          const g = snapGrid(target);
          let ax = g[0], ay = g[1];
          let rx: Vec2 | undefined, ry: Vec2 | undefined;
          for (const id in a.base.v) {
            if (a.ids.includes(id)) continue;
            const o = a.base.v[id];
            if (Math.abs(o.x - target[0]) < 5 * px) { ax = o.x; rx = [o.x, o.y]; }
            if (Math.abs(o.y - target[1]) < 5 * px) { ay = o.y; ry = [o.x, o.y]; }
          }
          target = [ax, ay];
          setDragGuides([...(rx ? [[rx, target] as [Vec2, Vec2]] : []), ...(ry ? [[ry, target] as [Vec2, Vec2]] : [])]);
        }
      }
      const dx = target[0] - base.x, dy = target[1] - base.y;
      a.moved ||= Math.hypot(dx, dy) > 1e-6;
      s.setGraphLive(moveVertices(a.base, a.ids, dx, dy, a.base));
    }
  };

  const onPointerUp = () => {
    const a = act.current;
    act.current = null;
    if (!a) return;
    setDragGuides([]);
    if (a.kind === 'pen') {
      const pt = a.p;
      const drag = a.drag;
      const start = pen.start;
      if (start && Math.hypot(pt[0] - start[0], pt[1] - start[1]) > 0.01) {
        const c1 = pen.out ?? start;
        const c2: Vec2 = drag ? [2 * pt[0] - drag[0], 2 * pt[1] - drag[1]] : pt;
        const curved = pen.out || drag;
        s.commit({ graph: addSegments(graph, [{ a: start, b: pt, type: 'cut', ...(curved ? { c1, c2 } : {}) }]) });
      }
      // fechar sobre um ponto existente encerra o traço
      setPen(a.close ? { start: null, out: null, drag: null } : { start: pt, out: drag, drag: null });
      setDraw({ start: a.close ? null : pt, hover: null });
      return;
    }
    if (a.kind === 'ctrl' || a.kind === 'bend') { s.endDrag(a.moved); return; }
    if (a.kind === 'drag' || a.kind === 'obj-move' || a.kind === 'obj-resize' || a.kind === 'obj-rotate' || a.kind === 'obj-pan') s.endDrag(a.moved);
    if (a.kind === 'obj-create') {
      setCreating(null);
      const w = Math.abs(a.cur[0] - a.start[0]), h = Math.abs(a.cur[1] - a.start[1]);
      // clique simples cria um tamanho padrão centrado no ponto
      const box = w < 1 || h < 1
        ? { x: a.start[0] - 15, y: a.start[1] - 10, w: 30, h: 20 }
        : { x: Math.min(a.start[0], a.cur[0]), y: Math.min(a.start[1], a.cur[1]), w, h };
      s.addObject(createObject(a.type, box, { clip: a.face }));
    }
    if (a.kind === 'marquee') {
      setMarquee(null);
      if (!a.moved || !editable) return s.select(a.face ? { face: a.face } : {});
      const [x0, x1] = [Math.min(a.start[0], a.cur[0]), Math.max(a.start[0], a.cur[0])];
      const [y0, y1] = [Math.min(a.start[1], a.cur[1]), Math.max(a.start[1], a.cur[1])];
      const inside = Object.keys(graph.v).filter((id) => {
        const q = graph.v[id];
        return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      });
      const set = new Set(inside);
      const edges = Object.keys(graph.e).filter((id) => set.has(graph.e[id].a) && set.has(graph.e[id].b));
      s.select(a.additive
        ? { vertices: [...new Set([...s.sel.vertices, ...inside])], edges: [...new Set([...s.sel.edges, ...edges])] }
        : { vertices: inside, edges });
    }
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (artMode) {
      const t = lastDown.current ?? (e.target as Element);
      if (t.getAttribute('data-kind') === 'object') {
        const o = objects.find((x) => x.id === t.getAttribute('data-id'));
        // imagem: entra/sai do ajuste no corte; texto: foco no campo de conteúdo
        if (o?.type === 'image') s.setCropEdit(s.cropEdit === o.id ? undefined : o.id);
        else setTimeout(() => (document.getElementById('art-text-input') as HTMLTextAreaElement | null)?.focus(), 0);
      }
      return;
    }
    if (!editable) return;
    if (isLineTool) return setDraw({ start: null, hover: null });
    if (isPen) { setPen({ start: null, out: null, drag: null }); return setDraw({ start: null, hover: null }); }
    const target = lastDown.current ?? (e.target as Element);
    if (target.getAttribute('data-kind') === 'vertex') {
      const ng = toggleSmooth(graph, target.getAttribute('data-id')!);
      if (ng !== graph) s.commit({ graph: ng });
      return;
    }
    if (target.getAttribute('data-kind') !== 'edge') return;
    const { g, vid } = splitEdge(graph, target.getAttribute('data-id')!, toPaper(toMM(e.clientX, e.clientY)));
    s.commit({ graph: g });
    s.select({ vertices: [vid] });
  };

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable=true]')) return;
      const st = useStore.getState();
      const g = st.doc.graph;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { setSpace(e.type === 'keydown'); e.preventDefault(); return; }
      if (e.type !== 'keydown') return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? st.redo() : st.undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return st.redo(); }
      if (compact) return; // a miniatura só responde a desfazer/refazer
      // Tab alterna Arte ↔ Edição (como Object/Edit Mode do Blender)
      if (e.key === 'Tab' && !mod && st.mode !== 'verify') {
        e.preventDefault();
        return st.setMode(st.mode === 'art' ? 'structure' : 'art');
      }

      if (st.mode === 'art') {
        const o = st.doc.objects.find((x) => x.id === st.sel.object);
        if (mod && e.key.toLowerCase() === 'd' && o) { e.preventDefault(); return st.duplicateObject(o.id); }
        if (mod) return;
        switch (e.key) {
          case 'Escape':
            if (st.cropEdit) return st.setCropEdit(undefined);
            st.select({}); st.setTool('select'); return;
          case 'Enter': if (st.cropEdit) st.setCropEdit(undefined); return;
          case 'Delete': case 'Backspace': if (o) st.deleteObject(o.id); return;
          case 'v': case 'V': return st.setTool('select');
          case 'r': case 'R': return st.setTool('rect');
          case 'e': case 'E': return st.setTool('ellipse');
          case 't': case 'T': return st.setTool('text');
          case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
            if (!o) return;
            e.preventDefault();
            const step = e.shiftKey ? 1 : 0.1;
            st.updateObject(o.id, {
              x: o.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
              y: o.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
            });
            return;
          }
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'a' && st.mode === 'structure') {
        e.preventDefault();
        return st.select({ vertices: Object.keys(g.v), edges: Object.keys(g.e) });
      }
      if (mod) return;
      if (st.mode !== 'structure' && e.key !== 'Escape') return;
      switch (e.key) {
        case 'Escape':
          setDraw({ start: null, hover: null });
          setPen({ start: null, out: null, drag: null });
          st.select({});
          break;
        case 'Enter':
          setDraw({ start: null, hover: null });
          setPen({ start: null, out: null, drag: null });
          break;
        case 'p': case 'P': st.setTool('pen'); break;
        case 'Delete':
        case 'Backspace': {
          const { edges, vertices } = st.sel;
          if (!edges.length && !vertices.length) return;
          let ng = edges.length ? deleteEdges(g, edges) : g;
          if (vertices.length) ng = deleteVertices(ng, vertices.filter((id) => ng.v[id]));
          st.commit({ graph: ng });
          st.select({});
          break;
        }
        case 'v': case 'V': st.setTool('select'); setDraw({ start: null, hover: null }); break;
        case 'c': case 'C': st.setTool('cut'); break;
        case 'd': case 'D': st.setTool('crease'); break;
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
          const ids = new Set(st.sel.vertices);
          for (const eid of st.sel.edges) { ids.add(g.e[eid].a); ids.add(g.e[eid].b); }
          if (!ids.size) return;
          e.preventDefault();
          const step = e.shiftKey ? 1 : 0.1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          st.commit({ graph: normalize(moveVertices(g, [...ids], dx, dy, g), 0.01) });
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, [compact]);

  useEffect(() => { if (!isLineTool && !isPen) setDraw({ start: null, hover: null }); }, [isLineTool, isPen]);
  useEffect(() => { if (!isPen) setPen({ start: null, out: null, drag: null }); }, [isPen]);

  // ---------- arte de fundo (congelada durante o arrasto para não recarregar imagens a cada frame) ----------
  const frozen = useRef({ dieline, bleedPolys });
  if (!s.dragging) frozen.current = { dieline, bleedPolys };
  const art = useMemo(
    () => buildArt(frozen.current.dieline, frozen.current.bleedPolys, { ...sideArt(s, back ? 'in' : 'out'), bleed: s.bleed, mirror: back }, 'ed'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frozen.current, s.fullImage, s.faceImages, s.faceColors, s.bgColor, s.interior, s.bleed, back],
  );

  const selV = new Set(s.sel.vertices), selE = new Set(s.sel.edges);

  // cotas: só nas linhas grandes o bastante na tela para caber o rótulo
  // medidas dos painéis: linhas (retas ou inclinadas) que tocam uma face que não é aba
  const flaps = flapIds(dieline);
  const dims = editable && s.showDims && !compact
    ? Object.entries(graph.e).flatMap(([id, e]) => {
        const A = graph.v[e.a], B = graph.v[e.b];
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        if (len * v.scale < 46) return [];
        const panels = (dieline.edgeFaces[id] ?? []).filter((f) => !flaps.has(f));
        if (!panels.length) return [];
        if (isCurved(e)) return [];
      return [{ id, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, len, type: e.type }];
      })
    : [];
  const applyDim = () => {
    if (!editDim) return;
    const v2 = parseFloat(editDim.value.replace(',', '.'));
    setEditDim(null);
    const e = graph.e[editDim.id];
    if (!e || !(v2 > 0)) return;
    const len = Math.hypot(graph.v[e.b].x - graph.v[e.a].x, graph.v[e.b].y - graph.v[e.a].y);
    if (Math.abs(v2 - len) > 1e-4) s.commit({ graph: setEdgeLength(graph, editDim.id, v2) });
  };
  const dead = new Set(dieline.dead);

  // alças só nos cantos reais; vértices intermediários de curvas aparecem com zoom ou se selecionados
  const handles = useMemo(() => {
    const nb = new Map<string, string[]>();
    for (const id in graph.e) {
      const { a, b } = graph.e[id];
      nb.set(a, [...(nb.get(a) ?? []), b]);
      nb.set(b, [...(nb.get(b) ?? []), a]);
    }
    return Object.keys(graph.v).filter((id) => {
      const n = nb.get(id) ?? [];
      if (n.length !== 2) return true;
      const p = graph.v[id], a = graph.v[n[0]], b = graph.v[n[1]];
      const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
      if (Math.min(la, lb) * v.scale > 28) return true;
      const cos = ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) / (la * lb);
      return cos > -0.97; // ângulo menor que ~166° = canto
    });
  }, [graph, v.scale]);
  // alças de curva: das arestas curvas que tocam pontos ou linhas selecionados
  const ctrlHandles = useMemo(() => {
    const anchors = new Set(s.sel.vertices);
    for (const eid of s.sel.edges) { const ed = graph.e[eid]; if (ed) { anchors.add(ed.a); anchors.add(ed.b); } }
    const out: { eid: string; end: 1 | 2; anchor: Vec2; pos: Vec2 }[] = [];
    for (const eid in graph.e) {
      const ed = graph.e[eid];
      if (!isCurved(ed)) continue;
      const both = s.sel.edges.includes(eid);
      if (both || anchors.has(ed.a)) out.push({ eid, end: 1, anchor: [graph.v[ed.a].x, graph.v[ed.a].y], pos: ed.c1! });
      if (both || anchors.has(ed.b)) out.push({ eid, end: 2, anchor: [graph.v[ed.b].x, graph.v[ed.b].y], pos: ed.c2! });
    }
    return out;
  }, [graph, s.sel.vertices, s.sel.edges]);
  const gridStep = s.grid > 0 ? [1, 5, 10, 50, 100].map((k) => k * s.grid).find((g) => g * v.scale >= 10) : undefined;
  const cursor = space ? 'grab' : s.tool === 'text' ? 'text' : s.tool !== 'select' ? 'crosshair' : 'default';

  return (
    <Box ref={wrapRef} position="absolute" inset={0} overflow="hidden" bg="gray.50">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={vb.join(' ')}
        style={{ display: 'block', cursor, touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setDraw((d) => ({ ...d, hover: null }))}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); setDraw({ start: null, hover: null }); }}
      >
        <defs dangerouslySetInnerHTML={{ __html: art.defs }} />
        <defs>
          <pattern id="ed-bad" width={8 * px} height={8 * px} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={8 * px} height={8 * px} fill="rgba(239,68,68,0.12)" />
            <line x1={0} y1={0} x2={0} y2={8 * px} stroke="#EF4444" strokeWidth={2.5 * px} />
          </pattern>
        </defs>
        {gridStep && (
          <>
            <defs>
              <pattern id="ed-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
                <circle cx={0} cy={0} r={1 * px} fill="#cbd5e1" />
              </pattern>
            </defs>
            <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#ed-grid)" pointerEvents="none" />
          </>
        )}

        <path d={polyToPath(material)} fill="white" fillRule="evenodd" pointerEvents="none" transform={back ? 'scale(-1 1)' : undefined} />
        {s.layers.artwork && <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: art.body }} />}
        {/* ajuste no corte: a parte escondida da imagem aparece translúcida */}
        {artMode && (() => {
          const o = objects.find((x) => x.id === s.cropEdit && x.type === 'image');
          if (!o?.src) return null;
          const c = imageRect(o);
          const [cx, cy] = center(o);
          return (
            <g transform={`rotate(${o.rotation} ${cx} ${cy})`} pointerEvents="none">
              <image href={o.src} x={o.x + c.x} y={o.y + c.y} width={c.w} height={c.h} preserveAspectRatio="none" opacity={0.35} />
              <rect x={o.x + c.x} y={o.y + c.y} width={c.w} height={c.h} fill="none" stroke="#3B82F6" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })()}
        {/* objetos: um <g> por objeto, assim só o que mudou é redesenhado */}
        {s.layers.artwork &&
          objects.map((o) => (
            <g key={o.id} pointerEvents="none" clipPath={`url(#${objectClip('ed', dieline, o)})`} dangerouslySetInnerHTML={{ __html: objectToSvg(o) }} />
          ))}
        <g transform={back ? 'scale(-1 1)' : undefined}>
        {s.layers.bleed && s.bleed > 0 && (
          <path d={polyToPath(bleedPolys)} fill="none" stroke={COLORS.bleed} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {dieline.faces.map((f) => (
          <path
            key={f.id}
            data-kind="face"
            data-id={f.id}
            d={polyToPath([f.poly, ...f.holes])}
            fillRule="evenodd"
            fill={bad.has(f.id) ? 'url(#ed-bad)' : s.sel.face === f.id && s.mode === 'structure' ? 'rgba(229,38,46,0.12)' : 'transparent'}
            stroke={s.sel.face === f.id && !selObj ? '#F59E0B' : 'none'}
            strokeWidth={s.mode === 'structure' ? 2 : 3}
            vectorEffect="non-scaling-stroke"
          >
            <title>{f.name}</title>
          </path>
        ))}
        </g>

        {artMode && s.tool === 'select' &&
          objects.filter((o) => !o.hidden).map((o) => {
            const [cx, cy] = center(o);
            return (
              <rect
                key={o.id} data-kind="object" data-id={o.id}
                x={o.x} y={o.y} width={o.w} height={o.h}
                transform={`rotate(${o.rotation} ${cx} ${cy})`}
                fill="transparent" style={{ cursor: s.cropEdit === o.id ? 'grab' : 'move' }}
              >
                <title>{o.name}</title>
              </rect>
            );
          })}

        <g transform={back ? 'scale(-1 1)' : undefined}>
        {Object.entries(graph.e).map(([id, e]) => {
          const d = edgePath(graph, id);
          const visible = e.type === 'cut' ? s.layers.cut : s.layers.crease;
          const selected = selE.has(id);
          return (
            <g key={id}>
              <path
                d={d} fill="none"
                stroke={selected ? '#F59E0B' : s.mode === 'art' ? '#CBD5E1' : e.type === 'cut' ? COLORS.cut : COLORS.crease}
                strokeWidth={selected ? 2.5 : 1.25}
                strokeDasharray={e.type === 'crease' ? '6 4' : undefined}
                strokeOpacity={selected ? 1 : !visible ? 0.15 : dead.has(id) ? 0.3 : 1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {editable && s.tool === 'select' && (
                <path data-kind="edge" data-id={id} d={d} fill="none" stroke="transparent" strokeWidth={10 * px} style={{ cursor: 'move' }} />
              )}
            </g>
          );
        })}
        </g>

        <g transform={back ? 'scale(-1 1)' : undefined}>
        {dims.map((d) => {
          const label = `${(+d.len.toFixed(1)).toString().replace('.', ',')}`;
          const w = (label.length * 6.2 + 10) * px, h = 15 * px;
          if (editDim?.id === d.id) return null;
          return (
            <g key={`dim-${d.id}`} style={{ cursor: 'text' }}>
              <rect
                data-kind="dim" data-id={d.id}
                x={d.x - w / 2} y={d.y - h / 2} width={w} height={h} rx={h / 2}
                fill="white" fillOpacity={0.92}
                stroke={d.type === 'cut' ? COLORS.cut : COLORS.crease} strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke"
              >
                <title>Clique para editar a medida (mm)</title>
              </rect>
              <text
                // no verso o texto é "desespelhado" para continuar legível
                x={back ? -d.x : d.x} y={d.y + 3.6 * px} textAnchor="middle" fontWeight={600}
                transform={back ? 'scale(-1 1)' : undefined}
                // style (não atributo): o CSS global da página sobrepõe o atributo font-size
                style={{ fontSize: 10.5 * px }}
                fill="#334155" pointerEvents="none"
              >
                {label}
              </text>
            </g>
          );
        })}

        {editable && s.tool === 'select' && ctrlHandles.map((h) => (
          <g key={`c-${h.eid}-${h.end}`}>
            <line x1={h.anchor[0]} y1={h.anchor[1]} x2={h.pos[0]} y2={h.pos[1]} stroke="#3B82F6" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <circle
              data-kind="ctrl" data-id={`${h.eid}:${h.end}`} cx={h.pos[0]} cy={h.pos[1]} r={3.5 * px}
              fill="white" stroke="#3B82F6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }}
            >
              <title>Arraste a alça · Alt solta o lado oposto · Shift = 45°</title>
            </circle>
          </g>
        ))}
        {editable && s.tool === 'select' &&
          [...new Set([...handles, ...s.sel.vertices])].filter((id) => graph.v[id]).map((id) => {
            const p = graph.v[id];
            const r = (selV.has(id) ? 4.5 : 3.5) * px;
            return (
              <rect
                key={id}
                data-kind="vertex"
                data-id={id}
                x={p.x - r} y={p.y - r} width={r * 2} height={r * 2}
                fill={selV.has(id) ? '#F59E0B' : 'white'}
                stroke={selV.has(id) ? '#B45309' : '#475569'}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'move' }}
              />
            );
          })}
        </g>

        {/* caixa de seleção do objeto: 8 alças de tamanho + alça de rotação */}
        {artMode && selObj && (() => {
          const [cx, cy] = center(selObj);
          const hs = 4 * px;
          const rotY = selObj.y - 18 * px;
          return (
            <g transform={`rotate(${selObj.rotation} ${cx} ${cy})`}>
              <rect x={selObj.x} y={selObj.y} width={selObj.w} height={selObj.h} fill="none" stroke="#F59E0B" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <line x1={cx} y1={selObj.y} x2={cx} y2={rotY} stroke="#F59E0B" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <circle data-kind="obj-rot" cx={cx} cy={rotY} r={5 * px} fill="white" stroke="#F59E0B" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} />
              {[-1, 0, 1].flatMap((hy) => [-1, 0, 1].map((hx) => {
                if (!hx && !hy) return null;
                const x = cx + (hx * selObj.w) / 2, y = cy + (hy * selObj.h) / 2;
                // imagem: alças do meio são "barras" de corte; cantos escalam
                const bar = selObj.type === 'image' && (!hx || !hy);
                const bw = bar ? (hx ? 2.5 * px : 8 * px) : hs, bh = bar ? (hx ? 8 * px : 2.5 * px) : hs;
                return (
                  <rect
                    key={`${hx},${hy}`} data-kind="obj-handle" data-h={`${hx},${hy}`}
                    x={x - bw} y={y - bh} width={bw * 2} height={bh * 2} rx={bar ? 2.5 * px : 0}
                    fill="white" stroke="#B45309" strokeWidth={1} vectorEffect="non-scaling-stroke"
                    style={{ cursor: hx && hy ? (hx === hy ? 'nwse-resize' : 'nesw-resize') : hx ? 'ew-resize' : 'ns-resize' }}
                  />
                );
              }))}
            </g>
          );
        })()}
        {creating && (() => {
          const x = Math.min(creating.a[0], creating.b[0]), y = Math.min(creating.a[1], creating.b[1]);
          const w = Math.abs(creating.b[0] - creating.a[0]), h = Math.abs(creating.b[1] - creating.a[1]);
          const st = { fill: 'rgba(245,158,11,0.25)', stroke: '#F59E0B', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' as const, pointerEvents: 'none' as const };
          return creating.type === 'ellipse'
            ? <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...st} />
            : <rect x={x} y={y} width={w} height={h} {...st} />;
        })()}

        <g transform={back ? 'scale(-1 1)' : undefined}>
        {isPen && pen.start && (draw.hover || pen.drag) && (() => {
          const end = act.current?.kind === 'pen' ? act.current.p : draw.hover!.p;
          const c1 = pen.out ?? pen.start;
          const c2: Vec2 = pen.drag ? [2 * end[0] - pen.drag[0], 2 * end[1] - pen.drag[1]] : end;
          const pts = bezierPoints(pen.start, c1, c2, end, 32);
          return <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={COLORS.cut} strokeWidth={1.5} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
        })()}
        {isPen && (pen.drag || pen.out) && (() => {
          const at = act.current?.kind === 'pen' ? act.current.p : pen.start;
          const h = pen.drag ?? pen.out;
          if (!at || !h) return null;
          const m: Vec2 = [2 * at[0] - h[0], 2 * at[1] - h[1]];
          return (
            <g pointerEvents="none">
              <line x1={m[0]} y1={m[1]} x2={h[0]} y2={h[1]} stroke="#3B82F6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <circle cx={h[0]} cy={h[1]} r={3 * px} fill="white" stroke="#3B82F6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <circle cx={m[0]} cy={m[1]} r={3 * px} fill="white" stroke="#3B82F6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })()}
        {isPen && draw.hover && (
          <circle cx={draw.hover.p[0]} cy={draw.hover.p[1]} r={(draw.hover.kind === 'vertex' ? 6 : 4) * px} fill="none" stroke={draw.hover.kind === 'vertex' ? '#F59E0B' : '#64748B'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {draw.start && draw.hover && isLineTool && (
          <line
            x1={draw.start[0]} y1={draw.start[1]} x2={draw.hover.p[0]} y2={draw.hover.p[1]}
            stroke={s.tool === 'cut' ? COLORS.cut : COLORS.crease}
            strokeWidth={1.5}
            strokeDasharray={s.tool === 'crease' ? '6 4' : '2 2'}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {dragGuides.map(([a, b], i) => (
          <line key={`dg${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#D946EF" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {isLineTool && draw.hover?.guides?.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#D946EF" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {isLineTool && draw.start && draw.hover && (() => {
          const [x, y] = draw.hover.p;
          const len = Math.hypot(x - draw.start[0], y - draw.start[1]);
          const ang = (Math.atan2(-(y - draw.start[1]), x - draw.start[0]) * 180) / Math.PI;
          return (
            <text x={back ? -(x + 10 * px) : x + 10 * px} y={y - 10 * px} transform={back ? 'scale(-1 1)' : undefined} style={{ fontSize: 11 * px }} fill="#334155" stroke="white" strokeWidth={3 * px} paintOrder="stroke" pointerEvents="none">
              {len.toFixed(1)} mm · {((ang + 360) % 360).toFixed(0)}°
            </text>
          );
        })()}
        {isLineTool && draw.hover && (
          <circle
            cx={draw.hover.p[0]} cy={draw.hover.p[1]} r={(draw.hover.kind === 'vertex' ? 6 : 4) * px}
            fill="none" stroke={draw.hover.kind === 'vertex' ? '#F59E0B' : draw.hover.kind === 'edge' ? '#8B5CF6' : draw.hover.kind === 'align' ? '#D946EF' : '#64748B'}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        {marquee && (
          <rect
            x={Math.min(marquee[0][0], marquee[1][0])} y={Math.min(marquee[0][1], marquee[1][1])}
            width={Math.abs(marquee[1][0] - marquee[0][0])} height={Math.abs(marquee[1][1] - marquee[0][1])}
            fill="rgba(59,130,246,0.08)" stroke="#3B82F6" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        </g>
      </svg>

      {editDim && graph.e[editDim.id] && (() => {
        const e = graph.e[editDim.id];
        const midX = ((graph.v[e.a].x + graph.v[e.b].x) / 2) * mx, my = (graph.v[e.a].y + graph.v[e.b].y) / 2;
        return (
          <Box position="absolute" left={`${(midX - vb[0]) * v.scale}px`} top={`${(my - vb[1]) * v.scale}px`} transform="translate(-50%, -50%)" zIndex={2}>
            <input
              ref={dimInput}
              value={editDim.value}
              onChange={(ev) => setEditDim({ ...editDim, value: ev.target.value })}
              onFocus={(ev) => ev.target.select()}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') applyDim();
                if (ev.key === 'Escape') setEditDim(null);
              }}
              onBlur={() => {
                // um blur logo após abrir vem do próprio clique: devolve o foco em vez de fechar
                if (performance.now() - dimOpenedAt.current < 300) setTimeout(() => dimInput.current?.focus(), 0);
                else applyDim();
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              style={{
                width: 78, padding: '3px 6px', fontSize: 13, fontWeight: 600, textAlign: 'center',
                border: '2px solid #F59E0B', borderRadius: 8, outline: 'none', background: 'var(--chakra-colors-bg-panel)', color: 'var(--chakra-colors-fg)', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
              }}
            />
            <Text fontSize="2xs" color="gray.600" textAlign="center" mt="2px" bg="bg.panel/90" borderRadius="sm">mm · Enter</Text>
          </Box>
        );
      })()}

      {editable && isPen && (
        <Text position="absolute" top={3} left="50%" transform="translateX(-50%)" fontSize="xs" bg="bg.panel" px={3} py={1} borderRadius="full" shadow="sm" color="gray.600">
          Caneta: clique = canto · arraste = curva · Esc encerra
        </Text>
      )}
      {editable && isLineTool && (
        <Text position="absolute" top={3} left="50%" transform="translateX(-50%)" fontSize="xs" bg="bg.panel" px={3} py={1} borderRadius="full" shadow="sm" color="gray.600">
          Clique para desenhar {s.tool === 'cut' ? 'corte' : 'vinco'} · Shift = 45° · Esc/duplo clique encerra
        </Text>
      )}
      {artMode && s.cropEdit && (
        <Text position="absolute" top={3} left="50%" transform="translateX(-50%)" fontSize="xs" bg="blue.600" color="white" px={3} py={1} borderRadius="full" shadow="sm" zIndex={2}>
          Ajustando a imagem no corte: arraste para posicionar · Enter ou Esc conclui
        </Text>
      )}
      {artMode && s.tool !== 'select' && (
        <Text position="absolute" top={3} left="50%" transform="translateX(-50%)" fontSize="xs" bg="bg.panel" px={3} py={1} borderRadius="full" shadow="sm" color="gray.600">
          {s.tool === 'text' ? 'Clique para inserir um texto' : `Arraste para desenhar ${s.tool === 'rect' ? 'um retângulo' : 'uma elipse'} (clique = tamanho padrão)`} · fica recortado na face onde começar
        </Text>
      )}

      {!compact && <Group attached position="absolute" bottom={3} left={3} bg="bg.panel" borderRadius="md" shadow="xs">
        <IconButton size="xs" variant="outline" aria-label="Diminuir zoom" onClick={() => setView((c) => c && { ...c, scale: c.scale / 1.25 })}>−</IconButton>
        <Button size="xs" variant="outline" minW="52px" fontSize="11px" onClick={fit} title="Ajustar à tela">{Math.round(v.scale * 100 / 3.78)}%</Button>
        <IconButton size="xs" variant="outline" aria-label="Aumentar zoom" onClick={() => setView((c) => c && { ...c, scale: c.scale * 1.25 })}>+</IconButton>
      </Group>}
    </Box>
  );
}

/**
 * Duplo clique num ponto: canto ↔ suave (como no Figma).
 * Suave: as duas linhas de corte do ponto ganham alças alinhadas; canto: as alças do ponto recolhem.
 */
function toggleSmooth(g: Graph, vid: string): Graph {
  const inc = Object.keys(g.e).filter((k) => (g.e[k].a === vid || g.e[k].b === vid) && g.e[k].type === 'cut');
  if (!inc.length) return g;
  const P: Vec2 = [g.v[vid].x, g.v[vid].y];
  const keyAt = (k: string) => (g.e[k].a === vid ? 'c1' : 'c2') as 'c1' | 'c2';
  const isSmooth = inc.some((k) => {
    const h = g.e[k][keyAt(k)];
    return isCurved(g.e[k]) && h && Math.hypot(h[0] - P[0], h[1] - P[1]) > 1e-6;
  });
  const e = { ...g.e };
  if (isSmooth) {
    // canto: recolhe as alças deste ponto; curva que ficou sem alças vira reta
    for (const k of inc) {
      if (!isCurved(e[k])) continue;
      const ed = { ...e[k], [keyAt(k)]: P };
      const other = ed[keyAt(k) === 'c1' ? 'c2' : 'c1']!;
      const O = g.v[keyAt(k) === 'c1' ? ed.b : ed.a];
      if (Math.hypot(other[0] - O.x, other[1] - O.y) < 1e-6) { delete ed.c1; delete ed.c2; }
      e[k] = ed;
    }
    return { ...g, e };
  }
  if (inc.length !== 2) return g;
  // suave: alças na direção que liga os dois vizinhos, com 1/3 do comprimento de cada linha
  const far = (k: string): Vec2 => { const o = g.v[g.e[k].a === vid ? g.e[k].b : g.e[k].a]; return [o.x, o.y]; };
  const [n0, n1] = inc.map(far);
  let t: Vec2 = [n1[0] - n0[0], n1[1] - n0[1]];
  const lt = Math.hypot(...t) || 1;
  t = [t[0] / lt, t[1] / lt];
  inc.forEach((k, i) => {
    const ed = { ...e[k] };
    const A: Vec2 = [g.v[ed.a].x, g.v[ed.a].y], B: Vec2 = [g.v[ed.b].x, g.v[ed.b].y];
    if (!isCurved(ed)) [ed.c1, ed.c2] = straightHandles(A, B);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) / 3;
    const sign = i === 0 ? -1 : 1; // para o lado do vizinho
    ed[keyAt(k)] = [P[0] + sign * t[0] * L, P[1] + sign * t[1] * L];
    e[k] = ed;
  });
  return { ...g, e };
}
