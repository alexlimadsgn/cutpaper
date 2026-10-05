import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { buildSvg } from '../export/svg';
import type { Face } from '../geometry/types';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

const MM = 0.01; // 100 mm = 1 unidade

/** Rasteriza a arte (mesmo SVG do export) numa textura para o 3D. */
function useArtTexture() {
  const { dieline, viewBox } = useDieline();
  const { bleed, fullImage, faceImages } = useStore();
  const [texture, setTexture] = useState<THREE.Texture>();

  useEffect(() => {
    const svg = buildSvg({
      dieline, bleed, fullImage, faceImages, background: '#ffffff',
      layers: { artwork: true, bleed: false, cut: false, crease: false },
    });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const pxPerMm = Math.min(8, 4096 / Math.max(viewBox[2], viewBox[3]));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewBox[2] * pxPerMm);
      canvas.height = Math.round(viewBox[3] * pxPerMm);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      setTexture((old) => (old?.dispose(), tex));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [dieline, bleed, fullImage, faceImages, viewBox]);

  return texture;
}

/** Matriz de cada face: compõe as rotações ao longo da árvore de dobras. */
function foldMatrices(faces: Face[], t: number) {
  const byId = new Map(faces.map((f) => [f.id, f]));
  const cache = new Map<string, THREE.Matrix4>();
  const get = (f: Face): THREE.Matrix4 => {
    const hit = cache.get(f.id);
    if (hit) return hit;
    let m = new THREE.Matrix4();
    if (f.parent && f.hinge) {
      const [a, b] = f.hinge;
      const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
      // centroide da face relativo à dobradiça
      const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length - a[0];
      const cy = f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length - a[1];
      // Com Y para baixo, quem olha o SVG vê o lado −Z (lado impresso).
      // A dobra vai para +Z, deixando a impressão do lado de fora.
      if (axis.x * cy - axis.y * cx < 0) axis.negate();
      const angle = THREE.MathUtils.degToRad((f.angle ?? 90) * t);
      const local = new THREE.Matrix4()
        .makeTranslation(a[0], a[1], 0)
        .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
        .multiply(new THREE.Matrix4().makeTranslation(-a[0], -a[1], 0));
      m = get(byId.get(f.parent)!).clone().multiply(local);
    }
    cache.set(f.id, m);
    return m;
  };
  return new Map(faces.map((f) => [f.id, get(f)]));
}

function Box3D() {
  const { dieline, viewBox } = useDieline();
  const fold = useStore((s) => s.fold);
  const texture = useArtTexture();

  const geometries = useMemo(
    () =>
      dieline.faces.map((f) => {
        const geo = new THREE.ShapeGeometry(new THREE.Shape(f.poly.map(([x, y]) => new THREE.Vector2(x, y))));
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
  const root = dieline.faces[0].poly;
  const cx = (root[0][0] + root[2][0]) / 2;
  const cy = (root[0][1] + root[2][1]) / 2;

  return (
    // gira o plano XY para o chão (+Z da dobra vira +Y = para cima)
    <group scale={MM} rotation={[-Math.PI / 2, 0, 0]}>
      <group position={[-cx, -cy, 0]}>
        {geometries.map(({ id, geo }) => (
          <group key={id} matrix={matrices.get(id)} matrixAutoUpdate={false}>
            <mesh geometry={geo}>
              <meshStandardMaterial key={texture?.uuid} map={texture ?? null} side={THREE.BackSide} roughness={0.8} />
            </mesh>
            <mesh geometry={geo}>
              <meshStandardMaterial color="#f1efe9" side={THREE.FrontSide} roughness={0.9} />
            </mesh>
            <lineSegments>
              <edgesGeometry args={[geo]} />
              <lineBasicMaterial color="#b9b4aa" />
            </lineSegments>
          </group>
        ))}
      </group>
    </group>
  );
}

export function Preview3D() {
  return (
    <Canvas camera={{ position: [2.2, 2, 2.8], fov: 35 }} dpr={[1, 2]}>
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
