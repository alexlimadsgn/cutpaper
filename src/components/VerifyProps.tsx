import { Box, Button, Flex, SimpleGrid, Slider, Stack, Text } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Info, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../export/svg';
import { clearSteps } from '../geometry/faces';
import { stepCount } from '../geometry/fold';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import type { Issue, Severity } from '../verify/checks';
import { useChecks } from '../verify/useChecks';
import { Check, NumField, Section } from './ui';

const SEV: Record<Severity, { icon: typeof Info; color: string; bg: string; label: string }> = {
  error: { icon: CircleAlert, color: 'red.700', bg: 'red.50', label: 'Erros' },
  warning: { icon: TriangleAlert, color: 'orange.700', bg: 'orange.50', label: 'Atenção' },
  info: { icon: Info, color: 'blue.700', bg: 'blue.50', label: 'Informações' },
};

/** Propriedades do modo Verificar: dobra, animação e lista de problemas. */
export function VerifyProps() {
  const s = useStore();
  const issues = useChecks();
  const { dieline } = useDieline();
  const steps = stepCount(dieline.faces);
  const stepFaces = Array.from({ length: steps }, (_, i) => dieline.faces.filter((f) => f.step === i + 1));
  const current = s.fold <= 0 ? 0 : Math.min(steps, Math.ceil(s.fold * steps - 1e-6));
  const manual = Object.values(s.doc.graph.e).some((e) => e.step);
  const goStep = (k: number) => { setPlaying(false); s.setFold(steps ? Math.max(0, Math.min(steps, k)) / steps : 0); };
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  // anima planificado → montado → planificado
  useEffect(() => {
    if (!playing) return;
    const per = 1200 * Math.max(1, steps);
    const start = performance.now() - useStore.getState().fold * per;
    const tick = (now: number) => {
      const t = ((now - start) % (2 * per)) / per;
      useStore.getState().setFold(t <= 1 ? t : 2 - t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const open = (i: Issue) => {
    if (i.object) s.select({ object: i.object, face: i.face });
    else if (i.face) s.select({ face: i.face });
  };
  const fix = (i: Issue) => {
    const o = s.doc.objects.find((x) => x.id === i.object);
    if (i.fix === 'rotate180' && o) s.updateObject(o.id, { rotation: (o.rotation + 180) % 360 });
  };
  const goEdit = (i: Issue) => {
    s.setMode(i.object ? 'art' : 'structure');
    open(i);
  };

  return (
    <>
      <Section
        title="Montagem passo a passo"
        action={manual && (
          <Button size="2xs" variant="ghost" onClick={() => s.commit({ graph: clearSteps(s.doc.graph) })} title="Volta para a ordem sugerida automaticamente">
            <RotateCcw size={12} /> Ordem automática
          </Button>
        )}
      >
        <Flex gap={3} align="center">
          <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar' : 'Animar'}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Slider.Root
            flex={1}
            value={[Math.round(s.fold * 100)]}
            onValueChange={(d) => { setPlaying(false); s.setFold(d.value[0] / 100); }}
            min={0}
            max={100}
            colorPalette="red"
          >
            <Slider.Control>
              <Slider.Track><Slider.Range /></Slider.Track>
              <Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
            </Slider.Control>
          </Slider.Root>
        </Flex>
        <Flex justify="space-between" align="center" fontSize="xs" color="gray.500" mt={2}>
          <Button size="2xs" variant="ghost" disabled={current <= 0} onClick={() => goStep(current - 1)} aria-label="Etapa anterior"><ChevronLeft size={14} /></Button>
          <Text fontWeight="600" color="gray.700">{current === 0 ? 'Planificado' : `Etapa ${current} de ${steps}`}</Text>
          <Button size="2xs" variant="ghost" disabled={current >= steps} onClick={() => goStep(current + 1)} aria-label="Próxima etapa"><ChevronRight size={14} /></Button>
        </Flex>
        <Stack gap={1} mt={3}>
          {stepFaces.map((fs, i) => {
            const k = i + 1;
            const state = k < current || (k === current && s.fold * steps >= k - 1e-6) ? 'done' : k === current ? 'doing' : 'todo';
            return (
              <Flex
                key={k}
                as="button"
                gap={2}
                align="flex-start"
                textAlign="left"
                p={2}
                borderRadius="md"
                fontSize="xs"
                bg={k === current ? 'red.50' : undefined}
                borderWidth="1px"
                borderColor={k === current ? 'red.200' : 'transparent'}
                _hover={{ bg: k === current ? 'red.50' : 'gray.50' }}
                onClick={() => goStep(k)}
              >
                <Box
                  w="20px" h="20px" flexShrink={0} borderRadius="full" display="grid" placeItems="center" fontWeight="700" fontSize="2xs"
                  bg={state === 'todo' ? 'gray.100' : 'red.500'} color={state === 'todo' ? 'gray.600' : 'white'}
                >
                  {k}
                </Box>
                <Text color="gray.700" pt="2px">{fs.map((f) => f.name).join(', ')}</Text>
              </Flex>
            );
          })}
        </Stack>
        <Text fontSize="xs" color="gray.500" mt={2}>
          Clique numa etapa para ver a caixa até ali. Para mudar a ordem, selecione o vinco no modo Estrutura.
        </Text>
      </Section>

      <Section title="Verificação">
        {issues.length === 0 ? (
          <Flex gap={2} align="center" color="green.700" bg="green.50" p={3} borderRadius="md" fontSize="sm">
            <CircleCheck size={18} /> Tudo certo para imprimir e montar.
          </Flex>
        ) : (
          <Stack gap={4}>
            {(['error', 'warning', 'info'] as Severity[]).map((sev) => {
              const list = issues.filter((i) => i.severity === sev);
              if (!list.length) return null;
              const { icon: Icon, color, bg, label } = SEV[sev];
              return (
                <Box key={sev}>
                  <Text fontSize="xs" fontWeight="700" color={color} mb={2} textTransform="uppercase" letterSpacing="0.05em">
                    {label} ({list.length})
                  </Text>
                  <Stack gap={2}>
                    {list.map((i, k) => {
                      const active = (i.object && s.sel.object === i.object) || (!i.object && i.face && s.sel.face === i.face);
                      return (
                        <Box
                          key={k}
                          p={2}
                          borderRadius="md"
                          bg={bg}
                          borderWidth="1px"
                          borderColor={active ? color : 'transparent'}
                          cursor="pointer"
                          onClick={() => open(i)}
                        >
                          <Flex gap={2} align="flex-start" fontSize="xs" color={color}>
                            <Box pt="1px" flexShrink={0}><Icon size={14} /></Box>
                            <Box flex={1}>
                              <Text fontWeight="600" fontSize="2xs" opacity={0.8}>{i.group}</Text>
                              {i.text}
                            </Box>
                          </Flex>
                          {active && (
                            <Flex gap={2} mt={2} justify="flex-end">
                              {i.fix === 'rotate180' && (
                                <Button size="2xs" colorPalette="orange" onClick={(e) => { e.stopPropagation(); fix(i); }}>Girar 180°</Button>
                              )}
                              {(i.object || i.face) && (
                                <Button size="2xs" variant="outline" bg="white" onClick={(e) => { e.stopPropagation(); goEdit(i); }}>
                                  Editar no modo {i.object ? 'Arte' : 'Estrutura'}
                                </Button>
                              )}
                            </Flex>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
        <Text fontSize="xs" color="gray.500" mt={3}>
          A verificação simula a caixa 100% montada. Clique num item para localizá-lo.
        </Text>
      </Section>

      <Section title="Critérios">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="Margem do texto (mm)" step={0.5} value={s.safeMargin} onChange={s.setSafeMargin} />
          <NumField label="Resolução mínima (dpi)" step={50} value={s.minDpi} onChange={s.setMinDpi} />
        </SimpleGrid>
      </Section>

      <Section title="Linhas visíveis">
        <Flex wrap="wrap" gap={4}>
          <Check label="Corte" color={COLORS.cut} checked={s.layers.cut} onChange={() => s.toggleLayer('cut')} />
          <Check label="Vinco" color={COLORS.crease} checked={s.layers.crease} onChange={() => s.toggleLayer('crease')} />
          <Check label="Sangria" color={COLORS.bleed} checked={s.layers.bleed} onChange={() => s.toggleLayer('bleed')} />
          <Check label="Arte" checked={s.layers.artwork} onChange={() => s.toggleLayer('artwork')} />
        </Flex>
      </Section>
    </>
  );
}
