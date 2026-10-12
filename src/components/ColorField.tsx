import { Box, Flex, IconButton, Text } from '@chakra-ui/react';
import { Minus } from 'lucide-react';
import { useEffect, useState } from 'react';

const SWATCHES = ['#ffffff', '#f5e6d3', '#d8efe1', '#cfe3f7', '#fde2e4', '#fff1b8', '#e9d5ff', '#1f2937', '#e5262e', '#16a34a'];

/** Cor compacta no estilo Figma: amostra + hex na mesma linha, paleta pequena abaixo. */
export function ColorField({ label, value, onChange }: { label?: string; value?: string; onChange: (c?: string) => void }) {
  const [hex, setHex] = useState(value ?? '');
  useEffect(() => setHex(value ?? ''), [value]);
  return (
    <Box>
      {label && <Text fontSize="10px" color="gray.500" mb="3px">{label}</Text>}
      <Flex h="28px" align="center" gap={2} px={1.5} bg="gray.50" borderRadius="6px" borderWidth="1px" borderColor="transparent" _hover={{ borderColor: 'gray.200' }}>
        <Box
          position="relative" w="18px" h="18px" flexShrink={0} borderRadius="4px" borderWidth="1px" borderColor="blackAlpha.200" overflow="hidden"
          bg={value ?? 'repeating-conic-gradient(#e5e7eb 0 25%, white 0 50%) 0 0/8px 8px'}
        >
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            aria-label={label ?? 'Cor'}
          />
        </Box>
        <input
          value={hex.replace('#', '').toUpperCase()}
          placeholder="Sem cor"
          onChange={(e) => setHex(`#${e.target.value.replace('#', '')}`)}
          onBlur={() => {
            const v = hex.trim();
            if (v === '#' || !v) onChange(undefined);
            else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) onChange(v.toLowerCase());
            else setHex(value ?? '');
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#1f2937' }}
        />
        {value && (
          <IconButton size="2xs" variant="ghost" aria-label="Remover cor" title="Remover cor" onClick={() => onChange(undefined)}>
            <Minus size={12} />
          </IconButton>
        )}
      </Flex>
      <Flex gap="5px" wrap="wrap" mt="6px">
        {SWATCHES.map((c) => (
          <Box
            key={c}
            as="button"
            w="16px"
            h="16px"
            borderRadius="4px"
            bg={c}
            borderWidth="1px"
            borderColor={value === c ? 'blue.500' : 'blackAlpha.200'}
            outline={value === c ? '1px solid var(--chakra-colors-blue-500)' : undefined}
            onClick={() => onChange(c)}
            aria-label={c}
            title={c}
          />
        ))}
      </Flex>
    </Box>
  );
}
