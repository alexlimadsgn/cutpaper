import { download } from '../export/svg';
import { useStore } from '../store';

/** Campos do estado que formam o projeto salvo. */
const KEYS = [
  'doc', 'source', 'template', 'params', 'bleed', 'layers', 'fullImage', 'faceImages', 'faceColors', 'bgColor',
  'grid', 'safeMargin', 'minDpi', 'interior',
] as const;

const AUTOSAVE_KEY = 'cutpaper:autosave';
const FORMAT = 'cutpaper';
const VERSION = 1;

export function serializeProject(): string {
  const st = useStore.getState();
  const data: Record<string, unknown> = { format: FORMAT, version: VERSION, savedAt: new Date().toISOString() };
  for (const k of KEYS) data[k] = st[k];
  return JSON.stringify(data);
}

export function loadProject(text: string) {
  const data = JSON.parse(text);
  if (data?.format !== FORMAT || !data.doc?.graph) throw new Error('Este arquivo não é um projeto do CutPaper.');
  const patch: Record<string, unknown> = {};
  for (const k of KEYS) if (k in data) patch[k] = data[k];
  // projetos antigos não têm interior
  patch.interior = data.interior ?? { faceColors: {}, faceImages: {} };
  const doc = { objects: [], names: {}, ...data.doc };
  useStore.setState((s) => ({
    ...patch,
    doc,
    past: [],
    future: [],
    sel: { vertices: [], edges: [] },
    fitToken: s.fitToken + 1,
    importInfo: undefined,
  }));
}

export function saveProjectFile() {
  const name = `caixa-${new Date().toISOString().slice(0, 10)}.cutpaper`;
  download(name, serializeProject(), 'application/json');
}

export function openProjectFile(onError: (msg: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.cutpaper,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      loadProject(await file.text());
    } catch (e) {
      onError((e as Error).message);
    }
  };
  input.click();
}

/**
 * Salvamento automático no navegador (por usuário/aparelho).
 * Restaura o último projeto ao abrir; se o projeto for grande demais (imagens), não salva.
 */
export function startAutosave() {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) loadProject(saved);
  } catch { /* armazenamento indisponível ou projeto inválido: começa do zero */ }

  let timer = 0;
  let last = '';
  return useStore.subscribe((s, prev) => {
    if (s.dragging || KEYS.every((k) => s[k] === prev[k])) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const json = serializeProject();
        if (json === last) return;
        localStorage.setItem(AUTOSAVE_KEY, json);
        last = json;
      } catch { /* cota excedida: segue sem autosave */ }
    }, 800);
  });
}
