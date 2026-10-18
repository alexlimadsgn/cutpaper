import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutosave } from './io/project';
import './theme';

// restaura o último projeto e passa a salvar automaticamente no navegador
startAutosave();

// Tema escuro: a escala de cinza é invertida sob .dark, então os componentes que usam gray.* se adaptam
// sozinhos. Os tokens semânticos do Chakra recebem valores fixos para não herdarem a inversão.
const DARK_GRAY: Record<string, string> = {
  50: '#232327', 100: '#2b2b30', 200: '#36363c', 300: '#45454c', 400: '#6b6b74', 500: '#9a9aa3',
  600: '#b8b8c0', 700: '#d0d0d6', 800: '#e4e4e8', 900: '#f4f4f6', 950: '#fafafa',
};
const DARK_TINTS: Record<string, string> = {
  'blue-50': '#16233a', 'blue-100': '#1c2e4d', 'blue-700': '#93b8f5', 'blue-800': '#aac8f8', 'blue-900': '#c7dbfb',
  'red-50': '#3a1a1c', 'red-100': '#4a2023', 'red-700': '#fca5a5',
  'green-50': '#14301f', 'green-700': '#86efac', 'orange-50': '#3a2612',
  'blackAlpha-200': 'rgba(255,255,255,0.14)',
};
const darkStyle = document.createElement('style');
darkStyle.textContent = `html.dark {${[
  ...Object.entries(DARK_GRAY).map(([k, v]) => `--chakra-colors-gray-${k}:${v};`),
  ...Object.entries(DARK_TINTS).map(([k, v]) => `--chakra-colors-${k}:${v};`),
].join('')}}`;
document.head.appendChild(darkStyle);

const sem = (light: string, dark: string) => ({ value: { _light: light, _dark: dark } });

const system = createSystem(defaultConfig, {
  globalCss: { 'html, body': { bg: 'bg' } },
  theme: {
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: sem('#ffffff', '#141416'), subtle: sem('#fafafa', '#1b1b1e'), muted: sem('#f4f4f5', '#26262a'),
          emphasized: sem('#e4e4e7', '#34343a'), inverted: sem('#000000', '#ffffff'), panel: sem('#ffffff', '#1c1c1f'),
        },
        fg: {
          DEFAULT: sem('#000000', '#ececef'), muted: sem('#52525b', '#a1a1aa'), subtle: sem('#a1a1aa', '#71717a'),
          inverted: sem('#fafafa', '#18181b'),
        },
        border: {
          DEFAULT: sem('#e4e4e7', '#2e2e33'), muted: sem('#f4f4f5', '#26262a'), subtle: sem('#fafafa', '#202024'),
          emphasized: sem('#d4d4d8', '#3f3f46'), inverted: sem('#27272a', '#e4e4e7'),
        },
        gray: {
          contrast: sem('#ffffff', '#18181b'), fg: sem('#27272a', '#e4e4e7'), subtle: sem('#f4f4f5', '#26262a'),
          muted: sem('#e4e4e7', '#303035'), emphasized: sem('#d4d4d8', '#3f3f46'), solid: sem('#18181b', '#f4f4f5'),
          focusRing: sem('#18181b', '#e4e4e7'),
        },
      },
    },
    tokens: {
      fonts: {
        heading: { value: "'Poppins', system-ui, sans-serif" },
        body: { value: "'Poppins', system-ui, sans-serif" },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </StrictMode>,
);
