import { Box, Checkbox, Field, Heading, Input, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export const Panel = (props: BoxProps) => (
  <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="gray.200" p={6} overflowY="auto" {...props} />
);

export const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <Box py={5} borderTopWidth="1px" borderColor="gray.100" _first={{ borderTopWidth: 0, pt: 0 }}>
    <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
      <Heading size="sm" fontWeight="700">{title}</Heading>
      {action}
    </Box>
    {children}
  </Box>
);

export function NumField({ label, value, onChange, step = 1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <Field.Root>
      <Field.Label fontSize="xs" color="gray.600">{label}</Field.Label>
      <Input
        type="number"
        size="md"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v) && v >= min) onChange(v);
        }}
      />
    </Field.Root>
  );
}

export function Check({ label, checked, onChange, color }: {
  label: string; checked: boolean; onChange: () => void; color?: string;
}) {
  return (
    <Checkbox.Root checked={checked} onCheckedChange={onChange} size="sm">
      <Checkbox.HiddenInput />
      <Checkbox.Control borderColor={color} bg={checked ? color : undefined} />
      <Checkbox.Label fontSize="sm">{label}</Checkbox.Label>
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
