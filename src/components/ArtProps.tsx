import { Box, Button, Flex, Image, Text } from '@chakra-ui/react';
import { ImagePlus, X } from 'lucide-react';
import { sideArt, useStore } from '../store';
import { useDieline } from '../useDieline';
import { ColorField } from './ColorField';
import { ObjectProps } from './ObjectProps';
import { IconToggles, Section, pickImage } from './ui';

/** Propriedades do modo Arte: objeto selecionado, fundo da face ou do molde inteiro. */
export function ArtProps() {
  const s = useStore();
  const { dieline } = useDieline();
  const face = dieline.faces.find((f) => f.id === s.sel.face);
  const obj = s.doc.objects.find((o) => o.id === s.sel.object);
  const art = sideArt(s);
  if (obj) return <><SideSwitch /><ObjectProps o={obj} /></>;

  if (face)
    return (
      <>
        <SideSwitch />
        <Section title="Face" action={<Button size="2xs" variant="ghost" onClick={() => s.select({})}>Molde inteiro</Button>}>
          <Box h="28px" bg="gray.50" borderRadius="6px" px={2} display="flex" alignItems="center">
            <input
              key={face.id}
              defaultValue={face.name}
              onBlur={(e) => e.target.value !== face.name && s.commit({ names: { ...s.doc.names, [face.id]: e.target.value } })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12 }}
            />
          </Box>
        </Section>
        <Section title="Preenchimento">
          <ColorField value={art.faceColors[face.id]} onChange={(c) => s.setFaceColor(face.id, c)} />
        </Section>
        <Section title="Imagem da face">
          <ImageSlot
            url={art.faceImages[face.id]}
            onPick={() => pickImage((u) => s.setFaceImage(face.id, u))}
            onClear={() => s.setFaceImage(face.id, undefined)}
          />
        </Section>
      </>
    );

  return (
    <>
      <SideSwitch />
      <Section title={s.artSide === 'in' ? 'Fundo do interior' : 'Fundo do molde'}>
        <ColorField value={art.bgColor} onChange={s.setBgColor} />
        <Text fontSize="10px" color="gray.500" mt={2}>Vale para todas as faces, até a sangria. Selecione uma face para personalizá-la.</Text>
      </Section>
      <Section title="Imagem de fundo">
        <ImageSlot url={art.fullImage} onPick={() => pickImage(s.setFullImage)} onClear={() => s.setFullImage(undefined)} />
      </Section>
    </>
  );
}

/** Lado do papel em edição: exterior (frente) ou interior (verso). */
export function SideSwitch() {
  const side = useStore((s) => s.artSide);
  const setSide = useStore((s) => s.setArtSide);
  return (
    <Box px={3} pt={3} pb={side === 'in' ? 1 : 3} borderBottomWidth="1px" borderColor="gray.100">
      <IconToggles items={[
        { key: 'out', icon: <Text fontSize="11px" fontWeight={side === 'out' ? 600 : 400}>Exterior</Text>, active: side === 'out', title: 'Arte do lado de fora (frente do papel)', onClick: () => setSide('out') },
        { key: 'in', icon: <Text fontSize="11px" fontWeight={side === 'in' ? 600 : 400}>Interior</Text>, active: side === 'in', title: 'Arte do lado de dentro (verso do papel)', onClick: () => setSide('in') },
      ]} />
      {side === 'in' && (
        <Text fontSize="10px" color="gray.500" mt={1.5} mb={1.5}>Verso do papel: o molde aparece espelhado. Sai na página 2 do PDF.</Text>
      )}
    </Box>
  );
}

/** Imagem compacta: miniatura + nome da ação na mesma linha. */
export function ImageSlot({ url, onPick, onClear }: { label?: string; url?: string; onPick: () => void; onClear: () => void }) {
  return (
    <Flex h="36px" align="center" gap={2} px={1.5} bg="gray.50" borderRadius="6px">
      <Box w="26px" h="26px" borderRadius="4px" overflow="hidden" flexShrink={0} bg="bg.panel" borderWidth="1px" borderColor="blackAlpha.200" display="grid" placeItems="center" color="gray.400">
        {url ? <Image src={url} w="full" h="full" objectFit="cover" /> : <ImagePlus size={13} />}
      </Box>
      <Text as="button" flex={1} textAlign="left" fontSize="12px" color={url ? 'gray.800' : 'gray.500'} onClick={onPick}>
        {url ? 'Trocar imagem' : 'Adicionar imagem'}
      </Text>
      {url && (
        <Button size="2xs" variant="ghost" onClick={onClear} title="Remover imagem" aria-label="Remover imagem"><X size={12} /></Button>
      )}
    </Flex>
  );
}
