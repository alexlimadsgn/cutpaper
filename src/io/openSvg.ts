import { graphBounds, graphFromSegments, scaleGraph } from '../geometry/graph';
import { useStore } from '../store';
import { importSvg } from './importSvg';

/** Abre um .svg do disco e substitui o molde atual (desfazível). */
export function openSvgFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) loadSvgText(file.name, await file.text());
  };
  input.click();
}

/** Importa o texto de um SVG como novo molde. */
export function loadSvgText(name: string, text: string) {
  const st = useStore.getState();
  try {
    const { segs, stats } = importSvg(text);
    if (!segs.length) throw new Error('Nenhuma linha encontrada no arquivo.');
    let graph = graphFromSegments(segs, 0.05);
    // leva o canto superior esquerdo para a origem
    const b = graphBounds(graph);
    graph = scaleGraph(graph, 1, 1, [0, 0]); // cópia
    for (const id in graph.v) { graph.v[id].x -= b.minX; graph.v[id].y -= b.minY; }
    st.commit({ graph, names: {}, root: undefined }, 'import');
    st.select({});
    useStore.setState((s) => ({
      fitToken: s.fitToken + 1,
      faceImages: {},
      importInfo: `${name}: ${stats.cut} elemento(s) de corte, ${stats.crease} de vinco${stats.skipped ? `, ${stats.skipped} ignorado(s)` : ''}.`,
    }));
  } catch (err) {
    useStore.setState({ importInfo: `Falha ao importar: ${(err as Error).message}` });
  }
}
