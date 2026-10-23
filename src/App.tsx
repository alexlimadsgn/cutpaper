import { Box, Button, Flex, Heading, IconButton, Menu, Portal, Text } from '@chakra-ui/react';
import {
  Box as BoxIcon, ChevronDown, Circle, Download, FileCode, FilePlus, FileText, FolderOpen, Info, Paintbrush, Save, Spline, Square, Type, FoldVertical, ImagePlus, LayoutGrid, Map as MapIcon, PenTool, Minimize2, Moon, Sun, MousePointer2, Redo2, Scissors, Undo2, Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AboutDialog } from './components/AboutDialog';
import { Gallery } from './components/Gallery';
import { ImposeDialog } from './components/ImposeDialog';
import { toggleTheme, useTheme } from './theme';
import { ArtProps } from './components/ArtProps';
import { Editor2D } from './components/Editor2D';
import { LayersPanel } from './components/LayersPanel';
import { Preview3D } from './components/Preview3D';
import { StructureProps } from './components/StructureProps';
import { VerifyProps } from './components/VerifyProps';
import { insertImageObject } from './art/insertImage';
import { useFontLoader } from './art/useFontLoader';
import { ensureFonts } from './art/fonts';
import { buildPdf } from './export/pdf';
import { buildBackSvg, buildSvg, download } from './export/svg';
import { openProjectFile, saveProjectFile } from './io/project';
import { openSvgFile } from './io/openSvg';
import { hasInterior, useStore } from './store';
import { useDieline } from './useDieline';
import { useChecks } from './verify/useChecks';


export default function App() {
  const s = useStore();
  useFontLoader();
  return (
    <Flex direction="column" h="100vh" bg="gray.100">
      <TopBar />
      <Gallery />
      <Flex flex={1} minH={0}>
        <ToolRail />
        <LayersPanel />
        <CanvasArea />
        <Box w="248px" flexShrink={0} bg="bg.panel" borderLeftWidth="1px" borderColor="gray.200" overflowY="auto" pb={6}>
          {s.mode === 'structure' && <StructureProps />}
          {s.mode === 'art' && <ArtProps />}
          {s.mode === 'verify' && <VerifyProps />}
        </Box>
      </Flex>
      <StatusBar />
    </Flex>
  );
}

function ThemeToggle() {
  const dark = useTheme() === 'dark';
  const label = dark ? 'Tema claro' : 'Tema escuro';
  return (
    <IconButton size="xs" variant="ghost" aria-label={label} title={label} onClick={toggleTheme}>
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </IconButton>
  );
}

function TopBar() {
  const s = useStore();
  const { dieline } = useDieline();
  const [busy, setBusy] = useState<string | null>(null);
  const [impose, setImpose] = useState(false);
  const stamp = () => new Date().toISOString().slice(0, 10);
  const input = () => ({ ...s, objects: s.doc.objects, dieline });

  const exportSvg = async () => {
    setBusy('svg');
    try {
      await ensureFonts(s.doc.objects);
      download(`caixa-${stamp()}.svg`, buildSvg({ ...input(), layers: s.layers }));
    } finally { setBusy(null); }
  };
  const exportBackSvg = async () => {
    setBusy('svg');
    try {
      await ensureFonts(s.doc.objects);
      download(`caixa-${stamp()}-verso.svg`, buildBackSvg({ dieline, bleed: s.bleed, art: s.interior, objects: s.doc.objects }));
    } finally { setBusy(null); }
  };
  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const bytes = await buildPdf(input());
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `caixa-${stamp()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally { setBusy(null); }
  };

  return (
    <Flex h="44px" flexShrink={0} align="center" px={{ base: 2, md: 3 }} gap={{ base: 1, md: 2 }} bg="bg.panel" borderBottomWidth="1px" borderColor="gray.200">
      <Flex align="center" gap={{ base: 1, md: 3 }} w={{ base: 'auto', lg: '230px' }} flexShrink={0}>
        <Flex align="center" gap={2}>
          <Box w="22px" h="22px" borderRadius="6px" bg="red.500" color="white" display="grid" placeItems="center"><Scissors size={13} /></Box>
          <Heading fontSize="14px" fontWeight="800" letterSpacing="-0.02em" display={{ base: 'none', md: 'block' }}>CutPaper</Heading>
        </Flex>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="xs" variant="ghost">Arquivo <ChevronDown size={14} /></Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="240px">
                <Menu.Item value="new" onSelect={() => s.setGalleryOpen(true)}>
                  <FilePlus size={15} /> Novo projeto…
                </Menu.Item>
                <Menu.Item value="open" onSelect={() => openProjectFile((m) => alert(m))}><FolderOpen size={15} /> Abrir projeto (.cutpaper)…</Menu.Item>
                <Menu.Item value="save" onSelect={saveProjectFile}><Save size={15} /> Salvar projeto (.cutpaper)</Menu.Item>
                <Menu.Separator />
                <Menu.Item value="import" onSelect={openSvgFile}><Upload size={15} /> Importar die cut (SVG)…</Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>

      <Box flex={1} />

      <Flex gap={{ base: 1, md: 2 }} align="center" flexShrink={0}>
        <ThemeToggle />
        <Button
          size="xs"
          variant={s.mode === 'verify' ? 'solid' : 'ghost'}
          colorPalette={s.mode === 'verify' ? 'red' : 'gray'}
          onClick={s.toggleVerify}
          title={s.mode === 'verify' ? 'Voltar para a edição' : 'Verificar montagem em 3D'}
          aria-pressed={s.mode === 'verify'}
        >
          <BoxIcon size={14} /> 3D
        </Button>
        <IconButton size="xs" variant="ghost" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}><Undo2 size={14} /></IconButton>
        <IconButton size="xs" variant="ghost" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!s.future.length} onClick={s.redo}><Redo2 size={14} /></IconButton>
        <Box w="1px" h="24px" bg="gray.200" mx={1} />
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="xs" colorPalette="red" loading={!!busy} loadingText={busy === 'pdf' ? 'Gerando PDF…' : 'Exportando…'}>
              <Download size={13} /> Exportar <ChevronDown size={14} />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="280px">
                <Menu.Item value="pdf" onSelect={exportPdf}>
                  <FileText size={15} />
                  <Box>
                    <Text fontWeight="600">PDF da peça (gráfica)</Text>
                    <Text fontSize="xs" color="gray.500">Camadas · CutContour/Crease · arte 300 dpi</Text>
                  </Box>
                </Menu.Item>
                <Menu.Item value="impose" onSelect={() => setImpose(true)}>
                  <LayoutGrid size={15} />
                  <Box>
                    <Text fontWeight="600">PDF montado na folha…</Text>
                    <Text fontSize="xs" color="gray.500">A4, A3… várias peças por folha</Text>
                  </Box>
                </Menu.Item>
                <Menu.Item value="svg" onSelect={exportSvg}>
                  <FileCode size={15} />
                  <Box>
                    <Text fontWeight="600">SVG vetorial</Text>
                    <Text fontSize="xs" color="gray.500">Camadas · texto em contornos</Text>
                  </Box>
                </Menu.Item>
                {hasInterior(s) && (
                  <Menu.Item value="svg-back" onSelect={exportBackSvg}>
                    <FileCode size={15} />
                    <Box>
                      <Text fontWeight="600">SVG do verso (interior)</Text>
                      <Text fontSize="xs" color="gray.500">Espelhado para frente e verso</Text>
                    </Box>
                  </Menu.Item>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        <ImposeDialog open={impose} onClose={() => setImpose(false)} />
      </Flex>
    </Flex>
  );
}

function RailButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton
      aria-label={label}
      title={label}
      size="sm"
      variant="ghost"
      bg={active ? 'gray.900' : undefined}
      color={active ? 'gray.50' : 'gray.700'}
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
  const [about, setAbout] = useState(false);
  const select = <RailButton label="Selecionar (V)" active={s.tool === 'select'} onClick={() => s.setTool('select')}><MousePointer2 size={16} /></RailButton>;
  return (
    <Flex direction="column" align="center" gap="2px" w="44px" py={2} flexShrink={0} bg="bg.panel" borderRightWidth="1px" borderColor="gray.200">
      {select}
      {s.mode === 'structure' && (
        <>
          <RailButton label="Linha de corte (C)" active={s.tool === 'cut'} onClick={() => s.setTool('cut')}><Scissors size={16} /></RailButton>
          <RailButton label="Linha de vinco (D)" active={s.tool === 'crease'} onClick={() => s.setTool('crease')}><FoldVertical size={16} /></RailButton>
          <RailButton label="Caneta: corte com curvas (P)" active={s.tool === 'pen'} onClick={() => s.setTool('pen')}><PenTool size={16} /></RailButton>
        </>
      )}
      {s.mode === 'art' && (
        <>
          <RailButton label="Retângulo (R)" active={s.tool === 'rect'} onClick={() => s.setTool('rect')}><Square size={16} /></RailButton>
          <RailButton label="Elipse (E)" active={s.tool === 'ellipse'} onClick={() => s.setTool('ellipse')}><Circle size={16} /></RailButton>
          <RailButton label="Texto (T)" active={s.tool === 'text'} onClick={() => s.setTool('text')}><Type size={16} /></RailButton>
          <RailButton label={s.sel.face ? 'Imagem (na face selecionada)' : 'Imagem'} onClick={insertImageObject}><ImagePlus size={16} /></RailButton>
        </>
      )}
      <Box flex={1} />
      <RailButton label="Modelos (novo projeto)" onClick={() => s.setGalleryOpen(true)}><LayoutGrid size={16} /></RailButton>
      <RailButton label="Sobre o CutPaper" onClick={() => setAbout(true)}><Info size={16} /></RailButton>
      <AboutDialog open={about} onClose={() => setAbout(false)} />
    </Flex>
  );
}

/** Canvas principal + miniatura flutuante da outra vista (3D na edição, 2D na verificação). */
function CanvasArea() {
  const mode = useStore((s) => s.mode);
  const [miniOpen, setMiniOpen] = useState(true);
  const main3D = mode === 'verify';

  return (
    <Box flex={1} minW="240px" position="relative" bg="gray.50">
      {main3D ? <Box position="absolute" inset={0}><Preview3D /></Box> : <Editor2D />}
      {mode === 'structure' && (
        // aviso visual: editando a geometria do molde
        <Box position="absolute" inset={0} pointerEvents="none" boxShadow="inset 0 0 0 2px var(--chakra-colors-orange-300)" />
      )}
      {!main3D && <ModeSelect />}
      {miniOpen ? (
        <Box position="absolute" top={3} right={3} w="min(300px, 32%)" h="min(230px, 30%)" minW="160px" minH="120px" bg="bg.panel" borderRadius="lg" shadow="lg" borderWidth="1px" borderColor="gray.200" overflow="hidden">
          <Flex position="absolute" top={0} left={0} right={0} zIndex={1} justify="space-between" align="center" px={2} py={1} bg="bg.panel/80">
            <Text fontSize="xs" fontWeight="600" color="gray.600">{main3D ? 'Planificação' : 'Montagem 3D'}</Text>
            <IconButton size="2xs" variant="ghost" aria-label="Minimizar" onClick={() => setMiniOpen(false)}><Minimize2 size={12} /></IconButton>
          </Flex>
          <Box position="absolute" inset={0}>{main3D ? <Editor2D compact /> : <Preview3D compact />}</Box>
        </Box>
      ) : (
        <Button position="absolute" top={3} right={3} size="sm" variant="outline" bg="bg.panel" shadow="sm" onClick={() => setMiniOpen(true)}>
          {main3D ? <MapIcon size={14} /> : <BoxIcon size={14} />} {main3D ? 'Planificação' : '3D'}
        </Button>
      )}
    </Box>
  );
}

const WORK_MODES = [
  { id: 'art' as const, label: 'Arte', icon: Paintbrush },
  { id: 'structure' as const, label: 'Edição', icon: Spline },
];

/** Seletor Arte/Edição no canto do canvas (Tab alterna), como Object/Edit Mode do Blender. */
function ModeSelect() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const cur = WORK_MODES.find((m) => m.id === mode) ?? WORK_MODES[0];
  return (
    <Box position="absolute" top={3} left={3} zIndex={2}>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button size="xs" variant="outline" bg="bg.panel" shadow="xs" title="Modo (Tab alterna)">
            <cur.icon size={15} /> {cur.label} <ChevronDown size={14} />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="190px">
              {WORK_MODES.map((m) => (
                <Menu.Item key={m.id} value={m.id} onSelect={() => setMode(m.id)} fontWeight={m.id === mode ? '700' : '400'}>
                  <m.icon size={15} /> {m.label}
                  <Menu.ItemCommand>Tab</Menu.ItemCommand>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  );
}

function StatusBar() {
  const s = useStore();
  const { dieline, viewBox } = useDieline();
  const issues = useChecks();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <Flex h="24px" flexShrink={0} align="center" px={3} gap={4} fontSize="11px" color="gray.500" bg="bg.panel" borderTopWidth="1px" borderColor="gray.200">
      <span>{dieline.faces.length} faces · {Object.keys(s.doc.graph.e).length} linhas · {s.doc.objects.length} objetos</span>
      <Box as="span" display={{ base: 'none', lg: 'inline' }}>Molde {(viewBox[2] - 4).toFixed(0)} × {(viewBox[3] - 4).toFixed(0)} mm (com sangria)</Box>
      <Box flex={1} />
      <Text
        as="button"
        color={errors ? 'red.600' : warnings ? 'orange.600' : 'green.600'}
        fontWeight="600"
        onClick={() => s.setMode('verify')}
        title="Abrir verificação"
      >
        {errors || warnings
          ? [errors && `⚠ ${errors} erro(s)`, warnings && `${warnings} aviso(s)`].filter(Boolean).join(' · ')
          : '✓ Pronto para imprimir'}
      </Text>
      <Box as="span" display={{ base: 'none', xl: 'inline' }}>Roda = zoom · Espaço = mover · Del = excluir</Box>
    </Flex>
  );
}
