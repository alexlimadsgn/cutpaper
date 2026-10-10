import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { Anchor, CircleAlert, ImageIcon } from 'lucide-react';
import type { Face } from '../geometry/types';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

/** Camadas organizadas pelas faces da caixa, seguindo a árvore de dobras. */
export function LayersPanel() {
  const { dieline, conflicts } = useDieline();
  const s = useStore();
  const bad = new Set(conflicts.map((c) => c.face));

  // percorre a árvore: base → filhos
  const children = new Map<string | undefined, Face[]>();
  for (const f of dieline.faces) children.set(f.parent, [...(children.get(f.parent) ?? []), f]);
  const rows: { f: Face; depth: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      rows.push({ f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(undefined, 0);

  return (
    <Flex direction="column" w="230px" flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200" minH={0}>
      <Flex px={4} py={3} borderBottomWidth="1px" borderColor="gray.100" justify="space-between" align="baseline">
        <Heading size="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em" color="gray.600">Faces</Heading>
        <Text fontSize="xs" color="gray.400">{dieline.faces.length}</Text>
      </Flex>
      <Box flex={1} overflowY="auto" py={2}>
        {rows.map(({ f, depth }) => {
          const selected = s.sel.face === f.id;
          const color = s.faceColors[f.id];
          return (
            <Flex
              key={f.id}
              as="button"
              w="full"
              align="center"
              gap={2}
              pl={`${12 + depth * 14}px`}
              pr={3}
              py="6px"
              fontSize="sm"
              textAlign="left"
              bg={selected ? 'orange.50' : undefined}
              borderLeftWidth="2px"
              borderLeftColor={selected ? 'orange.400' : 'transparent'}
              _hover={{ bg: selected ? 'orange.50' : 'gray.50' }}
              onClick={() => s.select({ face: f.id })}
              title={f.parent ? `Dobra ${f.angle}° a partir da face-pai` : 'Base da dobra'}
            >
              <Box
                w="14px" h="14px" flexShrink={0} borderRadius="3px" borderWidth="1px" borderColor="gray.300"
                bg={color ?? (s.faceImages[f.id] ? 'gray.200' : 'white')}
              />
              <Text flex={1} truncate color={bad.has(f.id) ? 'red.600' : 'gray.800'}>{f.name}</Text>
              {!f.parent && <Anchor size={13} color="#64748b" />}
              {s.faceImages[f.id] && <ImageIcon size={13} color="#64748b" />}
              {bad.has(f.id) && <CircleAlert size={13} color="#dc2626" />}
            </Flex>
          );
        })}
      </Box>
    </Flex>
  );
}
