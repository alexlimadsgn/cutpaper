import { Box, Button, Heading, NativeSelect, SimpleGrid, Text } from '@chakra-ui/react';
import { graphBounds, scaleGraph } from '../geometry/graph';
import { TEMPLATES, type TemplateId } from '../geometry/templates';
import { openSvgFile } from '../io/openSvg';
import { useStore } from '../store';
import { NumField, Panel, Section } from './ui';

export function LeftPanel() {
  const s = useStore();
  const { params, setParam } = s;
  const b = graphBounds(s.doc.graph);
  const lim = TEMPLATES[s.template].limits(params);
  const clamped = [
    params.glue > lim.glue && `abas de cola limitadas a ${lim.glue} mm (metade da largura, menos folga)`,
    params.tuck > lim.tuck && `aba da tampa limitada a ${lim.tuck} mm (altura da frente)`,
  ].filter(Boolean);

  const resize = (axis: 'w' | 'h', val: number) => {
    if (val <= 0 || !b.w || !b.h) return;
    const k = axis === 'w' ? val / b.w : val / b.h; // proporcional
    s.commit({ graph: scaleGraph(s.doc.graph, k, k, [b.minX, b.minY]) });
  };

  return (
    <Panel w="320px" flexShrink={0}>
      <Box display="flex" alignItems="center" gap={2} mb={8}>
        <Box w="28px" h="28px" borderRadius="md" bg="red.500" color="white" display="grid" placeItems="center" fontWeight="800">✂</Box>
        <Heading size="xl" fontWeight="800" letterSpacing="-0.02em">CutPaper</Heading>
      </Box>

      <Section title="Molde">
        <Button w="full" size="sm" bg="black" color="white" onClick={openSvgFile}>Importar SVG (die cut)</Button>
        {s.importInfo && <Text fontSize="xs" color="gray.600" mt={2}>{s.importInfo}</Text>}
        <Text fontSize="xs" color="gray.500" mt={2}>
          Vinco é detectado por camada (vinco/crease/fold), linha tracejada ou cor azul/verde; o resto vira corte.
        </Text>
        <SimpleGrid columns={2} gap={3} mt={4}>
          <NumField label="Largura total (mm)" step={0.5} value={+b.w.toFixed(2)} onChange={(v) => resize('w', v)} />
          <NumField label="Altura total (mm)" step={0.5} value={+b.h.toFixed(2)} onChange={(v) => resize('h', v)} />
        </SimpleGrid>
        <Text fontSize="xs" color="gray.500" mt={2}>Redimensiona o molde inteiro proporcionalmente.</Text>
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

      <Section title="Sangria e grade">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="Sangria (mm)" value={s.bleed} step={0.5} onChange={s.setBleed} />
          <NumField label="Grade/snap (mm)" value={s.grid} step={0.5} onChange={s.setGrid} />
        </SimpleGrid>
        <Text fontSize="xs" color="gray.500" mt={3}>
          A sangria é um offset da área de material (janelas incluídas). Grade 0 desliga o snap.
        </Text>
      </Section>
    </Panel>
  );
}
