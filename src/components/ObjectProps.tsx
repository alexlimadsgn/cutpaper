import { Box, Button, Flex, IconButton, SimpleGrid, Text, Textarea } from '@chakra-ui/react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, Copy, Crop, Italic,
  Maximize, Minus, Plus, RotateCw, Scan, SquareRoundCorner, Trash2,
} from 'lucide-react';
import { FONTS } from '../art/fonts';
import { imageRect, toWorld, type ArtObject } from '../art/objects';
import { useSettledStore } from '../store';
import { useSettledDieline } from '../useDieline';
import { ColorField } from './ColorField';
import { CompactSelect, IconToggles, NumField, Section, pickImage } from './ui';

const TYPE_LABEL = { rect: 'Retângulo', ellipse: 'Elipse', text: 'Texto', image: 'Imagem' };
const r = (n: number) => +n.toFixed(2);

/** Corte da imagem (máscara não destrutiva): ajustar, preencher, imagem inteira e zoom. */
function ImageCrop({ o }: { o: ArtObject }) {
  const s = useSettledStore();
  const c = imageRect(o);
  const editing = s.cropEdit === o.id;
  const zoom = (f: number) => {
    const cx = o.w / 2, cy = o.h / 2;
    s.updateObject(o.id, { crop: { x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f, w: c.w * f, h: c.h * f } });
  };
  const fill = () => {
    const k = Math.max(o.w / c.w, o.h / c.h);
    const w = c.w * k, h = c.h * k;
    s.updateObject(o.id, { crop: { x: (o.w - w) / 2, y: (o.h - h) / 2, w, h } });
  };
  const reset = () => {
    const [cx, cy] = toWorld(o, [-o.w / 2 + c.x + c.w / 2, -o.h / 2 + c.y + c.h / 2]);
    s.updateObject(o.id, { x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h, crop: undefined });
    s.setCropEdit(undefined);
  };
  return (
    <Section title="Corte" action={
      <Button size="2xs" variant={editing ? 'solid' : 'ghost'} colorPalette={editing ? 'blue' : 'gray'} onClick={() => s.setCropEdit(editing ? undefined : o.id)} title="Duplo clique na imagem também ajusta">
        <Crop size={12} /> {editing ? 'Concluir' : 'Ajustar'}
      </Button>
    }>
      <Flex gap={1.5}>
        <Button flex={1} size="2xs" variant="subtle" onClick={fill} title="A imagem cobre todo o corte, sem distorcer"><Maximize size={12} /> Preencher</Button>
        <Button flex={1} size="2xs" variant="subtle" onClick={reset} disabled={!o.crop} title="Desfaz o corte"><Scan size={12} /> Inteira</Button>
        <IconButton size="2xs" variant="subtle" aria-label="Diminuir zoom" title="Diminuir a imagem" onClick={() => zoom(1 / 1.1)}><Minus size={12} /></IconButton>
        <IconButton size="2xs" variant="subtle" aria-label="Aumentar zoom" title="Aumentar a imagem" onClick={() => zoom(1.1)}><Plus size={12} /></IconButton>
      </Flex>
      <Text fontSize="10px" color="gray.500" mt={2}>Alças do meio cortam · cantos escalam · duplo clique reposiciona.</Text>
    </Section>
  );
}

/** Propriedades do objeto de arte selecionado (layout compacto, estilo Figma). */
export function ObjectProps({ o }: { o: ArtObject }) {
  const s = useSettledStore();
  const { dieline } = useSettledDieline();
  const up = (patch: Partial<ArtObject>) => s.updateObject(o.id, patch);

  return (
    <>
      {/* cabeçalho: nome editável + ações */}
      <Flex px={3} h="40px" align="center" gap={1} borderBottomWidth="1px" borderColor="gray.100">
        <Text fontSize="10px" fontWeight="600" color="gray.500" textTransform="uppercase" letterSpacing="0.04em" flexShrink={0}>{TYPE_LABEL[o.type]}</Text>
        <input
          key={o.id}
          defaultValue={o.name}
          onBlur={(e) => e.target.value !== o.name && up({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, padding: '0 6px', color: 'var(--chakra-colors-gray-900)' }}
        />
        <IconButton size="2xs" variant="ghost" aria-label="Duplicar" title="Duplicar (Ctrl+D)" onClick={() => s.duplicateObject(o.id)}><Copy size={13} /></IconButton>
        <IconButton size="2xs" variant="ghost" aria-label="Excluir" title="Excluir (Del)" onClick={() => s.deleteObject(o.id)}><Trash2 size={13} /></IconButton>
      </Flex>

      <Section title="Layout">
        <SimpleGrid columns={2} gap={1.5}>
          <NumField prefix="X" title="Posição X (mm)" min={-1e6} step={0.5} value={r(o.x)} onChange={(v) => up({ x: v })} />
          <NumField prefix="Y" title="Posição Y (mm)" min={-1e6} step={0.5} value={r(o.y)} onChange={(v) => up({ y: v })} />
          {o.type !== 'text' && <NumField prefix="L" title="Largura (mm)" min={1} step={0.5} value={r(o.w)} onChange={(v) => up({ w: Math.max(1, v) })} />}
          {o.type !== 'text' && <NumField prefix="A" title="Altura (mm)" min={1} step={0.5} value={r(o.h)} onChange={(v) => up({ h: Math.max(1, v) })} />}
          <NumField prefix={<RotateCw size={11} />} suffix="°" title="Rotação" min={-360} step={1} value={r(o.rotation)} onChange={(v) => up({ rotation: v })} />
          {o.type === 'rect' && <NumField prefix={<SquareRoundCorner size={11} />} title="Cantos arredondados (mm)" min={0} step={0.5} value={r(o.radius)} onChange={(v) => up({ radius: v })} />}
        </SimpleGrid>
      </Section>

      {o.type === 'text' && (
        <Section title="Texto">
          <Textarea
            id="art-text-input"
            size="xs"
            rows={2}
            fontSize="12px"
            bg="gray.50"
            borderColor="transparent"
            borderRadius="6px"
            key={`${o.id}-t`}
            defaultValue={o.text}
            mb={1.5}
            // edição ao vivo; entra no histórico como um passo só, ao sair do campo
            onFocus={() => s.beginDrag()}
            onChange={(e) => s.setObjectLive(o.id, { text: e.target.value })}
            onBlur={() => s.endDrag(true)}
          />
          <Box mb={1.5}>
            <CompactSelect value={o.font ?? 'Poppins'} onChange={(font) => up({ font })} fontFamily={o.font} title="Fonte">
              {FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</option>)}
            </CompactSelect>
          </Box>
          <SimpleGrid columns={2} gap={1.5}>
            <NumField prefix="Tt" suffix="pt" title="Tamanho da fonte" min={1} step={1} value={r(o.fontSize ?? 12)} onChange={(v) => up({ fontSize: Math.max(1, v) })} />
            <IconToggles items={[
              { key: 'b', icon: <Bold size={13} />, active: o.bold, title: 'Negrito', onClick: () => up({ bold: !o.bold }) },
              { key: 'i', icon: <Italic size={13} />, active: o.italic, title: 'Itálico', onClick: () => up({ italic: !o.italic }) },
            ]} />
          </SimpleGrid>
          <Box mt={1.5}>
            <IconToggles items={([['left', AlignLeft, 'Alinhar à esquerda'], ['center', AlignCenter, 'Centralizar'], ['right', AlignRight, 'Alinhar à direita']] as const).map(([a, Icon, t]) => ({
              key: a, icon: <Icon size={13} />, active: o.align === a, title: t, onClick: () => up({ align: a }),
            }))} />
          </Box>
        </Section>
      )}

      {o.type === 'image' ? (
        <>
          <Section title="Imagem" action={<Button size="2xs" variant="ghost" onClick={() => pickImage((src) => up({ src }))}>Trocar</Button>}>
            <NumField prefix="Opacidade" suffix="%" min={0} step={5} value={Math.round(o.opacity * 100)} onChange={(v) => up({ opacity: Math.min(100, v) / 100 })} />
          </Section>
          <ImageCrop o={o} />
        </>
      ) : (
        <>
          <Section title={o.type === 'text' ? 'Cor' : 'Preenchimento'}>
            <ColorField value={o.fill} onChange={(fill) => up({ fill })} />
            <Box mt={1.5}>
              <NumField prefix="Opacidade" suffix="%" min={0} step={5} value={Math.round(o.opacity * 100)} onChange={(v) => up({ opacity: Math.min(100, v) / 100 })} />
            </Box>
          </Section>
          <Section
            title="Contorno"
            action={!o.stroke && (
              <IconButton size="2xs" variant="ghost" aria-label="Adicionar contorno" title="Adicionar contorno" onClick={() => up({ stroke: '#1f2937' })}><Plus size={13} /></IconButton>
            )}
          >
            {o.stroke && (
              <>
                <ColorField value={o.stroke} onChange={(stroke) => up({ stroke })} />
                <Box mt={1.5}>
                  <NumField prefix="Espessura" suffix="mm" min={0} step={0.1} value={r(o.strokeWidth)} onChange={(v) => up({ strokeWidth: v })} />
                </Box>
              </>
            )}
          </Section>
        </>
      )}

      <Section title="Recorte e ordem">
        <CompactSelect value={o.clip ?? ''} onChange={(v) => up({ clip: v || undefined })} title="Onde o objeto é recortado">
          <option value="">Molde inteiro (até a sangria)</option>
          {dieline.faces.map((f) => <option key={f.id} value={f.id}>Face: {f.name}</option>)}
        </CompactSelect>
        <Box mt={1.5}>
          <IconToggles items={[
            { key: 'back', icon: <ArrowDownToLine size={13} />, title: 'Para o fundo', onClick: () => s.reorderObject(o.id, 'back') },
            { key: 'down', icon: <ChevronDown size={13} />, title: 'Recuar', onClick: () => s.reorderObject(o.id, 'down') },
            { key: 'up', icon: <ChevronUp size={13} />, title: 'Avançar', onClick: () => s.reorderObject(o.id, 'up') },
            { key: 'front', icon: <ArrowUpToLine size={13} />, title: 'Para a frente', onClick: () => s.reorderObject(o.id, 'front') },
          ]} />
        </Box>
      </Section>
    </>
  );
}
