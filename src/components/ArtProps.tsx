import { Box, Button, Flex, Group, Image, Input, Stack, Text } from '@chakra-ui/react';
import { sideArt, useStore } from '../store';
import { useDieline } from '../useDieline';
import { ColorField } from './ColorField';
import { ObjectProps } from './ObjectProps';
import { Section, pickImage } from './ui';

/** Propriedades do modo Arte: fundo da face selecionada ou do molde inteiro. */
export function ArtProps() {
  const s = useStore();
  const { dieline } = useDieline();
  const face = dieline.faces.find((f) => f.id === s.sel.face);
  const obj = s.doc.objects.find((o) => o.id === s.sel.object);
  const art = sideArt(s);
  const sideSwitch = <SideSwitch />;
  if (obj) return <>{sideSwitch}<ObjectProps o={obj} /></>;

  if (face)
    return (
      <>
        {sideSwitch}
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
            <ColorField label="Cor de fundo da face" value={art.faceColors[face.id]} onChange={(c) => s.setFaceColor(face.id, c)} />
            <ImageSlot
              label="Imagem da face"
              url={art.faceImages[face.id]}
              onPick={() => pickImage((u) => s.setFaceImage(face.id, u))}
              onClear={() => s.setFaceImage(face.id, undefined)}
            />
          </Stack>
        </Section>
      </>
    );

  return (
    <>
      {sideSwitch}
      <Section title="Molde inteiro">
        <Text fontSize="xs" color="gray.500" mb={4}>
          Vale para todas as faces, até a sangria. Selecione uma face (no canvas, no 3D ou nas camadas) para personalizá-la.
        </Text>
        <Stack gap={5}>
          <ColorField label={s.artSide === 'in' ? 'Cor do interior' : 'Cor de fundo'} value={art.bgColor} onChange={s.setBgColor} />
          <ImageSlot label="Imagem de fundo" url={art.fullImage} onPick={() => pickImage(s.setFullImage)} onClear={() => s.setFullImage(undefined)} />
        </Stack>
      </Section>
    </>
  );
}

/** Lado do papel em edição: exterior (frente) ou interior (verso). */
export function SideSwitch() {
  const side = useStore((s) => s.artSide);
  const setSide = useStore((s) => s.setArtSide);
  return (
    <Box mb={4}>
      <Group attached w="full" bg="gray.100" p="3px" borderRadius="lg">
        {(['out', 'in'] as const).map((k) => (
          <Button
            key={k}
            flex={1}
            size="sm"
            borderRadius="md"
            variant="ghost"
            bg={side === k ? 'white' : 'transparent'}
            shadow={side === k ? 'sm' : undefined}
            color={side === k ? 'gray.900' : 'gray.600'}
            _hover={{ bg: side === k ? 'white' : 'gray.200' }}
            onClick={() => setSide(k)}
          >
            {k === 'out' ? 'Exterior' : 'Interior'}
          </Button>
        ))}
      </Group>
      {side === 'in' && (
        <Text fontSize="2xs" color="gray.500" mt={2}>
          Interior = verso do papel. O molde aparece espelhado, como ao virar a folha. Sai na página 2 do PDF.
        </Text>
      )}
    </Box>
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
