import { Box, Button, Flex, Slider, Stack, Text } from '@chakra-ui/react';
import { CircleAlert, CircleCheck, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../export/svg';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { Check, Section } from './ui';

/** Propriedades do modo Verificar: dobra, animação e lista de problemas de montagem. */
export function VerifyProps() {
  const s = useStore();
  const { dieline, conflicts } = useDieline();
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  // anima planificado → montado → planificado
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - useStore.getState().fold * 2000;
    const tick = (now: number) => {
      const t = ((now - start) % 4000) / 2000;
      useStore.getState().setFold(t <= 1 ? t : 2 - t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const name = (id: string) => dieline.faces.find((f) => f.id === id)?.name ?? 'face';
  const roots = dieline.faces.filter((f) => !f.parent);
  const problems = [
    ...conflicts.map((c) => ({
      face: c.face,
      text: c.kind === 'overlap'
        ? `"${name(c.face)}" sobrepõe "${name(c.other)}" na caixa montada.`
        : `"${name(c.face)}" passa da borda de "${name(c.other)}", onde deveria ser colada.`,
    })),
    ...(roots.length > 1
      ? roots.slice(1).map((f) => ({ face: f.id, text: `"${f.name}" não está ligada ao resto por nenhum vinco.` }))
      : []),
  ];

  return (
    <>
      <Section title="Dobra">
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
        <Flex justify="space-between" fontSize="xs" color="gray.500" mt={2}>
          <span>Planificado</span><span>{Math.round(s.fold * 100)}%</span><span>Montado</span>
        </Flex>
      </Section>

      <Section title="Montagem">
        {problems.length === 0 ? (
          <Flex gap={2} align="center" color="green.700" bg="green.50" p={3} borderRadius="md" fontSize="sm">
            <CircleCheck size={18} /> Nenhum problema encontrado.
          </Flex>
        ) : (
          <Stack gap={2}>
            {problems.map((p, i) => (
              <Flex
                key={i}
                as="button"
                gap={2}
                textAlign="left"
                align="flex-start"
                p={2}
                borderRadius="md"
                fontSize="xs"
                bg={s.sel.face === p.face ? 'red.100' : 'red.50'}
                color="red.700"
                _hover={{ bg: 'red.100' }}
                onClick={() => s.select({ face: p.face })}
              >
                <Box pt="1px" flexShrink={0}><CircleAlert size={14} /></Box>
                {p.text}
              </Flex>
            ))}
          </Stack>
        )}
        <Text fontSize="xs" color="gray.500" mt={3}>
          A verificação simula a caixa 100% montada. Clique num problema para localizar a face.
        </Text>
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
