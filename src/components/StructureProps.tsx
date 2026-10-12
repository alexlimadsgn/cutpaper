import { Box, SimpleGrid, Text } from '@chakra-ui/react';
import { graphBounds, scaleGraph } from '../geometry/graph';
import { TEMPLATES, type TemplateId } from '../geometry/templates';
import { useStore } from '../store';
import { SideSwitch } from './ArtProps';
import { Inspector } from './Inspector';
import { Check, CompactSelect, NumField, Section } from './ui';

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
      <SideSwitch />
      <Inspector />

      <Section title="Molde">
        <SimpleGrid columns={2} gap={1.5}>
          <NumField prefix="L" suffix="mm" title="Largura total do molde (redimensiona proporcionalmente)" step={0.5} value={+b.w.toFixed(2)} onChange={(v) => resize('w', v)} />
          <NumField prefix="A" suffix="mm" title="Altura total do molde (redimensiona proporcionalmente)" step={0.5} value={+b.h.toFixed(2)} onChange={(v) => resize('h', v)} />
          <NumField prefix="Sangria" suffix="mm" title="Sangria" value={s.bleed} step={0.5} onChange={s.setBleed} />
          <NumField prefix="Grade" suffix="mm" title="Grade / snap (0 desliga)" value={s.grid} step={0.5} onChange={s.setGrid} />
        </SimpleGrid>
        <Box mt={2.5}>
          <Check label="Mostrar medidas" checked={s.showDims} onChange={() => s.setShowDims(!s.showDims)} />
        </Box>
        {s.importInfo && <Text fontSize="10px" color="gray.500" mt={2}>{s.importInfo}</Text>}
      </Section>

      <Section title="Modelo paramétrico">
        <CompactSelect value={s.template} onChange={() => {}} title="Modelo">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
            <option key={id} value={id}>{TEMPLATES[id].name}</option>
          ))}
        </CompactSelect>
        <SimpleGrid columns={3} gap={1.5} mt={1.5}>
          <NumField prefix="L" title="Largura (mm)" value={params.width} onChange={(v) => setParam('width', v)} />
          <NumField prefix="P" title="Profundidade (mm)" value={params.depth} onChange={(v) => setParam('depth', v)} />
          <NumField prefix="A" title="Altura (mm)" value={params.height} onChange={(v) => setParam('height', v)} />
        </SimpleGrid>
        <SimpleGrid columns={2} gap={1.5} mt={1.5}>
          <NumField prefix="Aba tampa" title="Aba de encaixe da tampa (mm)" value={params.tuck} onChange={(v) => setParam('tuck', v)} />
          <NumField prefix="Abas cola" title="Abas de cola (mm)" value={params.glue} onChange={(v) => setParam('glue', v)} />
          <NumField prefix="Espessura" title="Espessura do papel (mm)" value={params.thickness} step={0.1} onChange={(v) => setParam('thickness', v)} />
        </SimpleGrid>
        {clamped.length > 0 && (
          <Text fontSize="10px" color="blue.700" bg="blue.50" p={2} borderRadius="6px" mt={2}>
            Ajustado para montar: {clamped.join('; ')}.
          </Text>
        )}
        {s.source !== 'template' && (
          <Text fontSize="10px" color="orange.600" mt={2}>
            Molde {s.source === 'import' ? 'importado' : 'editado'}: alterar um parâmetro gera o modelo de novo (Ctrl+Z desfaz).
          </Text>
        )}
      </Section>
    </>
  );
}
