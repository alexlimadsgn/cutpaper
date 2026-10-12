import { Line, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildBackSvg, buildSvg } from '../export/svg';
import { centroid } from '../geometry/faces';
import { foldMatrices } from '../geometry/fold';
import { hasInterior, useStore } from '../store';
import { useDieline } from '../useDieline';

const MM = 0.01; // 100 mm = 1 unidade

/** Rasteriza um SVG numa textura; `flip` espelha na horizontal (verso → referencial da frente). */
function useSvgTexture(svg: string | undefined, viewBox: number[], flip: boolean) {
  const [texture, setTexture] = useState<THREE.Texture>();
  useEffect(() => {
    if (!svg) { setTexture((old) => (old?.dispose(), undefined)); return; }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (cancelled) return;
      const pxPerMm = Math.min(8, 4096 / Math.max(viewBox[2], viewBox[3]));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewBox[2] * pxPerMm);
      canvas.height = Math.round(viewBox[3] * pxPerMm);
      const ctx = canvas.getContext('2d')!;
      if (flip) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      setTexture((old) => (old?.dispose(), tex));
    };
    img.src = url;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, flip, viewBox.join(',')]);
  return texture;
}

/** Texturas da arte: exterior (frente do papel) e interior (verso), com o mesmo SVG do export. */
function useArtTextures() {
  const { dieline, viewBox } = useDieline();
  const s = useStore();
  const { bleed, fullImage, faceImages, faceColors, bgColor, dragging, interior, fontsVersion } = s;
  const objects = s.doc.objects;
  const inside = hasInterior(s);
  const svgs = useMemo(() => {
    if (dragging) return null; // a textura é refeita ao soltar
    return {
      out: buildSvg({
        dieline, bleed, fullImage, faceImages, faceColors, bgColor, objects, background: '#ffffff',
        layers: { artwork: true, bleed: false, cut: false, crease: false },
      }),
      in: inside ? buildBackSvg({ dieline, bleed, art: interior, objects, guides: false, background: '#f1efe9' }) : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dieline, bleed, fullImage, faceImages, faceColors, bgColor, objects, interior, inside, dragging, fontsVersion]);
  const last = useRef(svgs);
  if (svgs) last.current = svgs;
  return {
    outside: useSvgTexture(last.current?.out, viewBox, false),
    inside: useSvgTexture(last.current?.in, viewBox, true),
  };
}

function Box3D() {
  const { dieline, viewBox, conflicts } = useDieline();
  const fold = useStore((s) => s.fold);
  const bad = new Set(conflicts.map((c) => c.face));
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const graph = useStore((s) => s.doc.graph);

  // linhas selecionadas no 2D: cada uma é desenhada junto da face que a contém
  const selLines = useMemo(() => {
    const out = new Map<string, [number, number, number][][]>();
    for (const eid of sel.edges) {
      const e = graph.e[eid];
      if (!e) continue;
      const a = graph.v[e.a], b = graph.v[e.b];
      const has = (f: (typeof dieline.faces)[number], p: { x: number; y: number }) =>
        [f.poly, ...f.holes].some((ring) => ring.some(([x, y]) => Math.abs(x - p.x) < 1e-6 && Math.abs(y - p.y) < 1e-6));
      // prefere a face-filho (a que dobra nessa linha), senão qualquer uma que contenha a linha
      const owners = dieline.faces.filter((f) => has(f, a) && has(f, b));
      const f = owners.find((o) => o.parent) ?? owners[0];
      if (!f) continue;
      out.set(f.id, [...(out.get(f.id) ?? []), [[a.x, a.y, 0], [b.x, b.y, 0]]]);
    }
    return out;
  }, [sel.edges, graph, dieline]);
  const { outside: texture, inside: insideTex } = useArtTextures();

  const geometries = useMemo(
    () =>
      dieline.faces.map((f) => {
        const shape = new THREE.Shape(f.poly.map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = f.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
        const geo = new THREE.ShapeGeometry(shape);
        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = (pos.getX(i) - viewBox[0]) / viewBox[2];
          uv[i * 2 + 1] = 1 - (pos.getY(i) - viewBox[1]) / viewBox[3];
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return { id: f.id, geo };
      }),
    [dieline, viewBox],
  );
  useEffect(() => () => geometries.forEach((g) => g.geo.dispose()), [geometries]);

  const matrices = useMemo(() => foldMatrices(dieline.faces, fold), [dieline, fold]);
  // centraliza na face base (a maior sem pai)
  const root = dieline.faces.filter((f) => !f.parent).sort((a, b) => b.area - a.area)[0];
  const [cx, cy] = root ? centroid(root.poly) : [0, 0];
  // moldes muito grandes/pequenos (ex.: SVG importado) são enquadrados automaticamente
  const span = Math.max(viewBox[2], viewBox[3]);
  const unit = span > 400 || span < 50 ? 2.7 / span : MM;

  return (
    // gira o plano XY para o chão (+Z da dobra vira +Y = para cima)
    <group scale={unit} rotation={[-Math.PI / 2, 0, 0]}>
      <group position={[-cx, -cy, 0]}>
        {geometries.map(({ id, geo }) => {
          const selected = sel.face === id;
          const lines = selLines.get(id);
          return (
          <group key={id} matrix={matrices.get(id)} matrixAutoUpdate={false}>
            <mesh
              geometry={geo}
              onClick={(e) => {
                if (e.delta > 4) return; // foi arrasto da órbita
                e.stopPropagation();
                select({ face: id });
              }}
            >
              <meshStandardMaterial key={texture?.uuid} map={texture ?? null} color={bad.has(id) ? '#fca5a5' : '#ffffff'} emissive={selected ? '#f59e0b' : '#000000'} emissiveIntensity={selected ? 0.55 : 0} side={THREE.BackSide} roughness={0.8} />
            </mesh>
            <mesh geometry={geo} onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); select({ face: id }); }}>
              <meshStandardMaterial key={insideTex?.uuid ?? 'plain'} map={insideTex ?? null} color={bad.has(id) ? '#ef4444' : insideTex ? '#ffffff' : '#f1efe9'} emissive={selected ? '#f59e0b' : '#000000'} emissiveIntensity={selected ? 0.55 : 0} side={THREE.FrontSide} roughness={0.9} />
            </mesh>
            <lineSegments>
              <edgesGeometry args={[geo]} />
              <lineBasicMaterial color={selected ? '#F59E0B' : '#b9b4aa'} />
            </lineSegments>
            {lines?.map((pts, i) => (
              <Line key={i} points={pts} color="#F59E0B" lineWidth={4} depthTest={false} renderOrder={10} />
            ))}
          </group>
          );
        })}
      </group>
    </group>
  );
}

export function Preview3D({ compact = false }: { compact?: boolean }) {
  // na miniatura a câmera fica mais afastada para caber a caixa inteira
  const k = compact ? 1.3 : 1;
  return (
    <Canvas camera={{ position: [2.2 * k, 2 * k, 2.8 * k], fov: 35 }} dpr={[1, 2]}>
      <color attach="background" args={['#f4f4f5']} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 5, 2]} intensity={1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} />
      <Box3D />
      <gridHelper args={[6, 30, '#d4d4d8', '#e4e4e7']} position={[0, -0.001, 0]} />
      <OrbitControls makeDefault target={[0, 0.2, 0]} />
    </Canvas>
  );
}
