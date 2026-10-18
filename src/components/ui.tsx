import { Box, Checkbox, Flex, Text, type BoxProps } from '@chakra-ui/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export const Panel = (props: BoxProps) => (
  <Box bg="bg.panel" borderRadius="xl" borderWidth="1px" borderColor="gray.200" p={6} overflowY="auto" {...props} />
);

// ---------- seções recolhíveis (estado lembrado neste navegador) ----------

const SECTIONS_KEY = 'cutpaper:sections';
const loadClosed = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}'); } catch { return {}; }
};

/** Seção compacta do painel, no estilo Figma: título pequeno, ação à direita, recolhível. */
export function Section({ title, children, action, collapsible = true }: {
  title: string; children: ReactNode; action?: ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(() => !loadClosed()[title]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const all = loadClosed();
      if (next) delete all[title]; else all[title] = true;
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(all));
    } catch { /* sem armazenamento: só não lembra */ }
  };
  return (
    <Box borderTopWidth="1px" borderColor="gray.100" _first={{ borderTopWidth: 0 }} px={3} pb={open ? 3 : 0}>
      <Flex h="34px" align="center" gap={1}>
        <Flex
          flex={1}
          align="center"
          gap={1}
          cursor={collapsible ? 'pointer' : 'default'}
          onClick={collapsible ? toggle : undefined}
          userSelect="none"
          color="gray.800"
        >
          <Text fontSize="11px" fontWeight="600" letterSpacing="0.01em">{title}</Text>
          {collapsible && (
            <Box color="gray.400">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</Box>
          )}
        </Flex>
        {action}
      </Flex>
      {open && children}
    </Box>
  );
}

// ---------- campo numérico compacto ----------

/**
 * Campo numérico no estilo Figma/Paper: rótulo curto dentro do campo (ex.: "X", "L", "∠").
 * Sem `prefix`, mostra `label` como legenda pequena acima.
 * Guarda o texto enquanto se digita (permite "-", "1," …) e aplica quando vira um número válido.
 */
export function NumField({ label, prefix, suffix, value, onChange, step = 1, min = 0, title }: {
  label?: string; prefix?: ReactNode; suffix?: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; title?: string;
}) {
  const fmt = (n: number) => (Number.isFinite(n) ? String(+n.toFixed(3)).replace('.', ',') : '');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmt(value)); }, [value, focused]);

  const commit = (raw: string) => {
    const v = parseFloat(raw.replace(',', '.'));
    if (!Number.isNaN(v) && v >= min) onChange(v);
  };
  const nudge = (dir: number, big: boolean) => {
    const v = +(value + dir * step * (big ? 10 : 1)).toFixed(4);
    if (v >= min) onChange(v);
  };

  const field = (
    <Flex
      h="28px"
      align="center"
      gap={1.5}
      px={2}
      bg="gray.50"
      borderRadius="6px"
      borderWidth="1px"
      borderColor={focused ? 'blue.400' : 'transparent'}
      _hover={{ borderColor: focused ? 'blue.400' : 'gray.200' }}
      title={title ?? label}
      minW={0}
    >
      {prefix !== undefined && (
        <Text as="span" fontSize="11px" color="gray.500" flexShrink={0} lineHeight={1} whiteSpace="nowrap">{prefix}</Text>
      )}
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={() => { setFocused(false); commit(text); }}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey); }
        }}
        style={{ flex: 1, minWidth: 0, width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--chakra-colors-gray-800)' }}
      />
      {suffix && <Text as="span" fontSize="11px" color="gray.400" flexShrink={0}>{suffix}</Text>}
    </Flex>
  );
  if (prefix !== undefined || !label) return field;
  return (
    <Box minW={0}>
      <Text fontSize="10px" color="gray.500" mb="3px" truncate>{label}</Text>
      {field}
    </Box>
  );
}

/** Rótulo pequeno de um grupo de campos. */
export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <Text fontSize="10px" color="gray.500" mb="3px">{children}</Text>
);

export function Check({ label, checked, onChange, color }: {
  label: string; checked: boolean; onChange: () => void; color?: string;
}) {
  return (
    <Checkbox.Root checked={checked} onCheckedChange={onChange} size="xs">
      <Checkbox.HiddenInput />
      <Checkbox.Control borderColor={color} bg={checked ? color : undefined} />
      <Checkbox.Label fontSize="12px">{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}

/** Lê um arquivo de imagem como data URL (fica embutido no SVG exportado). */
export const pickImage = (cb: (url: string) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cb(reader.result as string);
    reader.readAsDataURL(file);
  };
  input.click();
};

/** Select compacto no mesmo estilo dos campos (28 px, fundo cinza claro). */
export function CompactSelect({ value, onChange, children, title, fontFamily }: {
  value: string; onChange: (v: string) => void; children: ReactNode; title?: string; fontFamily?: string;
}) {
  return (
    <Box position="relative" h="28px" bg="gray.50" borderRadius="6px" borderWidth="1px" borderColor="transparent" _hover={{ borderColor: 'gray.200' }} title={title}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none', width: '100%', height: '100%', border: 'none', outline: 'none', background: 'transparent',
          fontSize: 12, padding: '0 22px 0 8px', color: 'var(--chakra-colors-gray-800)', fontFamily, cursor: 'pointer',
        }}
      >
        {children}
      </select>
      <Box position="absolute" right="6px" top="50%" transform="translateY(-50%)" pointerEvents="none" color="gray.500">
        <ChevronDown size={12} />
      </Box>
    </Box>
  );
}

/** Grupo de botões-ícone compactos (alinhamento, negrito…). */
export function IconToggles({ items }: {
  items: { key: string; icon: ReactNode; active?: boolean; title: string; onClick: () => void }[];
}) {
  return (
    <Flex h="28px" bg="gray.50" borderRadius="6px" p="2px" gap="2px">
      {items.map((it) => (
        <Box
          key={it.key}
          as="button"
          flex={1}
          display="grid"
          placeItems="center"
          borderRadius="4px"
          bg={it.active ? 'bg.panel' : 'transparent'}
          boxShadow={it.active ? 'xs' : undefined}
          color={it.active ? 'gray.900' : 'gray.500'}
          _hover={{ color: 'gray.900' }}
          title={it.title}
          aria-label={it.title}
          onClick={it.onClick}
        >
          {it.icon}
        </Box>
      ))}
    </Flex>
  );
}
