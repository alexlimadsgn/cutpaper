import { Box, Button, Flex, Image, Slider, Stack, Text } from '@chakra-ui/react';
import { COLORS } from '../export/svg';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { Check, Panel, Section, pickImage } from './ui';

export function RightPanel() {
  const { dieline } = useDieline();
  const s = useStore();
  const selected = dieline.faces.find((f) => f.id === s.selectedFace);

  return (
    <Panel w="320px" flexShrink={0}>
      <Section title="Camadas">
        <Flex wrap="wrap" gap={4}>
          <Check label="Corte" color={COLORS.cut} checked={s.layers.cut} onChange={() => s.toggleLayer('cut')} />
          <Check label="Vinco" color={COLORS.crease} checked={s.layers.crease} onChange={() => s.toggleLayer('crease')} />
          <Check label="Sangria" color={COLORS.bleed} checked={s.layers.bleed} onChange={() => s.toggleLayer('bleed')} />
          <Check label="Arte" checked={s.layers.artwork} onChange={() => s.toggleLayer('artwork')} />
        </Flex>
      </Section>

      <Section title="Dobra 3D">
        <Slider.Root
          value={[Math.round(s.fold * 100)]}
          onValueChange={(d) => s.setFold(d.value[0] / 100)}
          min={0}
          max={100}
          colorPalette="red"
        >
          <Slider.Control>
            <Slider.Track><Slider.Range /></Slider.Track>
            <Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
        <Flex justify="space-between" fontSize="xs" color="gray.500" mt={2}>
          <span>Planificado</span><span>{Math.round(s.fold * 100)}%</span><span>Montado</span>
        </Flex>
      </Section>

      <Section title="Imagem do molde inteiro">
        <ImageSlot url={s.fullImage} onPick={() => pickImage(s.setFullImage)} onClear={() => s.setFullImage(undefined)} />
      </Section>

      <Section title="Imagem por face">
        {selected ? (
          <>
            <Text fontSize="sm" mb={3}>Face: <b>{selected.name}</b></Text>
            <ImageSlot
              url={s.faceImages[selected.id]}
              onPick={() => pickImage((u) => s.setFaceImage(selected.id, u))}
              onClear={() => s.setFaceImage(selected.id, undefined)}
            />
          </>
        ) : (
          <Text fontSize="sm" color="gray.500">Clique numa face na planificação para aplicar uma imagem.</Text>
        )}
        <Stack gap={1} mt={4}>
          {dieline.faces.map((f) => (
            <Flex
              key={f.id}
              as="button"
              onClick={() => s.selectFace(f.id)}
              align="center"
              justify="space-between"
              px={2}
              py={1}
              borderRadius="md"
              fontSize="xs"
              bg={s.selectedFace === f.id ? 'red.50' : undefined}
              _hover={{ bg: 'gray.50' }}
            >
              <span>{f.name}</span>
              {s.faceImages[f.id] && <Box w={2} h={2} borderRadius="full" bg="red.500" />}
            </Flex>
          ))}
        </Stack>
      </Section>
    </Panel>
  );
}

function ImageSlot({ url, onPick, onClear }: { url?: string; onPick: () => void; onClear: () => void }) {
  return (
    <Flex gap={3} align="center">
      <Box w="64px" h="64px" borderRadius="md" borderWidth="1px" borderStyle="dashed" borderColor="gray.300" overflow="hidden" flexShrink={0}>
        {url && <Image src={url} w="full" h="full" objectFit="cover" />}
      </Box>
      <Stack gap={2}>
        <Button size="xs" bg="black" color="white" onClick={onPick}>{url ? 'Trocar' : 'Upload'}</Button>
        {url && <Button size="xs" variant="ghost" onClick={onClear}>Remover</Button>}
      </Stack>
    </Flex>
  );
}
