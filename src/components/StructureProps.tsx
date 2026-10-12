import { Box, NativeSelect, SimpleGrid, Text } from '@chakra-ui/react';
import { graphBounds, scaleGraph } from '../geometry/graph';
import { TEMPLATES, type TemplateId } from '../geometry/templates';
import { useStore } from '../store';
import { Inspector } from './Inspector';
import { Check, NumField, Section } from './ui';

/** Propriedades do modo Edição: seleção + molde + modelo paramétrico. */
export function StructureProps() {
  const s = useStore();
  const { params, setParam } = s;
  const b = graphBounds(s.doc.graph);
  const lim = TEMPLATES[s.template].limits(params);
  const clamped = [
    params.glue > lim.glue && `abas de cola limitadas a ${lim.glue} mm`,
    params.tuck > lim.tuck && `aba da tampa limitada a ${lim.tuck} mm`,
  ].filter(Boolean);

  const resize = (axis: 'w' | 'h', val: number) => {
    if (val <= 0 || !b.w || !b.h) return;
    const k = axis === 'w' ? val / b.w : val / b.h; // proporcional
    s.commit({ graph: scaleGraph(s.doc.graph, k, k, [b.minX, b.minY]) });
  };

  return (
    <>
      <Inspector />

      <Section title="Molde">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="Largura total (mm)" step={0.5} value={+b.w.toFixed(2)} onChange={(v) => resize('w', v)} />
          <NumField label="Altura total (mm)" step={0.5} value={+b.h.toFixed(2)} onChange={(v) => resize('h', v)} />
          <NumField label="Sangria (mm)" value={s.bleed} step={0.5} onChange={s.setBleed} />
          <NumField label="Grade/snap (mm)" value={s.grid} step={0.5} onChange={s.setGrid} />
        </SimpleGrid>
        <Box mt={4}>
          <Check label="Mostrar medidas" checked={s.showDims} onChange={() => s.setShowDims(!s.showDims)} />
        </Box>
        {s.importInfo && <Text fontSize="xs" color="gray.600" mt={3}>{s.importInfo}</Text>}
      </Section>

      <Section title="Modelo paramétrico">
        <NativeSelect.Root size="sm">
          <NativeSelect.Field value={s.template} onChange={() => {}}>
            {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
              <option key={id} value={id}>{TEMPLATES[id].name}</option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <SimpleGrid columns={3} gap={3} mt={4}>
          <NumField label="Largura" value={params.width} onChange={(v) => setParam('width', v)} />
          <NumField label="Profund." value={params.depth} onChange={(v) => setParam('depth', v)} />
          <NumField label="Altura" value={params.height} onChange={(v) => setParam('height', v)} />
          <NumField label="Aba tampa" value={params.tuck} onChange={(v) => setParam('tuck', v)} />
          <NumField label="Abas cola" value={params.glue} onChange={(v) => setParam('glue', v)} />
          <NumField label="Espessura" value={params.thickness} step={0.1} onChange={(v) => setParam('thickness', v)} />
        </SimpleGrid>
        {clamped.length > 0 && (
          <Text fontSize="xs" color="blue.700" bg="blue.50" p={2} borderRadius="md" mt={3}>
            Ajustado para ser possível montar: {clamped.join('; ')}.
          </Text>
        )}
        {s.source !== 'template' && (
          <Text fontSize="xs" color="orange.600" mt={3}>
            O molde atual foi {s.source === 'import' ? 'importado' : 'editado'}. Alterar um parâmetro gera o modelo de novo (Ctrl+Z desfaz).
          </Text>
        )}
      </Section>
    </>
  );
}
