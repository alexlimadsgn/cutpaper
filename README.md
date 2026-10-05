# CutPaper

Planificador de papelaria personalizada (die cut): moldes paramétricos e editáveis, linhas de **corte**, **vinco** e **sangria** configuráveis, arte por face ou no molde inteiro, e preview **3D dobrável**.

## Stack

React + Vite + TypeScript · Chakra UI v3 · Three.js (@react-three/fiber) · Zustand · clipper2-js

## Rodando

```bash
npm install
npm run dev
```

## Estrutura

- `src/geometry/` — modelo do molde (faces + dobras), templates paramétricos, contorno de corte e sangria
- `src/export/svg.ts` — SVG 1:1 em mm com camadas `ARTE`, `SANGRIA`, `CORTE`, `VINCO`
- `src/components/Preview3D.tsx` — dobra 3D a partir da árvore de faces
