import { Button, Flex, Group, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { DEFAULT_ANGLE, deleteEdges, deleteVertices, normalize, updateEdges, type EdgeType } from '../geometry/graph';
import { faceOfHinge, withSteps } from '../geometry/faces';
import { stepCount } from '../geometry/fold';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { NumField, Section } from './ui';

/** Propriedades do que está selecionado no editor (arestas, vértices ou face). */
export function Inspector() {
  const s = useStore();
  const { dieline, conflicts } = useDieline();
  const g = s.doc.graph;
  const { edges, vertices, face } = s.sel;

  if (edges.length) {
    const list = edges.map((id) => g.e[id]).filter(Boolean);
    const type = list.every((e) => e.type === list[0].type) ? list[0].type : undefined;
    const creases = list.filter((e) => e.type === 'crease');
    const len = list.reduce((sum, e) => sum + Math.hypot(g.v[e.b].x - g.v[e.a].x, g.v[e.b].y - g.v[e.a].y), 0);
    const setType = (t: EdgeType) => s.commit({ graph: updateEdges(g, edges, { type: t, ...(t === 'crease' ? { angle: DEFAULT_ANGLE } : {}) }) });
    return (
      <Section title={edges.length > 1 ? `${edges.length} linhas` : 'Linha'}>
        <Stack gap={4}>
          <Group attached w="full">
            <Button flex={1} size="sm" variant={type === 'cut' ? 'solid' : 'outline'} colorPalette="red" onClick={() => setType('cut')}>Corte</Button>
            <Button flex={1} size="sm" variant={type === 'crease' ? 'solid' : 'outline'} colorPalette="blue" onClick={() => setType('crease')}>Vinco</Button>
          </Group>
          {creases.length > 0 && (
            <SimpleGrid columns={2} gap={3} alignItems="end">
              <NumField
                label="Ângulo da dobra (°)"
                min={-180}
                value={creases[0].angle}
                onChange={(v) => s.commit({ graph: updateEdges(g, edges.filter((id) => g.e[id].type === 'crease'), { angle: Math.max(-180, Math.min(180, v)) }) })}
              />
              <Button
                size="md"
                variant="outline"
                onClick={() => s.commit({ graph: updateEdges(g, edges.filter((id) => g.e[id].type === 'crease'), { angle: -creases[0].angle }) })}
              >
                Inverter
              </Button>
            </SimpleGrid>
          )}
          {creases.length > 0 && (() => {
            // fechamento em %: 100% = 90°; o sinal (sentido) é mantido
            const ids = edges.filter((id) => g.e[id].type === 'crease');
            const a = creases[0].angle;
            const sign = a < 0 ? -1 : 1;
            const pct = Math.round((Math.abs(a) / 90) * 100);
            const setPct = (p: number) => s.commit({ graph: updateEdges(g, ids, { angle: sign * Math.min(180, Math.max(0, +(90 * p / 100).toFixed(1))) }) });
            return (
              <Stack gap={2}>
                <SimpleGrid columns={2} gap={3} alignItems="end">
                  <NumField label="Fechamento (%)" min={0} step={5} value={pct} onChange={setPct} />
                  <Text fontSize="xs" color="gray.500" pb={2}>100% = 90° · 200% = 180°</Text>
                </SimpleGrid>
                <Group attached w="full">
                  {[25, 50, 75, 100].map((p) => (
                    <Button key={p} flex={1} size="xs" variant={pct === p ? 'solid' : 'outline'} onClick={() => setPct(p)}>{p}%</Button>
                  ))}
                </Group>
              </Stack>
            );
          })()}
          {creases.length > 0 && (() => {
            const ids = edges.filter((id) => g.e[id].type === 'crease');
            const f = faceOfHinge(g, dieline, ids[0]);
            if (!f?.step) return null;
            const total = stepCount(dieline.faces);
            return (
              <Stack gap={1}>
                <SimpleGrid columns={2} gap={3} alignItems="end">
                  <NumField
                    label={`Etapa da montagem (de ${total})`}
                    min={1}
                    value={f.step}
                    onChange={(v) => s.commit({ graph: withSteps(g, dieline, Object.fromEntries(ids.map((id) => [id, Math.max(1, Math.round(v))]))) })}
                  />
                  <Text fontSize="xs" color="gray.500" pb={2}>{g.e[ids[0]].step ? 'definida por você' : 'automática'}</Text>
                </SimpleGrid>
                <Text fontSize="xs" color="gray.500">Dobra "{f.name}". Use um número maior para dobrar depois.</Text>
              </Stack>
            );
          })()}
          <Text fontSize="xs" color="gray.500">Comprimento: {len.toFixed(2)} mm · duplo clique na linha insere um vértice</Text>
          <Button size="sm" variant="outline" colorPalette="red" onClick={() => { s.commit({ graph: deleteEdges(g, edges) }); s.select({}); }}>
            Excluir linha{edges.length > 1 ? 's' : ''}
          </Button>
        </Stack>
      </Section>
    );
  }

  if (vertices.length) {
    const one = vertices.length === 1 ? g.v[vertices[0]] : undefined;
    const move = (axis: 'x' | 'y', val: number) => {
      const ng = { ...g, v: { ...g.v, [vertices[0]]: { ...one!, [axis]: val } } };
      s.commit({ graph: normalize(ng, 0.01) });
    };
    return (
      <Section title={one ? 'Vértice' : `${vertices.length} vértices`}>
        <Stack gap={4}>
          {one && (
            <SimpleGrid columns={2} gap={3}>
              <NumField label="X (mm)" min={-1e6} step={0.1} value={+one.x.toFixed(3)} onChange={(v) => move('x', v)} />
              <NumField label="Y (mm)" min={-1e6} step={0.1} value={+one.y.toFixed(3)} onChange={(v) => move('y', v)} />
            </SimpleGrid>
          )}
          <Text fontSize="xs" color="gray.500">Arraste para mover · setas = 0,1 mm (Shift = 1 mm) · Shift trava o eixo</Text>
          <Button size="sm" variant="outline" colorPalette="red" onClick={() => { s.commit({ graph: deleteVertices(g, vertices) }); s.select({}); }}>
            Excluir vértice{vertices.length > 1 ? 's' : ''}
          </Button>
        </Stack>
      </Section>
    );
  }

  const f = dieline.faces.find((x) => x.id === face);
  if (f) {
    const isRoot = !f.parent;
    return (
      <Section title="Face">
        <Stack gap={3}>
          <Input
            size="sm"
            defaultValue={f.name}
            key={f.id}
            onBlur={(e) => e.target.value !== f.name && s.commit({ names: { ...s.doc.names, [f.id]: e.target.value } })}
          />
          <Flex justify="space-between" fontSize="xs" color="gray.500">
            <span>Área: {(f.area / 100).toFixed(1)} cm²</span>
            <span>{isRoot ? 'Base da dobra' : `Dobra: ${f.angle}°`}</span>
          </Flex>
          {conflicts.filter((c) => c.face === f.id).map((c) => {
            const other = dieline.faces.find((x) => x.id === c.other)?.name ?? 'outra face';
            return (
              <Text key={c.other} fontSize="xs" color="red.600" bg="red.50" p={2} borderRadius="md">
                {c.kind === 'overlap'
                  ? `Sobrepõe "${other}" na caixa montada (${c.area.toFixed(0)} mm²). Reduza uma das abas.`
                  : `Passa ${c.area.toFixed(0)} mm² da borda de "${other}", onde deveria ser colada.`}
              </Text>
            );
          })}
          {!isRoot && (
            <Button size="sm" variant="outline" onClick={() => s.commit({ root: f.id })}>Definir como base</Button>
          )}
        </Stack>
      </Section>
    );
  }

  return (
    <Section title="Seleção">
      <Text fontSize="sm" color="gray.500">
        Clique numa linha, vértice ou face. Arraste no vazio para selecionar vários (Shift soma).
      </Text>
    </Section>
  );
}
