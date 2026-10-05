import { Box, Button, Flex, Group, Heading, IconButton, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { Canvas2D } from './components/Canvas2D';
import { LeftPanel } from './components/LeftPanel';
import { Preview3D } from './components/Preview3D';
import { RightPanel } from './components/RightPanel';
import { buildSvg, download } from './export/svg';
import { useStore } from './store';
import { useDieline } from './useDieline';

type View = '2d' | '3d' | 'split';

export default function App() {
  const [view, setView] = useState<View>('split');
  const [zoom, setZoom] = useState(0.9);
  const { dieline } = useDieline();
  const s = useStore();

  const exportSvg = () =>
    download(
      `cutpaper-${s.params.width}x${s.params.depth}x${s.params.height}.svg`,
      buildSvg({ dieline, bleed: s.bleed, layers: s.layers, fullImage: s.fullImage, faceImages: s.faceImages }),
    );

  return (
    <Flex h="100vh" gap={5} p={5} bg="gray.100">
      <LeftPanel />

      <Flex direction="column" flex={1} minW={0} bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.200" overflow="hidden">
        <Flex align="center" justify="space-between" px={6} py={4} borderBottomWidth="1px" borderColor="gray.100" gap={4}>
          <Heading size="md" fontWeight="700">Planificação</Heading>
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
            <Box flex={1} position="relative" bg="gray.50" overflow="auto">
              <Flex position="absolute" inset={0} align="center" justify="center" p={6}>
                <Canvas2D zoom={zoom} />
              </Flex>
              <Group attached position="absolute" bottom={4} right={4} bg="white" borderRadius="md" shadow="sm">
                <IconButton size="sm" variant="outline" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}>−</IconButton>
                <Button size="sm" variant="outline" onClick={() => setZoom(0.9)}>{Math.round(zoom * 100)}%</Button>
                <IconButton size="sm" variant="outline" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(4, z + 0.1))}>+</IconButton>
              </Group>
            </Box>
          )}
          {view !== '2d' && (
            <Box flex={1} minW={0} borderLeftWidth={view === 'split' ? '1px' : 0} borderColor="gray.100">
              <Preview3D />
            </Box>
          )}
        </Flex>

        <Text textAlign="center" fontSize="xs" color="gray.500" py={3} borderTopWidth="1px" borderColor="gray.100">
          {dieline.faces.length} faces • {dieline.creases.length} vincos • Caixa {s.params.width}×{s.params.depth}×{s.params.height} mm • Sangria {s.bleed} mm
        </Text>
      </Flex>

      <RightPanel />
    </Flex>
  );
}
