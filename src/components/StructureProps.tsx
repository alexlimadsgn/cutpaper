import { Box, SimpleGrid, Text } from '@chakra-ui/react';
import { graphBounds, scaleGraph } from '../geometry/graph';
import { TEMPLATES, type TemplateId } from '../geometry/templates';
import { useSettledStore } from '../store';
import { SideSwitch } from './ArtProps';
import { Inspector } from './Inspector';
import { Check, CompactSelect, NumField, Section } from './ui';

/** Propriedades do modo Edição: seleção + molde + modelo paramétrico. */
export function StructureProps() {
  const s = useSettledStore();
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
        <CompactSelect value={s.template} onChange={(id) => s.setTemplate(id as TemplateId)} title="Modelo">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
            <option key={id} value={id}>{TEMPLATES[id].name}</option>
          ))}
        </CompactSelect>
        <SimpleGrid columns={2} gap={1.5} mt={1.5}>
          {TEMPLATES[s.template].fields.map((f) => (
            <NumField key={f.key} prefix={f.prefix} suffix="mm" title={f.title} step={f.step ?? 1} value={params[f.key]} onChange={(v) => setParam(f.key, v)} />
          ))}
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
