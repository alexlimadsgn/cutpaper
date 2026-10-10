import { Box, Button, Group, IconButton, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buildArt, COLORS } from '../export/svg';
import {
  addSegments, deleteEdges, deleteVertices, moveVertices, normalize, splitEdge, type Graph,
} from '../geometry/graph';
import { polyToPath } from '../geometry/outline';
import type { Vec2 } from '../geometry/types';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

interface View { cx: number; cy: number; scale: number } // scale = px por mm

type Interaction =
  | { kind: 'drag'; ids: string[]; anchor: string; start: Vec2; base: Graph; moved: boolean }
  | { kind: 'pan'; client: Vec2; view: View }
  | { kind: 'marquee'; start: Vec2; cur: Vec2; additive: boolean; face?: string; moved: boolean };

interface Snap { p: Vec2; kind: 'vertex' | 'edge' | 'grid' | 'free'; vid?: string }

const SNAP_PX = 8;

export function Editor2D({ compact = false }: { compact?: boolean }) {
  const { dieline, material, bleedPolys, conflicts, viewBox: fitBox } = useDieline();
  const bad = new Set(conflicts.map((c) => c.face));
  const s = useStore();
  const { graph } = s.doc;
  // fora do modo Estrutura (ou na miniatura) o molde fica travado: só faces são clicáveis
  const editable = s.mode === 'structure' && !compact;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const act = useRef<Interaction | null>(null);
  const [marquee, setMarquee] = useState<[Vec2, Vec2] | null>(null);
  const [draw, setDraw] = useState<{ start: Vec2 | null; hover: Snap | null }>({ start: null, hover: null });
  const [space, setSpace] = useState(false);

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
    setView({ cx: fitBox[0] + fitBox[2] / 2, cy: fitBox[1] + fitBox[3] / 2, scale });
  }, [size, fitBox]);
  useEffect(() => { if (!view && size.w) fit(); }, [view, size, fit]);
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

  const snapPoint = (p: Vec2, exclude: Set<string> = new Set(), edges = true): Snap => {
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
        const e = graph.e[id], A = graph.v[e.a], B = graph.v[e.b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const t = Math.max(0, Math.min(1, ((p[0] - A.x) * dx + (p[1] - A.y) * dy) / (dx * dx + dy * dy)));
        const q: Vec2 = [A.x + t * dx, A.y + t * dy];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bd) { bd = d; best = { p: q, kind: 'edge' }; }
      }
      if (best) return best;
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

  // ---------- ponteiro ----------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toMM(e.clientX, e.clientY);
    if (e.button === 1 || space) {
      act.current = { kind: 'pan', client: [e.clientX, e.clientY], view: v };
      return;
    }
    if (e.button !== 0) return;

    if (s.tool !== 'select') {
      const snap = snapPoint(p);
      let pt = snap.p;
      if (draw.start && e.shiftKey && snap.kind !== 'vertex') pt = constrain(draw.start, p);
      if (!draw.start) return setDraw({ start: pt, hover: snap });
      if (Math.hypot(pt[0] - draw.start[0], pt[1] - draw.start[1]) > 0.01)
        s.commit({ graph: addSegments(graph, [{ a: draw.start, b: pt, type: s.tool }]) });
      // fechar sobre um vértice existente encerra a linha
      setDraw({ start: snap.kind === 'vertex' ? null : pt, hover: snap });
      return;
    }

    const target = e.target as Element;
    const kind = target.getAttribute('data-kind');
    const id = target.getAttribute('data-id') ?? undefined;

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
    const p = toMM(e.clientX, e.clientY);
    const a = act.current;
    if (!a) {
      if (s.tool !== 'select') {
        const snap = snapPoint(p);
        if (draw.start && e.shiftKey && snap.kind !== 'vertex') snap.p = constrain(draw.start, p);
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
    } else if (a.kind === 'drag') {
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
          for (const id in a.base.v) {
            if (a.ids.includes(id)) continue;
            const o = a.base.v[id];
            if (Math.abs(o.x - target[0]) < 5 * px) ax = o.x;
            if (Math.abs(o.y - target[1]) < 5 * px) ay = o.y;
          }
          target = [ax, ay];
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
    if (a.kind === 'drag') s.endDrag(a.moved);
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
    if (s.tool !== 'select') return setDraw({ start: null, hover: null });
    const target = e.target as Element;
    if (target.getAttribute('data-kind') !== 'edge') return;
    const { g, vid } = splitEdge(graph, target.getAttribute('data-id')!, toMM(e.clientX, e.clientY));
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
      if (mod && e.key.toLowerCase() === 'a' && st.mode === 'structure') {
        e.preventDefault();
        return st.select({ vertices: Object.keys(g.v), edges: Object.keys(g.e) });
      }
      if (mod) return;
      if (st.mode !== 'structure' && e.key !== 'Escape') return;
      switch (e.key) {
        case 'Escape':
          setDraw({ start: null, hover: null });
          st.select({});
          break;
        case 'Enter':
          setDraw({ start: null, hover: null });
          break;
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
  }, []);

  useEffect(() => { if (s.tool === 'select') setDraw({ start: null, hover: null }); }, [s.tool]);

  // ---------- arte (congelada durante o arrasto para não recarregar imagens a cada frame) ----------
  const frozen = useRef({ dieline, bleedPolys });
  if (!s.dragging) frozen.current = { dieline, bleedPolys };
  const art = useMemo(
    () => buildArt(frozen.current.dieline, frozen.current.bleedPolys, s, 'ed'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frozen.current, s.fullImage, s.faceImages, s.faceColors, s.bgColor],
  );

  const selV = new Set(s.sel.vertices), selE = new Set(s.sel.edges);

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
  const gridStep = s.grid > 0 ? [1, 5, 10, 50, 100].map((k) => k * s.grid).find((g) => g * v.scale >= 10) : undefined;
  const cursor = space ? 'grab' : s.tool !== 'select' ? 'crosshair' : 'default';

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

        <path d={polyToPath(material)} fill="white" fillRule="evenodd" pointerEvents="none" />
        {s.layers.artwork && <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: art.body }} />}
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
            stroke={s.sel.face === f.id ? '#F59E0B' : 'none'}
            strokeWidth={s.mode === 'structure' ? 2 : 3}
            vectorEffect="non-scaling-stroke"
          >
            <title>{f.name}</title>
          </path>
        ))}

        {Object.entries(graph.e).map(([id, e]) => {
          const A = graph.v[e.a], B = graph.v[e.b];
          const visible = e.type === 'cut' ? s.layers.cut : s.layers.crease;
          const selected = selE.has(id);
          return (
            <g key={id} className="edge">
              <line
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                className="vis"
                stroke={selected ? '#F59E0B' : e.type === 'cut' ? COLORS.cut : COLORS.crease}
                strokeWidth={selected ? 2.5 : 1.25}
                strokeDasharray={e.type === 'crease' ? '6 4' : undefined}
                strokeOpacity={visible || selected ? 1 : 0.15}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {editable && s.tool === 'select' && (
                <line data-kind="edge" data-id={id} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={10 * px} style={{ cursor: 'move' }} />
              )}
            </g>
          );
        })}

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

        {draw.start && draw.hover && (
          <line
            x1={draw.start[0]} y1={draw.start[1]} x2={draw.hover.p[0]} y2={draw.hover.p[1]}
            stroke={s.tool === 'cut' ? COLORS.cut : COLORS.crease}
            strokeWidth={1.5}
            strokeDasharray={s.tool === 'crease' ? '6 4' : '2 2'}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {s.tool !== 'select' && draw.hover && (
          <circle
            cx={draw.hover.p[0]} cy={draw.hover.p[1]} r={(draw.hover.kind === 'vertex' ? 6 : 4) * px}
            fill="none" stroke={draw.hover.kind === 'vertex' ? '#F59E0B' : draw.hover.kind === 'edge' ? '#8B5CF6' : '#64748B'}
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
      </svg>

      {editable && s.tool !== 'select' && (
        <Text position="absolute" top={3} left="50%" transform="translateX(-50%)" fontSize="xs" bg="white" px={3} py={1} borderRadius="full" shadow="sm" color="gray.600">
          Clique para desenhar {s.tool === 'cut' ? 'corte' : 'vinco'} · Shift = 45° · Esc/duplo clique encerra
        </Text>
      )}

      {!compact && <Group attached position="absolute" bottom={4} left={4} bg="white" borderRadius="md" shadow="sm">
        <IconButton size="sm" variant="outline" aria-label="Diminuir zoom" onClick={() => setView((c) => c && { ...c, scale: c.scale / 1.25 })}>−</IconButton>
        <Button size="sm" variant="outline" onClick={fit} title="Ajustar à tela">{Math.round(v.scale * 100 / 3.78)}%</Button>
        <IconButton size="sm" variant="outline" aria-label="Aumentar zoom" onClick={() => setView((c) => c && { ...c, scale: c.scale * 1.25 })}>+</IconButton>
      </Group>}
    </Box>
  );
}
