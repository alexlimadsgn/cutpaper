import { Box, Heading, NativeSelect, SimpleGrid, Text } from '@chakra-ui/react';
import { TEMPLATES, type TemplateId } from '../geometry/templates';
import { useStore } from '../store';
import { NumField, Panel, Section } from './ui';

export function LeftPanel() {
  const { template, params, setParam, bleed, setBleed } = useStore();
  return (
    <Panel w="320px" flexShrink={0}>
      <Box display="flex" alignItems="center" gap={2} mb={8}>
        <Box w="28px" h="28px" borderRadius="md" bg="red.500" color="white" display="grid" placeItems="center" fontWeight="800">✂</Box>
        <Heading size="xl" fontWeight="800" letterSpacing="-0.02em">CutPaper</Heading>
      </Box>

      <Section title="Modelo">
        <NativeSelect.Root>
          <NativeSelect.Field value={template} onChange={() => {}}>
            {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
              <option key={id} value={id}>{TEMPLATES[id].name}</option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Section>

      <Section title="Dimensões internas (mm)">
        <SimpleGrid columns={3} gap={3}>
          <NumField label="Largura" value={params.width} onChange={(v) => setParam('width', v)} />
          <NumField label="Profund." value={params.depth} onChange={(v) => setParam('depth', v)} />
          <NumField label="Altura" value={params.height} onChange={(v) => setParam('height', v)} />
        </SimpleGrid>
      </Section>

      <Section title="Abas (mm)">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="Aba da tampa" value={params.tuck} onChange={(v) => setParam('tuck', v)} />
          <NumField label="Abas de cola" value={params.glue} onChange={(v) => setParam('glue', v)} />
        </SimpleGrid>
      </Section>

      <Section title="Material e sangria">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="Espessura (mm)" value={params.thickness} step={0.1} onChange={(v) => setParam('thickness', v)} />
          <NumField label="Sangria (mm)" value={bleed} step={0.5} onChange={setBleed} />
        </SimpleGrid>
        <Text fontSize="xs" color="gray.500" mt={3}>
          A sangria é um offset do contorno de corte; os vincos não são deslocados.
        </Text>
      </Section>
    </Panel>
  );
}
