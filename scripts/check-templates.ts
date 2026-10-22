// Confere os modelos paramétricos: faces geradas, dobras e conflitos na caixa montada.
// Uso: npx tsx scripts/check-templates.ts
import { deriveDieline, flapIds } from '../src/geometry/faces';
import { findConflicts } from '../src/geometry/fold';
import { PRESETS, TEMPLATES } from '../src/geometry/templates';
import type { BoxParams } from '../src/geometry/types';

const BASE: BoxParams = { width: 100, depth: 80, height: 40, tuck: 15, glue: 20, thickness: 0.5 };

for (const p of PRESETS) {
  const t = TEMPLATES[p.template];
  const { graph, names, root } = t.build({ ...BASE, ...p.params });
  const d = deriveDieline(graph, names, root);
  const unnamed = d.faces.filter((f) => !Object.values(names).includes(f.name)).length;
  const orphans = d.faces.filter((f) => f.id !== root && !f.parent).length;
  const conflicts = findConflicts(d.faces);
  const flaps = flapIds(d);
  console.log(
    `${p.name.padEnd(18)} faces=${d.faces.length} sem-nome=${unnamed} soltas=${orphans} abas=${flaps.size} ` +
    `furos=${d.faces.reduce((n, f) => n + f.holes.length, 0)} conflitos=${conflicts.length}`,
    conflicts.map((c) => `${d.faces.find((f) => f.id === c.face)?.name}×${d.faces.find((f) => f.id === c.other)?.name}:${c.kind}:${c.area.toFixed(0)}`).join(' '),
  );
}

// etapas de montagem por face
for (const id of ['cube', 'hex']) {
  const p = PRESETS.find((x) => x.id === id)!;
  const { graph, names, root } = TEMPLATES[p.template].build({ ...BASE, ...p.params });
  const d = deriveDieline(graph, names, root);
  console.log(p.name, d.faces.filter((f) => f.step).sort((a, b) => a.step! - b.step!).map((f) => `${f.step}:${f.name}`).join(' | '));
}

// tamanho de cada modelo (com 3 mm de sangria) e quantos cabem numa A4
import { bleedOutline, materialOutline } from '../src/geometry/outline';
import { viewBoxOf } from '../src/export/svg';
import { layoutSheet } from '../src/export/impose';
for (const p of PRESETS) {
  const { graph, names, root } = TEMPLATES[p.template].build({ ...BASE, ...p.params });
  const vb = viewBoxOf(bleedOutline(materialOutline(deriveDieline(graph, names, root)), 3), 0);
  const a4 = layoutSheet(vb[2], vb[3], { sheetW: 210, sheetH: 297, margin: 5, gap: 2, quantity: 0, rotate: true });
  console.log(`${p.name.padEnd(18)} ${vb[2].toFixed(0)}×${vb[3].toFixed(0)} mm · A4: ${a4.perPage.length}`);
}
