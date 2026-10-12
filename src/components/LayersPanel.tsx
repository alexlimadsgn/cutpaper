import { Box, Flex, Heading, IconButton, Text } from '@chakra-ui/react';
import {
  Anchor, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Circle, CircleAlert, Eye, EyeOff, ImageIcon, Layers,
  PanelLeftClose, PanelLeftOpen, Square, Type,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ArtObject } from '../art/objects';
import type { Face } from '../geometry/types';
import { sideArt, useStore } from '../store';
import { useDieline } from '../useDieline';

const OBJ_ICON = { rect: Square, ellipse: Circle, text: Type, image: ImageIcon };
const FREE = '__free';
const PREFS_KEY = 'cutpaper:layers';

/** Preferências de visualização do painel (só deste navegador). */
function loadPrefs(): { collapsed: string[]; minimized: boolean } {
  try {
    return { collapsed: [], minimized: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { collapsed: [], minimized: false };
  }
}

/** Camadas organizadas pelas faces da caixa (árvore de dobras), com os objetos de arte de cada face. */
export function LayersPanel() {
  const { dieline, conflicts } = useDieline();
  const s = useStore();
  const bad = new Set(conflicts.map((c) => c.face));
  const faceIds = new Set(dieline.faces.map((f) => f.id));

  const [collapsed, setCollapsed] = useState(() => new Set(loadPrefs().collapsed));
  const [minimized, setMinimized] = useState(() => loadPrefs().minimized);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ collapsed: [...collapsed], minimized }));
    } catch { /* sem armazenamento: só não lembra */ }
  }, [collapsed, minimized]);

  // objetos por face (o de cima primeiro); sem face válida = molde inteiro
  const objsOf = new Map<string, ArtObject[]>();
  const back = s.mode === 'art' && s.artSide === 'in';
  const art = sideArt(s, back ? 'in' : 'out');
  for (const o of [...s.doc.objects].reverse().filter((x) => (x.side === 'in') === back)) {
    const k = o.clip && faceIds.has(o.clip) ? o.clip : FREE;
    objsOf.set(k, [...(objsOf.get(k) ?? []), o]);
  }

  const children = new Map<string | undefined, Face[]>();
  for (const f of dieline.faces) children.set(f.parent, [...(children.get(f.parent) ?? []), f]);
  const parentOf = new Map(dieline.faces.map((f) => [f.id, f.parent]));
  const hasKids = (id: string) => !!(children.get(id)?.length || objsOf.get(id)?.length);

  // ao selecionar algo pelo canvas ou pelo 3D, abre o caminho até ele
  const selObj = s.doc.objects.find((o) => o.id === s.sel.object);
  const target = selObj ? (selObj.clip && faceIds.has(selObj.clip) ? selObj.clip : FREE) : s.sel.face;
  useEffect(() => {
    if (!target) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      // objeto: abre a própria face; face: abre só os ancestrais
      let id: string | undefined = selObj ? target : parentOf.get(target);
      while (id) {
        next.delete(id);
        id = parentOf.get(id);
      }
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, s.sel.object]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const groupIds = [...(objsOf.get(FREE)?.length ? [FREE] : []), ...dieline.faces.filter((f) => hasKids(f.id)).map((f) => f.id)];
  const allCollapsed = groupIds.length > 0 && groupIds.every((id) => collapsed.has(id));

  const rows: { f: Face; depth: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      rows.push({ f, depth });
      if (!collapsed.has(f.id)) walk(f.id, depth + 1);
    }
  };
  walk(undefined, 0);

  const chevron = (id: string) => (
    <Box
      as="span"
      w="14px"
      flexShrink={0}
      color="gray.400"
      _hover={{ color: 'gray.700' }}
      onClick={(e) => {
        e.stopPropagation();
        if (hasKids(id)) toggle(id);
      }}
      aria-label={collapsed.has(id) ? 'Expandir' : 'Recolher'}
    >
      {hasKids(id) && (collapsed.has(id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
    </Box>
  );

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
        pl={`${8 + depth * 14}px`}
        pr={2}
        py="3px"
        fontSize="11px"
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

  const free = objsOf.get(FREE) ?? [];
  const count = (id: string) => (children.get(id)?.length ?? 0) + (objsOf.get(id)?.length ?? 0);

  if (minimized)
    return (
      <Flex direction="column" align="center" w="36px" flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200" py={2} display={{ base: 'none', lg: 'flex' }}>
        <IconButton size="xs" variant="ghost" aria-label="Mostrar camadas" title="Mostrar camadas" onClick={() => setMinimized(false)}>
          <PanelLeftOpen size={15} />
        </IconButton>
        <Text
          fontSize="2xs" fontWeight="700" color="gray.500" letterSpacing="0.1em" mt={3} cursor="pointer"
          style={{ writingMode: 'vertical-rl' }}
          onClick={() => setMinimized(false)}
        >
          CAMADAS
        </Text>
      </Flex>
    );

  return (
    <Flex direction="column" w="220px" flexShrink={0} bg="white" borderRightWidth="1px" borderColor="gray.200" minH={0} display={{ base: 'none', lg: 'flex' }}>
      <Flex pl={4} pr={1} py={2} borderBottomWidth="1px" borderColor="gray.100" align="center" gap={1}>
        <Box flex={1} minW={0}>
          <Heading size="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em" color="gray.600">Camadas</Heading>
          <Text fontSize="2xs" color="gray.400">{dieline.faces.length} faces · {s.doc.objects.length} objetos</Text>
        </Box>
        <IconButton
          size="xs"
          variant="ghost"
          aria-label={allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
          title={allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
          disabled={!groupIds.length}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupIds))}
        >
          {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
        </IconButton>
        <IconButton size="xs" variant="ghost" aria-label="Minimizar painel" title="Minimizar painel" onClick={() => setMinimized(true)}>
          <PanelLeftClose size={15} />
        </IconButton>
      </Flex>

      <Box flex={1} overflowY="auto" py={2}>
        {free.length > 0 && (
          <>
            <Flex align="center" gap={2} pl="8px" pr={3} py="6px" fontSize="12px" color="gray.600" cursor="pointer" onClick={() => toggle(FREE)}>
              {chevron(FREE)}
              <Layers size={14} />
              <Text flex={1}>Molde inteiro</Text>
              {collapsed.has(FREE) && <Text fontSize="2xs" color="gray.400">{free.length}</Text>}
            </Flex>
            {!collapsed.has(FREE) && free.map((o) => objectRow(o, 2))}
          </>
        )}
        {rows.map(({ f, depth }) => {
          const selected = s.sel.face === f.id && !s.sel.object;
          const color = art.faceColors[f.id];
          return (
            <Box key={f.id}>
              <Flex
                as="button"
                w="full"
                align="center"
                gap={2}
                pl={`${8 + depth * 14}px`}
                pr={3}
                py="4px"
                fontSize="12px"
                textAlign="left"
                bg={selected ? 'orange.50' : undefined}
                borderLeftWidth="2px"
                borderLeftColor={selected ? 'orange.400' : 'transparent'}
                _hover={{ bg: selected ? 'orange.50' : 'gray.50' }}
                onClick={() => s.select({ face: f.id })}
                title={f.parent ? `Dobra ${f.angle}° a partir da face-pai` : 'Base da dobra'}
              >
                {chevron(f.id)}
                <Box
                  w="14px" h="14px" flexShrink={0} borderRadius="3px" borderWidth="1px" borderColor="gray.300"
                  bg={color ?? (art.faceImages[f.id] ? 'gray.200' : 'white')}
                />
                <Text flex={1} truncate color={bad.has(f.id) ? 'red.600' : 'gray.800'}>{f.name}</Text>
                {collapsed.has(f.id) && <Text fontSize="2xs" color="gray.400">{count(f.id)}</Text>}
                {!f.parent && <Anchor size={13} color="#64748b" />}
                {s.faceImages[f.id] && <ImageIcon size={13} color="#64748b" />}
                {bad.has(f.id) && <CircleAlert size={13} color="#dc2626" />}
              </Flex>
              {!collapsed.has(f.id) && (objsOf.get(f.id) ?? []).map((o) => objectRow(o, depth + 2))}
            </Box>
          );
        })}
      </Box>
    </Flex>
  );
}
