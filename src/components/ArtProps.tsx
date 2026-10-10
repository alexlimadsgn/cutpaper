import { Box, Button, Flex, Image, Input, Stack, Text } from '@chakra-ui/react';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { ColorField } from './ColorField';
import { Section, pickImage } from './ui';

/** Propriedades do modo Arte: fundo da face selecionada ou do molde inteiro. */
export function ArtProps() {
  const s = useStore();
  const { dieline } = useDieline();
  const face = dieline.faces.find((f) => f.id === s.sel.face);

  if (face)
    return (
      <>
        <Section title="Face" action={<Button size="2xs" variant="ghost" onClick={() => s.select({})}>Molde inteiro</Button>}>
          <Input
            size="sm"
            key={face.id}
            defaultValue={face.name}
            onBlur={(e) => e.target.value !== face.name && s.commit({ names: { ...s.doc.names, [face.id]: e.target.value } })}
          />
        </Section>
        <Section title="Preenchimento">
          <Stack gap={5}>
            <ColorField label="Cor de fundo da face" value={s.faceColors[face.id]} onChange={(c) => s.setFaceColor(face.id, c)} />
            <ImageSlot
              label="Imagem da face"
              url={s.faceImages[face.id]}
              onPick={() => pickImage((u) => s.setFaceImage(face.id, u))}
              onClear={() => s.setFaceImage(face.id, undefined)}
            />
          </Stack>
        </Section>
      </>
    );

  return (
    <>
      <Section title="Molde inteiro">
        <Text fontSize="xs" color="gray.500" mb={4}>
          Vale para todas as faces, até a sangria. Selecione uma face (no canvas, no 3D ou nas camadas) para personalizá-la.
        </Text>
        <Stack gap={5}>
          <ColorField label="Cor de fundo" value={s.bgColor} onChange={s.setBgColor} />
          <ImageSlot label="Imagem de fundo" url={s.fullImage} onPick={() => pickImage(s.setFullImage)} onClear={() => s.setFullImage(undefined)} />
        </Stack>
      </Section>
    </>
  );
}

export function ImageSlot({ label, url, onPick, onClear }: { label: string; url?: string; onPick: () => void; onClear: () => void }) {
  return (
    <Box>
      <Text fontSize="xs" color="gray.600" mb={2}>{label}</Text>
      <Flex gap={3} align="center">
        <Box w="64px" h="64px" borderRadius="md" borderWidth="1px" borderStyle="dashed" borderColor="gray.300" overflow="hidden" flexShrink={0}>
          {url && <Image src={url} w="full" h="full" objectFit="cover" />}
        </Box>
        <Stack gap={2}>
          <Button size="xs" bg="black" color="white" onClick={onPick}>{url ? 'Trocar' : 'Enviar imagem'}</Button>
          {url && <Button size="xs" variant="ghost" onClick={onClear}>Remover</Button>}
        </Stack>
      </Flex>
    </Box>
  );
}
