import { Box, Button, Flex, Group, IconButton, Input, NativeSelect, SimpleGrid, Slider, Stack, Text, Textarea } from '@chakra-ui/react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, Copy, Italic, Minus, Move, Plus, Trash2,
} from 'lucide-react';
import { FONTS } from '../art/fonts';
import { imageRect, toWorld, type ArtObject } from '../art/objects';
import { useStore } from '../store';
import { useDieline } from '../useDieline';
import { ColorField } from './ColorField';
import { NumField, Section, pickImage } from './ui';

/** Corte da imagem (máscara não destrutiva): ajustar, preencher, imagem inteira e zoom. */
function ImageCrop({ o }: { o: ArtObject }) {
  const s = useStore();
  const c = imageRect(o);
  const editing = s.cropEdit === o.id;
  // zoom em torno do centro da moldura
  const zoom = (f: number) => {
    const cx = o.w / 2, cy = o.h / 2;
    s.updateObject(o.id, { crop: { x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f, w: c.w * f, h: c.h * f } });
  };
  // preencher: a imagem cobre a moldura inteira, centralizada, sem distorcer
  const fill = () => {
    const k = Math.max(o.w / c.w, o.h / c.h);
    const w = c.w * k, h = c.h * k;
    s.updateObject(o.id, { crop: { x: (o.w - w) / 2, y: (o.h - h) / 2, w, h } });
  };
  // imagem inteira: a moldura volta a ser o retângulo da imagem
  const reset = () => {
    const [cx, cy] = toWorld(o, [-o.w / 2 + c.x + c.w / 2, -o.h / 2 + c.y + c.h / 2]);
    s.updateObject(o.id, { x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h, crop: undefined });
    s.setCropEdit(undefined);
  };
  return (
    <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3}>
      <Text fontSize="xs" fontWeight="600" color="gray.700" mb={1}>Corte da imagem</Text>
      <Text fontSize="2xs" color="gray.500" mb={2}>
        Alças do meio cortam; cantos escalam. Duplo clique na imagem para reposicioná-la dentro do corte.
      </Text>
      <Stack gap={2}>
        <Button size="xs" colorPalette={editing ? 'blue' : 'gray'} variant={editing ? 'solid' : 'outline'} onClick={() => s.setCropEdit(editing ? undefined : o.id)}>
          <Move size={13} /> {editing ? 'Concluir ajuste' : 'Ajustar posição no corte'}
        </Button>
        <Flex gap={2}>
          <Button flex={1} size="xs" variant="outline" onClick={fill} title="A imagem cobre todo o corte, sem distorcer">Preencher</Button>
          <Button flex={1} size="xs" variant="outline" onClick={reset} disabled={!o.crop} title="Desfaz o corte e mostra a imagem inteira">Imagem inteira</Button>
        </Flex>
        <Flex gap={2} align="center">
          <Text fontSize="xs" color="gray.600" flex={1}>Zoom da imagem</Text>
          <Group attached>
            <IconButton size="xs" variant="outline" aria-label="Diminuir" onClick={() => zoom(1 / 1.1)}><Minus size={12} /></IconButton>
            <IconButton size="xs" variant="outline" aria-label="Aumentar" onClick={() => zoom(1.1)}><Plus size={12} /></IconButton>
          </Group>
        </Flex>
      </Stack>
    </Box>
  );
}

const TYPE_LABEL = { rect: 'Retângulo', ellipse: 'Elipse', text: 'Texto', image: 'Imagem' };

/** Propriedades do objeto de arte selecionado. */
export function ObjectProps({ o }: { o: ArtObject }) {
  const s = useStore();
  const { dieline } = useDieline();
  const up = (patch: Partial<ArtObject>) => s.updateObject(o.id, patch);
  const r = (n: number) => +n.toFixed(2);

  return (
    <>
      <Section
        title={TYPE_LABEL[o.type]}
        action={
          <Flex gap={1}>
            <IconButton size="xs" variant="ghost" aria-label="Duplicar" title="Duplicar (Ctrl+D)" onClick={() => s.duplicateObject(o.id)}><Copy size={14} /></IconButton>
            <IconButton size="xs" variant="ghost" colorPalette="red" aria-label="Excluir" title="Excluir (Del)" onClick={() => s.deleteObject(o.id)}><Trash2 size={14} /></IconButton>
          </Flex>
        }
      >
        <Input size="sm" key={o.id} defaultValue={o.name} onBlur={(e) => e.target.value !== o.name && up({ name: e.target.value })} />
      </Section>

      {o.type === 'text' && (
        <Section title="Texto">
          <Stack gap={3}>
            <Textarea
              id="art-text-input"
              size="sm"
              rows={2}
              key={`${o.id}-t`}
              defaultValue={o.text}
              // edição ao vivo; entra no histórico como um passo só, ao sair do campo
              onFocus={() => s.beginDrag()}
              onChange={(e) => s.setObjectLive(o.id, { text: e.target.value })}
              onBlur={() => s.endDrag(true)}
            />
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={o.font} onChange={(e) => up({ font: e.target.value })} fontFamily={o.font}>
                {FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</option>)}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Flex gap={2} align="end">
              <NumField label="Tamanho (pt)" min={1} step={1} value={r(o.fontSize ?? 12)} onChange={(v) => up({ fontSize: Math.max(1, v) })} />
              <Group attached>
                <IconButton size="md" variant={o.bold ? 'solid' : 'outline'} aria-label="Negrito" onClick={() => up({ bold: !o.bold })}><Bold size={14} /></IconButton>
                <IconButton size="md" variant={o.italic ? 'solid' : 'outline'} aria-label="Itálico" onClick={() => up({ italic: !o.italic })}><Italic size={14} /></IconButton>
              </Group>
            </Flex>
            <Group attached w="full">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <Button key={a} flex={1} size="sm" variant={o.align === a ? 'solid' : 'outline'} onClick={() => up({ align: a })} aria-label={a}><Icon size={14} /></Button>
              ))}
            </Group>
          </Stack>
        </Section>
      )}

      <Section title="Posição e tamanho">
        <SimpleGrid columns={2} gap={3}>
          <NumField label="X (mm)" min={-1e6} step={0.5} value={r(o.x)} onChange={(v) => up({ x: v })} />
          <NumField label="Y (mm)" min={-1e6} step={0.5} value={r(o.y)} onChange={(v) => up({ y: v })} />
          {o.type !== 'text' && <NumField label="Largura (mm)" min={1} step={0.5} value={r(o.w)} onChange={(v) => up({ w: Math.max(1, v) })} />}
          {o.type !== 'text' && <NumField label="Altura (mm)" min={1} step={0.5} value={r(o.h)} onChange={(v) => up({ h: Math.max(1, v) })} />}
          <NumField label="Rotação (°)" min={-360} step={1} value={r(o.rotation)} onChange={(v) => up({ rotation: v })} />
          {o.type === 'rect' && <NumField label="Cantos (mm)" min={0} step={0.5} value={r(o.radius)} onChange={(v) => up({ radius: v })} />}
        </SimpleGrid>
      </Section>

      <Section title="Aparência">
        <Stack gap={5}>
          {o.type === 'image' ? (
            <Stack gap={2}>
              <Button size="sm" variant="outline" onClick={() => pickImage((src) => up({ src }))}>Trocar imagem</Button>
              <ImageCrop o={o} />
            </Stack>
          ) : (
            <ColorField label={o.type === 'text' ? 'Cor do texto' : 'Preenchimento'} value={o.fill} onChange={(fill) => up({ fill })} />
          )}
          {o.type !== 'image' && (
            <>
              <ColorField label="Contorno" value={o.stroke} onChange={(stroke) => up({ stroke })} />
              {o.stroke && <NumField label="Espessura do contorno (mm)" min={0} step={0.1} value={r(o.strokeWidth)} onChange={(v) => up({ strokeWidth: v })} />}
            </>
          )}
          <div>
            <Flex justify="space-between" mb={2}>
              <Text fontSize="xs" color="gray.600">Opacidade</Text>
              <Text fontSize="xs" color="gray.500">{Math.round(o.opacity * 100)}%</Text>
            </Flex>
            <Slider.Root
              value={[Math.round(o.opacity * 100)]}
              min={0}
              max={100}
              onValueChange={(d) => {
                if (!useStore.getState().dragging) s.beginDrag();
                s.setObjectLive(o.id, { opacity: d.value[0] / 100 });
              }}
              onValueChangeEnd={() => s.endDrag(true)}
            >
              <Slider.Control>
                <Slider.Track><Slider.Range /></Slider.Track>
                <Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
              </Slider.Control>
            </Slider.Root>
          </div>
        </Stack>
      </Section>

      <Section title="Recorte e ordem">
        <Stack gap={3}>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field value={o.clip ?? ''} onChange={(e) => up({ clip: e.target.value || undefined })}>
              <option value="">Molde inteiro (atravessa faces)</option>
              {dieline.faces.map((f) => <option key={f.id} value={f.id}>Face: {f.name}</option>)}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Text fontSize="xs" color="gray.500">
            Recortado numa face, o objeto some ao passar das bordas dela. "Molde inteiro" vai até a sangria.
          </Text>
          <Group attached w="full">
            <IconButton flex={1} size="sm" variant="outline" aria-label="Para o fundo" title="Para o fundo" onClick={() => s.reorderObject(o.id, 'back')}><ArrowDownToLine size={14} /></IconButton>
            <IconButton flex={1} size="sm" variant="outline" aria-label="Recuar" title="Recuar" onClick={() => s.reorderObject(o.id, 'down')}><ChevronDown size={14} /></IconButton>
            <IconButton flex={1} size="sm" variant="outline" aria-label="Avançar" title="Avançar" onClick={() => s.reorderObject(o.id, 'up')}><ChevronUp size={14} /></IconButton>
            <IconButton flex={1} size="sm" variant="outline" aria-label="Para a frente" title="Para a frente" onClick={() => s.reorderObject(o.id, 'front')}><ArrowUpToLine size={14} /></IconButton>
          </Group>
        </Stack>
      </Section>
    </>
  );
}
