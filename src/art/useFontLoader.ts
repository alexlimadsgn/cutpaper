import { useEffect } from 'react';
import { useStore } from '../store';
import { loadFont, onFontLoaded } from './fonts';
import { fitText } from './objects';

/** Carrega as fontes dos textos e, quando chegam, remede e redesenha os textos. */
export function useFontLoader() {
  const objects = useStore((s) => s.doc.objects);
  const keys = objects.filter((o) => o.type === 'text').map((o) => `${o.font}|${o.bold}|${o.italic}`);

  useEffect(() => {
    for (const o of useStore.getState().doc.objects)
      if (o.type === 'text') loadFont(o.font, o.bold, o.italic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(',')]);

  useEffect(
    () =>
      onFontLoaded(() =>
        useStore.setState((s) => ({
          fontsVersion: s.fontsVersion + 1,
          // a medida exata da fonte pode diferir da estimativa: ajusta as caixas (fora do histórico)
          doc: { ...s.doc, objects: s.doc.objects.map((o) => (o.type === 'text' ? fitText(o) : o)) },
        })),
      ),
    [],
  );
}
