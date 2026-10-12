import { Box, Button, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import { ArrowLeftRight, FoldVertical, ListOrdered, Ruler, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { DEFAULT_ANGLE, deleteEdges, deleteVertices, normalize, updateEdges, type EdgeType } from '../geometry/graph';
import { faceOfHinge, withSteps } from '../geometry/faces';
import { stepCount } from '../geometry/fold';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { IconToggles, NumField, Section } from './ui';

const Hint = ({ children }: { children: ReactNode }) => <Text fontSize="10px" color="gray.500" mt={2}>{children}</Text>;

/** Propriedades do que está selecionado no editor (arestas, vértices ou face). */
export function Inspector() {
  const s = useStore();
  const { dieline, conflicts } = useDieline();
  const g = s.doc.graph;
  const { edges, vertices, face } = s.sel;

  if (edges.length) {
    const list = edges.map((id) => g.e[id]).filter(Boolean);
    const type = list.every((e) => e.type === list[0].type) ? list[0].type : undefined;
    const creaseIds = edges.filter((id) => g.e[id]?.type === 'crease');
    const crease = creaseIds.length ? g.e[creaseIds[0]] : undefined;
    const len = list.reduce((sum, e) => sum + Math.hypot(g.v[e.b].x - g.v[e.a].x, g.v[e.b].y - g.v[e.a].y), 0);
    const setType = (t: EdgeType) => s.commit({ graph: updateEdges(g, edges, { type: t, ...(t === 'crease' ? { angle: DEFAULT_ANGLE } : {}) }) });
    const setAngle = (a: number) => s.commit({ graph: updateEdges(g, creaseIds, { angle: Math.max(-180, Math.min(180, a)) }) });
    const f = crease ? faceOfHinge(g, dieline, creaseIds[0]) : undefined;
    const total = stepCount(dieline.faces);
    // fechamento em %: 100% = 90°; o sinal (sentido) é mantido
    const pct = crease ? Math.round((Math.abs(crease.angle) / 90) * 100) : 0;
    const setPct = (p: number) => crease && setAngle((crease.angle < 0 ? -1 : 1) * +((90 * Math.max(0, p)) / 100).toFixed(1));

    return (
      <>
        <Section
          title={edges.length > 1 ? `${edges.length} linhas` : 'Linha'}
          action={
            <Button size="2xs" variant="ghost" onClick={() => { s.commit({ graph: deleteEdges(g, edges) }); s.select({}); }} title="Excluir (Del)">
              <Trash2 size={12} />
            </Button>
          }
        >
          <IconToggles items={[
            { key: 'cut', icon: <Text fontSize="11px" color={type === 'cut' ? 'red.600' : undefined}>Corte</Text>, active: type === 'cut', title: 'Linha de corte', onClick: () => setType('cut') },
            { key: 'crease', icon: <Text fontSize="11px" color={type === 'crease' ? 'blue.600' : undefined}>Vinco</Text>, active: type === 'crease', title: 'Linha de vinco', onClick: () => setType('crease') },
          ]} />
          <Hint>Comprimento {len.toFixed(2).replace('.', ',')} mm · duplo clique na linha insere vértice</Hint>
        </Section>

        {crease && (
          <Section title="Dobra">
            <SimpleGrid columns={2} gap={1.5}>
              <NumField prefix="∠" suffix="°" title="Ângulo da dobra" min={-180} value={crease.angle} onChange={setAngle} />
              <NumField prefix={<FoldVertical size={11} />} suffix="%" title="Fechamento (100% = 90°)" min={0} step={5} value={pct} onChange={setPct} />
            </SimpleGrid>
            <Flex gap={1.5} mt={1.5}>
              <Box flex={1}>
                <IconToggles items={[25, 50, 75, 100].map((p) => ({ key: String(p), icon: <Text fontSize="10px">{p}%</Text>, active: pct === p, title: `Fechar ${p}%`, onClick: () => setPct(p) }))} />
              </Box>
              <Button size="2xs" h="28px" variant="subtle" onClick={() => setAngle(-crease.angle)} title="Inverter o sentido da dobra">
                <ArrowLeftRight size={12} />
              </Button>
            </Flex>
            {f?.step && (
              <Box mt={1.5}>
                <NumField
                  prefix={<ListOrdered size={11} />}
                  suffix={`de ${total}`}
                  title="Etapa da montagem (número maior = dobra depois)"
                  min={1}
                  value={f.step}
                  onChange={(v) => s.commit({ graph: withSteps(g, dieline, Object.fromEntries(creaseIds.map((id) => [id, Math.max(1, Math.round(v))]))) })}
                />
                <Hint>Dobra "{f.name}" · etapa {g.e[creaseIds[0]].step ? 'definida por você' : 'automática'}</Hint>
              </Box>
            )}
          </Section>
        )}
      </>
    );
  }

  if (vertices.length) {
    const one = vertices.length === 1 ? g.v[vertices[0]] : undefined;
    const move = (axis: 'x' | 'y', val: number) => {
      const ng = { ...g, v: { ...g.v, [vertices[0]]: { ...one!, [axis]: val } } };
      s.commit({ graph: normalize(ng, 0.01) });
    };
    return (
      <Section
        title={one ? 'Vértice' : `${vertices.length} vértices`}
        action={
          <Button size="2xs" variant="ghost" onClick={() => { s.commit({ graph: deleteVertices(g, vertices) }); s.select({}); }} title="Excluir (Del)">
            <Trash2 size={12} />
          </Button>
        }
      >
        {one && (
          <SimpleGrid columns={2} gap={1.5}>
            <NumField prefix="X" title="X (mm)" min={-1e6} step={0.1} value={+one.x.toFixed(3)} onChange={(v) => move('x', v)} />
            <NumField prefix="Y" title="Y (mm)" min={-1e6} step={0.1} value={+one.y.toFixed(3)} onChange={(v) => move('y', v)} />
          </SimpleGrid>
        )}
        <Hint>Arraste para mover · setas 0,1 mm (Shift 1 mm) · Shift trava o eixo</Hint>
      </Section>
    );
  }

  const f = dieline.faces.find((x) => x.id === face);
  if (f) {
    const isRoot = !f.parent;
    return (
      <Section title="Face">
        <Box h="28px" bg="gray.50" borderRadius="6px" px={2} display="flex" alignItems="center">
          <input
            defaultValue={f.name}
            key={f.id}
            onBlur={(e) => e.target.value !== f.name && s.commit({ names: { ...s.doc.names, [f.id]: e.target.value } })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12 }}
          />
        </Box>
        <Flex justify="space-between" fontSize="10px" color="gray.500" mt={2}>
          <span><Ruler size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {(f.area / 100).toFixed(1).replace('.', ',')} cm²</span>
          <span>{isRoot ? 'Base da dobra' : `Dobra ${f.angle}°`}</span>
        </Flex>
        {conflicts.filter((c) => c.face === f.id).map((c) => {
          const other = dieline.faces.find((x) => x.id === c.other)?.name ?? 'outra face';
          return (
            <Text key={c.other} fontSize="11px" color="red.600" bg="red.50" p={2} borderRadius="6px" mt={2}>
              {c.kind === 'overlap'
                ? `Sobrepõe "${other}" na caixa montada (${c.area.toFixed(0)} mm²).`
                : `Passa ${c.area.toFixed(0)} mm² da borda de "${other}".`}
            </Text>
          );
        })}
        {!isRoot && (
          <Button size="2xs" variant="subtle" w="full" mt={2} onClick={() => s.commit({ root: f.id })}>Definir como base da dobra</Button>
        )}
      </Section>
    );
  }

  return (
    <Section title="Seleção">
      <Text fontSize="11px" color="gray.500">Clique numa linha, vértice ou face. Arraste no vazio para selecionar vários (Shift soma).</Text>
    </Section>
  );
}
