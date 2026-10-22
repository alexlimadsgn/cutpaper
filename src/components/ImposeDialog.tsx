import { Box, Button, CloseButton, Dialog, Flex, Heading, Portal, SimpleGrid, Text } from '@chakra-ui/react';
import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { layoutSheet, PAPERS, placePoint, type ImposeOptions, type PaperId } from '../export/impose';
import { buildPdf } from '../export/pdf';
import { viewBoxOf } from '../export/svg';
import type { Vec2 } from '../geometry/types';
import { hasInterior, useStore } from '../store';
import { useDieline } from '../useDieline';
import { Check, CompactSelect, FieldLabel, NumField } from './ui';

interface Saved { paper: PaperId; customW: number; customH: number; margin: number; gap: number; quantity: number; rotate: boolean }
const KEY = 'cutpaper:impose';
const DEFAULTS: Saved = { paper: 'a4', customW: 300, customH: 300, margin: 5, gap: 2, quantity: 0, rotate: true };
const load = (): Saved => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
};

const path = (pts: Vec2[], closed = false) => 'M' + pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' L') + (closed ? 'Z' : '');

/** Montar na folha: escolhe papel e quantidade, mostra a prévia e gera o PDF com várias peças por folha. */
export function ImposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const { dieline, material, bleedPolys } = useDieline();
  const [o, setO] = useState<Saved>(load);
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* sem armazenamento */ } }, [o]);
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setO((p) => ({ ...p, [k]: v }));

  const paper = PAPERS.find((p) => p.id === o.paper) ?? PAPERS[0];
  const opts: ImposeOptions = {
    sheetW: paper.id === 'custom' ? o.customW : paper.w,
    sheetH: paper.id === 'custom' ? o.customH : paper.h,
    margin: o.margin, gap: o.gap, quantity: Math.max(0, Math.round(o.quantity)), rotate: o.rotate,
  };
  const outline = bleedPolys.length ? bleedPolys : material;
  const vb = viewBoxOf(outline, 0);
  const lay = useMemo(() => layoutSheet(vb[2], vb[3], opts), [vb[2], vb[3], JSON.stringify(opts)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fits = lay.pages > 0;
  const firstPage = lay.pages === 1 ? lay.perPage.slice(0, lay.lastCount) : lay.perPage;

  const download = async () => {
    setBusy(true);
    try {
      const bytes = await buildPdf({ ...s, objects: s.doc.objects, dieline }, opts);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `caixa-${paper.id === 'custom' ? `${opts.sheetW}x${opts.sheetH}` : paper.id}-${lay.total}un-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const pad = Math.max(lay.pageW, lay.pageH) * 0.02;
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} placement="center" size="lg">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="760px" borderRadius="2xl" mx={4}>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" position="absolute" top={3} right={3} />
            </Dialog.CloseTrigger>
            <Dialog.Body p={{ base: 4, md: 6 }}>
              <Heading fontSize="17px" fontWeight="800" letterSpacing="-0.01em">Montar na folha</Heading>
              <Text fontSize="12px" color="gray.500" mt={1} mb={4}>Várias peças por folha, prontas para imprimir e cortar.</Text>
              <Flex gap={5} direction={{ base: 'column', md: 'row' }}>
                <Box w={{ base: 'full', md: '240px' }} flexShrink={0}>
                  <FieldLabel>Papel</FieldLabel>
                  <CompactSelect value={o.paper} onChange={(v) => set('paper', v as PaperId)} title="Tamanho do papel">
                    {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.name}{p.w ? ` · ${p.w} × ${p.h} mm` : ''}</option>)}
                  </CompactSelect>
                  {o.paper === 'custom' && (
                    <SimpleGrid columns={2} gap={1.5} mt={1.5}>
                      <NumField prefix="L" suffix="mm" title="Largura do papel" min={1} value={o.customW} onChange={(v) => set('customW', v)} />
                      <NumField prefix="A" suffix="mm" title="Altura do papel" min={1} value={o.customH} onChange={(v) => set('customH', v)} />
                    </SimpleGrid>
                  )}
                  <SimpleGrid columns={2} gap={1.5} mt={3}>
                    <NumField prefix="Margem" suffix="mm" title="Margem que a impressora não imprime" step={0.5} value={o.margin} onChange={(v) => set('margin', v)} />
                    <NumField prefix="Espaço" suffix="mm" title="Espaço entre as peças" step={0.5} value={o.gap} onChange={(v) => set('gap', v)} />
                  </SimpleGrid>
                  <Box mt={1.5}>
                    <NumField prefix="Quantidade" suffix={o.quantity ? 'un' : 'encher folha'} title="Quantas peças (0 = quantas couberem em uma folha)" value={o.quantity} onChange={(v) => set('quantity', Math.round(v))} />
                  </Box>
                  <Box mt={3}>
                    <Check label="Girar peças para caber mais" checked={o.rotate} onChange={() => set('rotate', !o.rotate)} />
                  </Box>

                  <Box mt={4} p={3} borderRadius="8px" bg={fits ? 'gray.50' : 'red.50'}>
                    {fits ? (
                      <>
                        <Text fontSize="13px" fontWeight="700">{lay.perPage.length} por folha · {lay.pages} {lay.pages > 1 ? 'folhas' : 'folha'}</Text>
                        <Text fontSize="11px" color="gray.500" mt={0.5}>
                          {lay.total} {lay.total > 1 ? 'peças' : 'peça'} · aproveitamento {Math.round(lay.usage * 100)}% · folha em {lay.pageW > lay.pageH ? 'paisagem' : 'retrato'}
                        </Text>
                        <Text fontSize="11px" color="gray.500">Peça com sangria: {vb[2].toFixed(0)} × {vb[3].toFixed(0)} mm</Text>
                      </>
                    ) : (
                      <Text fontSize="12px" color="red.700">A peça ({vb[2].toFixed(0)} × {vb[3].toFixed(0)} mm) não cabe nesta folha. Escolha um papel maior ou diminua a margem.</Text>
                    )}
                  </Box>
                  <Button w="full" mt={3} size="sm" colorPalette="red" disabled={!fits} loading={busy} loadingText="Gerando PDF…" onClick={download}>
                    <Download size={14} /> Baixar PDF montado
                  </Button>
                  <Text fontSize="10px" color="gray.500" mt={2}>
                    Imprima em tamanho real (100%, sem "ajustar à página"). {hasInterior(s) && 'Com arte no interior, cada folha ganha um verso espelhado (virar pela borda longa).'}
                  </Text>
                </Box>

                <Box flex={1} minW={0} bg="gray.100" borderRadius="12px" p={3} display="grid" placeItems="center" minH="300px">
                  <svg viewBox={`${-pad} ${-pad} ${lay.pageW + 2 * pad} ${lay.pageH + 2 * pad}`} style={{ width: '100%', maxHeight: 420 }}>
                    <rect x={0} y={0} width={lay.pageW} height={lay.pageH} fill="white" stroke="rgba(0,0,0,.15)" strokeWidth={0.6} />
                    <rect x={o.margin} y={o.margin} width={lay.pageW - 2 * o.margin} height={lay.pageH - 2 * o.margin} fill="none" stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="3 2" />
                    {firstPage.map((pl, i) => {
                      const T = placePoint(vb, pl);
                      return (
                        <g key={i}>
                          {outline.map((p, j) => <path key={`b${j}`} d={path(p.map(T), true)} fill="#fef2f2" stroke="#16A34A" strokeWidth={0.3} strokeDasharray="1 1" />)}
                          {dieline.cuts.map((c, j) => <path key={`c${j}`} d={path(c.map(T))} fill="none" stroke="#E5262E" strokeWidth={0.4} />)}
                          {dieline.creases.map((c, j) => <path key={`v${j}`} d={path(c.map(T))} fill="none" stroke="#1E6FE8" strokeWidth={0.35} strokeDasharray="2 1.2" />)}
                        </g>
                      );
                    })}
                  </svg>
                </Box>
              </Flex>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
