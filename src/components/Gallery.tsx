import { Box, CloseButton, Dialog, Flex, Heading, Portal, SimpleGrid, Text } from '@chakra-ui/react';
import { FolderOpen, Upload } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { viewBoxOf } from '../export/svg';
import { deriveDieline } from '../geometry/faces';
import { PRESETS, TEMPLATES, type Preset } from '../geometry/templates';
import type { Vec2 } from '../geometry/types';
import { openProjectFile } from '../io/project';
import { openSvgFile } from '../io/openSvg';
import { useStore } from '../store';

const path = (pts: Vec2[]) => 'M' + pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' L');

/** Miniatura do molde: corte contínuo, vinco tracejado. */
function Thumb({ preset }: { preset: Preset }) {
  const s = useStore.getState();
  const d = useMemo(() => {
    const t = TEMPLATES[preset.template].build({ ...s.params, thickness: 0.5, ...preset.params });
    return deriveDieline(t.graph, t.names, t.root);
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const vb = viewBoxOf(d.cuts, 4);
  const sw = Math.max(vb[2], vb[3]) / 160;
  return (
    <svg viewBox={vb.join(' ')} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <g fill="none" strokeLinejoin="round">
        {d.faces.map((f) => <path key={f.id} d={path(f.poly) + 'Z'} fill="var(--chakra-colors-bg-panel)" stroke="none" />)}
        {d.cuts.map((c, i) => <path key={i} d={path(c)} stroke="var(--chakra-colors-gray-700)" strokeWidth={sw} />)}
        {d.creases.map((c, i) => <path key={i} d={path(c)} stroke="#1E6FE8" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 2.5}`} />)}
      </g>
    </svg>
  );
}

function Card({ title, desc, onClick, children }: { title: string; desc: string; onClick: () => void; children: ReactNode }) {
  return (
    <Box
      as="button"
      onClick={onClick}
      textAlign="left"
      borderRadius="12px"
      borderWidth="1px"
      borderColor="gray.200"
      bg="bg.panel"
      overflow="hidden"
      transition="border-color .12s, box-shadow .12s, transform .12s"
      _hover={{ borderColor: 'red.400', boxShadow: 'md', transform: 'translateY(-1px)' }}
    >
      <Box h="128px" bg="gray.50" p={3} color="gray.500" display="grid" placeItems="center">{children}</Box>
      <Box px={3} py={2.5}>
        <Text fontSize="13px" fontWeight="600" color="gray.900">{title}</Text>
        <Text fontSize="11px" color="gray.500" truncate>{desc}</Text>
      </Box>
    </Box>
  );
}

/** Galeria inicial: escolher um modelo pronto, importar um molde ou abrir um projeto. */
export function Gallery() {
  const open = useStore((s) => s.galleryOpen);
  const setOpen = useStore((s) => s.setGalleryOpen);
  const reset = useStore((s) => s.reset);

  const hasWork = () => {
    const s = useStore.getState();
    return s.doc.objects.length > 0 || s.source !== 'template' || !!s.bgColor || !!s.fullImage ||
      Object.keys(s.faceColors).length > 0 || Object.keys(s.faceImages).length > 0;
  };
  const pick = (id: string) => {
    if (hasWork() && !confirm('Começar um projeto novo com este modelo? O atual será substituído (salve antes se precisar).')) return;
    reset(id);
  };
  const other = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && setOpen(false)} placement="center" size="xl" scrollBehavior="inside">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="860px" borderRadius="2xl" mx={4}>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" position="absolute" top={3} right={3} />
            </Dialog.CloseTrigger>
            <Dialog.Body pt={7} pb={7} px={{ base: 4, md: 7 }}>
              <Heading fontSize="20px" fontWeight="800" letterSpacing="-0.02em">O que vamos criar?</Heading>
              <Text fontSize="13px" color="gray.500" mt={1} mb={5}>
                Escolha um modelo. Depois você ajusta as medidas no modo Edição e coloca a arte no modo Arte.
              </Text>
              <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={3}>
                {PRESETS.map((p) => (
                  <Card key={p.id} title={p.name} desc={p.desc} onClick={() => pick(p.id)}>
                    <Thumb preset={p} />
                  </Card>
                ))}
              </SimpleGrid>
              <Flex gap={3} mt={5} pt={5} borderTopWidth="1px" borderColor="gray.100" wrap="wrap">
                <Flex as="button" onClick={() => other(openSvgFile)} align="center" gap={2} px={3} h="36px" borderRadius="8px" bg="gray.50" _hover={{ bg: 'gray.100' }} fontSize="12px">
                  <Upload size={14} /> Importar meu molde (SVG)
                </Flex>
                <Flex as="button" onClick={() => other(() => openProjectFile((m) => alert(m)))} align="center" gap={2} px={3} h="36px" borderRadius="8px" bg="gray.50" _hover={{ bg: 'gray.100' }} fontSize="12px">
                  <FolderOpen size={14} /> Abrir projeto (.cutpaper)
                </Flex>
              </Flex>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
