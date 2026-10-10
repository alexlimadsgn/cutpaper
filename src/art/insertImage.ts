import { pickImage } from '../components/ui';
import { deriveDieline } from '../geometry/faces';
import { graphBounds } from '../geometry/graph';
import { bounds } from '../geometry/outline';
import { useStore } from '../store';
import { createObject } from './objects';

/** Escolhe uma imagem e a insere como objeto, centrada na face selecionada (ou no molde). */
export function insertImageObject() {
  pickImage((src) => {
    const img = new Image();
    img.onload = () => {
      const st = useStore.getState();
      const d = deriveDieline(st.doc.graph, st.doc.names, st.doc.root);
      const face = d.faces.find((f) => f.id === st.sel.face);
      const area = face ? bounds([face.poly]) : graphBounds(st.doc.graph);
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      // ocupa até 80% da área, mantendo a proporção da imagem
      let w = area.w * 0.8, h = w / ratio;
      if (h > area.h * 0.8) { h = area.h * 0.8; w = h * ratio; }
      const cx = area.minX + area.w / 2, cy = area.minY + area.h / 2;
      st.addObject(createObject('image', { x: cx - w / 2, y: cy - h / 2, w, h }, { src, clip: face?.id, name: 'Imagem' }));
    };
    img.src = src;
  });
}
