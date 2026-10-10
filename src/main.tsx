import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutosave } from './io/project';

// restaura o último projeto e passa a salvar automaticamente no navegador
startAutosave();

const system = createSystem(defaultConfig, {
  theme: {
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
