import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { Anchor, Circle, CircleAlert, Eye, EyeOff, ImageIcon, Layers, Square, Type } from 'lucide-react';
import type { ArtObject } from '../art/objects';
import type { Face } from '../geometry/types';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

const OBJ_ICON = { rect: Square, ellipse: Circle, text: Type, image: ImageIcon };

/** Camadas organizadas pelas faces da caixa (árvore de dobras), com os objetos de arte de cada face. */
export function LayersPanel() {
  const { dieline, conflicts } = useDieline();
  const s = useStore();
  const bad = new Set(conflicts.map((c) => c.face));
  const faceIds = new Set(dieline.faces.map((f) => f.id));

  // objetos por face (o de cima primeiro); sem face válida = molde inteiro
  const objsOf = new Map<string | undefined, ArtObject[]>();
  for (const o of [...s.doc.objects].reverse()) {
    const k = o.clip && faceIds.has(o.clip) ? o.clip : undefined;
    objsOf.set(k, [...(objsOf.get(k) ?? []), o]);
  }

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

  const selectObject = (o: ArtObject) => {
    if (s.mode !== 'art') s.setMode('art');
    s.select({ object: o.id, face: o.clip });
  };

  const objectRow = (o: ArtObject, depth: number) => {
    const Icon = OBJ_ICON[o.type];
    const selected = s.sel.object === o.id;
    return (
      <Flex
        key={o.id}
        align="center"
        gap={2}
        pl={`${12 + depth * 14}px`}
        pr={2}
        py="4px"
        fontSize="xs"
        cursor="pointer"
        bg={selected ? 'orange.100' : undefined}
        _hover={{ bg: selected ? 'orange.100' : 'gray.50' }}
        onClick={() => selectObject(o)}
        opacity={o.hidden ? 0.5 : 1}
      >
        <Icon size={12} color="#64748b" />
        <Text flex={1} truncate color="gray.700">{o.type === 'text' ? o.text?.split('\n')[0] || o.name : o.name}</Text>
        <Box
          as="button"
          color="gray.400"
          _hover={{ color: 'gray.700' }}
          aria-label={o.hidden ? 'Mostrar' : 'Ocultar'}
          onClick={(e) => { e.stopPropagation(); s.updateObject(o.id, { hidden: !o.hidden }); }}
        >
          {o.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </Box>
      </Flex>
    );
  };

  const free = objsOf.get(undefined) ?? [];

  return (
    <Flex direction="column" w="230px" flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200" minH={0} display={{ base: 'none', lg: 'flex' }}>
      <Flex px={4} py={3} borderBottomWidth="1px" borderColor="gray.100" justify="space-between" align="baseline">
        <Heading size="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em" color="gray.600">Camadas</Heading>
        <Text fontSize="xs" color="gray.400">{dieline.faces.length} faces · {s.doc.objects.length} objetos</Text>
      </Flex>
      <Box flex={1} overflowY="auto" py={2}>
        {free.length > 0 && (
          <>
            <Flex align="center" gap={2} px={3} py="6px" fontSize="sm" color="gray.600">
              <Layers size={14} /> <Text flex={1}>Molde inteiro</Text>
            </Flex>
            {free.map((o) => objectRow(o, 1))}
          </>
        )}
        {rows.map(({ f, depth }) => {
          const selected = s.sel.face === f.id && !s.sel.object;
          const color = s.faceColors[f.id];
          return (
            <Box key={f.id}>
              <Flex
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
              {(objsOf.get(f.id) ?? []).map((o) => objectRow(o, depth + 1))}
            </Box>
          );
        })}
      </Box>
    </Flex>
  );
}
