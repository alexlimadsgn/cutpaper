import { Box, Button, Flex, Group, Heading, IconButton, Text } from '@chakra-ui/react';
import {
  Box as BoxIcon, Circle, Download, Square, Type, FoldVertical, ImagePlus, Map as MapIcon, Minimize2, MousePointer2, Redo2, Scissors, Undo2, Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ArtProps } from './components/ArtProps';
import { Editor2D } from './components/Editor2D';
import { LayersPanel } from './components/LayersPanel';
import { Preview3D } from './components/Preview3D';
import { StructureProps } from './components/StructureProps';
import { VerifyProps } from './components/VerifyProps';
import { insertImageObject } from './art/insertImage';
import { buildSvg, download } from './export/svg';
import { openSvgFile } from './io/openSvg';
import { useStore, type Mode } from './store';
import { useDieline } from './useDieline';

const MODES: { id: Mode; label: string }[] = [
  { id: 'structure', label: 'Estrutura' },
  { id: 'art', label: 'Arte' },
  { id: 'verify', label: 'Verificar' },
];

export default function App() {
  const s = useStore();
  return (
    <Flex direction="column" h="100vh" bg="gray.100">
      <TopBar />
      <Flex flex={1} minH={0}>
        <ToolRail />
        <LayersPanel />
        <CanvasArea />
        <Box w="320px" flexShrink={0} bg="white" borderLeftWidth="1px" borderColor="gray.200" overflowY="auto" px={5} py={4}>
          {s.mode === 'structure' && <StructureProps />}
          {s.mode === 'art' && <ArtProps />}
          {s.mode === 'verify' && <VerifyProps />}
        </Box>
      </Flex>
      <StatusBar />
    </Flex>
  );
}

function TopBar() {
  const s = useStore();
  const { dieline } = useDieline();
  const exportSvg = () =>
    download(`cutpaper-${Date.now().toString(36)}.svg`, buildSvg({ ...s, objects: s.doc.objects, dieline }));

  return (
    <Flex h="56px" flexShrink={0} align="center" px={4} gap={4} bg="white" borderBottomWidth="1px" borderColor="gray.200">
      <Flex align="center" gap={2} w="230px">
        <Box w="26px" h="26px" borderRadius="md" bg="red.500" color="white" display="grid" placeItems="center"><Scissors size={15} /></Box>
        <Heading size="md" fontWeight="800" letterSpacing="-0.02em">CutPaper</Heading>
      </Flex>

      <Flex flex={1} justify="center">
        <Group attached bg="gray.100" p="3px" borderRadius="lg">
          {MODES.map((m) => (
            <Button
              key={m.id}
              size="sm"
              px={5}
              borderRadius="md"
              variant={s.mode === m.id ? 'solid' : 'ghost'}
              bg={s.mode === m.id ? 'white' : 'transparent'}
              color={s.mode === m.id ? 'gray.900' : 'gray.600'}
              shadow={s.mode === m.id ? 'sm' : undefined}
              _hover={{ bg: s.mode === m.id ? 'white' : 'gray.200' }}
              onClick={() => s.setMode(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </Group>
      </Flex>

      <Flex gap={2} align="center">
        <IconButton size="sm" variant="ghost" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}><Undo2 size={16} /></IconButton>
        <IconButton size="sm" variant="ghost" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!s.future.length} onClick={s.redo}><Redo2 size={16} /></IconButton>
        <Box w="1px" h="24px" bg="gray.200" mx={1} />
        <Button size="sm" variant="ghost" onClick={openSvgFile}><Upload size={15} /> Importar</Button>
        <Button size="sm" variant="ghost" colorPalette="red" onClick={s.reset}>Novo</Button>
        <Button size="sm" colorPalette="red" onClick={exportSvg}><Download size={15} /> Exportar SVG</Button>
      </Flex>
    </Flex>
  );
}

function RailButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton
      aria-label={label}
      title={label}
      size="md"
      variant="ghost"
      bg={active ? 'gray.900' : undefined}
      color={active ? 'white' : 'gray.700'}
      _hover={{ bg: active ? 'gray.900' : 'gray.100' }}
      onClick={onClick}
    >
      {children}
    </IconButton>
  );
}

/** Ferramentas do modo atual. */
function ToolRail() {
  const s = useStore();
  const select = <RailButton label="Selecionar (V)" active={s.tool === 'select'} onClick={() => s.setTool('select')}><MousePointer2 size={18} /></RailButton>;
  return (
    <Flex direction="column" align="center" gap={1} w="56px" py={3} flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200">
      {select}
      {s.mode === 'structure' && (
        <>
          <RailButton label="Linha de corte (C)" active={s.tool === 'cut'} onClick={() => s.setTool('cut')}><Scissors size={18} /></RailButton>
          <RailButton label="Linha de vinco (D)" active={s.tool === 'crease'} onClick={() => s.setTool('crease')}><FoldVertical size={18} /></RailButton>
        </>
      )}
      {s.mode === 'art' && (
        <>
          <RailButton label="Retângulo (R)" active={s.tool === 'rect'} onClick={() => s.setTool('rect')}><Square size={18} /></RailButton>
          <RailButton label="Elipse (E)" active={s.tool === 'ellipse'} onClick={() => s.setTool('ellipse')}><Circle size={18} /></RailButton>
          <RailButton label="Texto (T)" active={s.tool === 'text'} onClick={() => s.setTool('text')}><Type size={18} /></RailButton>
          <RailButton label={s.sel.face ? 'Imagem (na face selecionada)' : 'Imagem'} onClick={insertImageObject}><ImagePlus size={18} /></RailButton>
        </>
      )}
    </Flex>
  );
}

/** Canvas principal + miniatura flutuante da outra vista (3D na edição, 2D na verificação). */
function CanvasArea() {
  const mode = useStore((s) => s.mode);
  const [miniOpen, setMiniOpen] = useState(true);
  const main3D = mode === 'verify';

  return (
    <Box flex={1} minW={0} position="relative" bg="gray.50">
      {main3D ? <Box position="absolute" inset={0}><Preview3D /></Box> : <Editor2D />}
      {miniOpen ? (
        <Box position="absolute" top={3} right={3} w="min(300px, 32%)" h="min(230px, 30%)" minW="160px" minH="120px" bg="white" borderRadius="lg" shadow="lg" borderWidth="1px" borderColor="gray.200" overflow="hidden">
          <Flex position="absolute" top={0} left={0} right={0} zIndex={1} justify="space-between" align="center" px={2} py={1} bg="whiteAlpha.800">
            <Text fontSize="xs" fontWeight="600" color="gray.600">{main3D ? 'Planificação' : 'Montagem 3D'}</Text>
            <IconButton size="2xs" variant="ghost" aria-label="Minimizar" onClick={() => setMiniOpen(false)}><Minimize2 size={12} /></IconButton>
          </Flex>
          <Box position="absolute" inset={0}>{main3D ? <Editor2D compact /> : <Preview3D compact />}</Box>
        </Box>
      ) : (
        <Button position="absolute" top={3} right={3} size="sm" variant="outline" bg="white" shadow="sm" onClick={() => setMiniOpen(true)}>
          {main3D ? <MapIcon size={14} /> : <BoxIcon size={14} />} {main3D ? 'Planificação' : '3D'}
        </Button>
      )}
    </Box>
  );
}

function StatusBar() {
  const s = useStore();
  const { dieline, conflicts, viewBox } = useDieline();
  const bad = new Set(conflicts.map((c) => c.face)).size;
  const roots = dieline.faces.filter((f) => !f.parent).length;
  const ok = bad === 0 && roots <= 1;
  return (
    <Flex h="30px" flexShrink={0} align="center" px={4} gap={4} fontSize="xs" color="gray.500" bg="white" borderTopWidth="1px" borderColor="gray.200">
      <span>{dieline.faces.length} faces · {Object.keys(s.doc.graph.e).length} linhas</span>
      <span>Molde {(viewBox[2] - 4).toFixed(0)} × {(viewBox[3] - 4).toFixed(0)} mm (com sangria)</span>
      <Box flex={1} />
      <Text
        as="button"
        color={ok ? 'green.600' : 'red.600'}
        fontWeight="600"
        onClick={() => s.setMode('verify')}
        title="Abrir verificação"
      >
        {ok ? '✓ Montagem OK' : `⚠ ${bad + (roots > 1 ? roots - 1 : 0)} problema(s) de montagem`}
      </Text>
      <span>Roda = zoom · Espaço = mover · Del = excluir</span>
    </Flex>
  );
}
