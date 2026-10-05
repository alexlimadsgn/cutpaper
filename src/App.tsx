import { Box, Button, Flex, Group, IconButton, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { Editor2D } from './components/Editor2D';
import { LeftPanel } from './components/LeftPanel';
import { Preview3D } from './components/Preview3D';
import { RightPanel } from './components/RightPanel';
import { buildSvg, download } from './export/svg';
import { useStore, type Tool } from './store';
import { useDieline } from './useDieline';

type View = '2d' | '3d' | 'split';

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Selecionar', key: 'V' },
  { id: 'cut', label: 'Corte', key: 'C' },
  { id: 'crease', label: 'Vinco', key: 'D' },
];

export default function App() {
  const [view, setView] = useState<View>('split');
  const { dieline, conflicts } = useDieline();
  const badFaces = new Set(conflicts.map((c) => c.face)).size;
  const s = useStore();
  const roots = dieline.faces.filter((f) => !f.parent).length;

  const exportSvg = () =>
    download(
      `cutpaper-${Date.now().toString(36)}.svg`,
      buildSvg({ dieline, bleed: s.bleed, layers: s.layers, fullImage: s.fullImage, faceImages: s.faceImages }),
    );

  return (
    <Flex h="100vh" gap={5} p={5} bg="gray.100">
      <LeftPanel />

      <Flex direction="column" flex={1} minW={0} bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.200" overflow="hidden">
        <Flex align="center" justify="space-between" px={4} py={3} borderBottomWidth="1px" borderColor="gray.100" gap={3} wrap="wrap">
          <Flex gap={2}>
            <Group attached>
              {TOOLS.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={s.tool === t.id ? 'solid' : 'outline'}
                  colorPalette={t.id === 'cut' ? 'red' : t.id === 'crease' ? 'blue' : 'gray'}
                  onClick={() => s.setTool(t.id)}
                  title={`${t.label} (${t.key})`}
                >
                  {t.label}
                </Button>
              ))}
            </Group>
            <Group attached>
              <IconButton size="sm" variant="outline" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}>↶</IconButton>
              <IconButton size="sm" variant="outline" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!s.future.length} onClick={s.redo}>↷</IconButton>
            </Group>
          </Flex>
          <Group attached>
            {(['2d', 'split', '3d'] as View[]).map((v) => (
              <Button key={v} size="sm" variant={view === v ? 'solid' : 'outline'} onClick={() => setView(v)}>
                {v === '2d' ? '2D' : v === '3d' ? '3D' : '2D + 3D'}
              </Button>
            ))}
          </Group>
          <Flex gap={2}>
            <Button size="sm" variant="outline" colorPalette="red" onClick={s.reset}>Limpar</Button>
            <Button size="sm" colorPalette="red" onClick={exportSvg}>Exportar SVG</Button>
          </Flex>
        </Flex>

        <Flex flex={1} minH={0}>
          {view !== '3d' && (
            <Box flex={1} minW={0} position="relative">
              <Editor2D />
            </Box>
          )}
          {view !== '2d' && (
            <Box flex={1} minW={0} borderLeftWidth={view === 'split' ? '1px' : 0} borderColor="gray.100">
              <Preview3D />
            </Box>
          )}
        </Flex>

        <Text textAlign="center" fontSize="xs" color="gray.500" py={2} borderTopWidth="1px" borderColor="gray.100">
          {dieline.faces.length} faces • {Object.keys(s.doc.graph.e).length} linhas
          {roots > 1 && <Text as="span" color="orange.600"> • {roots} partes sem vinco entre si</Text>}
          {badFaces > 0 && (
            <Text as="span" color="red.600" fontWeight="600"> • {badFaces} aba(s) impossível(is) de colar — veja as faces hachuradas</Text>
          )}
          {' '}• Roda = zoom • Espaço/botão do meio = mover • Del = excluir
        </Text>
      </Flex>

      <RightPanel />
    </Flex>
  );
}
