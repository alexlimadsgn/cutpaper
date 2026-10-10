import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';

const SWATCHES = ['#ffffff', '#f5e6d3', '#d8efe1', '#cfe3f7', '#fde2e4', '#fff1b8', '#e9d5ff', '#1f2937', '#e5262e', '#16a34a'];

/** Seletor de cor: amostras rápidas + seletor nativo + hex. */
export function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (c?: string) => void }) {
  return (
    <Box>
      <Flex justify="space-between" align="center" mb={2}>
        <Text fontSize="xs" color="gray.600">{label}</Text>
        {value && <Button size="2xs" variant="ghost" onClick={() => onChange(undefined)}>Remover</Button>}
      </Flex>
      <Flex gap={2} align="center" mb={2}>
        <Box position="relative" w="36px" h="36px" flexShrink={0} borderRadius="md" borderWidth="1px" borderColor="gray.300" overflow="hidden"
          bg={value ?? 'repeating-conic-gradient(#e5e7eb 0 25%, white 0 50%) 0 0/10px 10px'}>
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            aria-label={label}
          />
        </Box>
        <Input
          size="sm"
          fontFamily="mono"
          placeholder="Sem cor"
          key={value}
          defaultValue={value ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) onChange(undefined);
            else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) onChange(v.toLowerCase());
          }}
        />
      </Flex>
      <Flex gap={1.5} wrap="wrap">
        {SWATCHES.map((c) => (
          <Box
            key={c}
            as="button"
            w="22px"
            h="22px"
            borderRadius="full"
            bg={c}
            borderWidth="2px"
            borderColor={value === c ? 'gray.800' : 'gray.200'}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </Flex>
    </Box>
  );
}
