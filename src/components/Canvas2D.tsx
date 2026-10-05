import { Box } from '@chakra-ui/react';
import { useMemo } from 'react';
import { buildSvg } from '../export/svg';
import { polyToPath } from '../geometry/outline';
import { useStore } from '../store';
import { useDieline } from '../useDieline';

/** Visualização 2D: SVG final (o mesmo do export) + camada transparente para selecionar faces. */
export function Canvas2D({ zoom }: { zoom: number }) {
  const { dieline, viewBox } = useDieline();
  const { bleed, layers, fullImage, faceImages, selectedFace, selectFace } = useStore();
  const svg = useMemo(
    () => buildSvg({ dieline, bleed, layers, fullImage, faceImages }),
    [dieline, bleed, layers, fullImage, faceImages],
  );
  const aspect = viewBox[2] / viewBox[3];

  return (
    <Box
      position="relative"
      w={`${zoom * 100}%`}
      maxW={`${zoom * 100}%`}
      style={{ aspectRatio: aspect }}
      maxH={`${zoom * 100}%`}
      css={{ '& > div > svg': { width: '100%', height: '100%', display: 'block' } }}
    >
      <Box position="absolute" inset={0} bg="white" dangerouslySetInnerHTML={{ __html: svg }} />
      <svg
        viewBox={viewBox.join(' ')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onClick={() => selectFace(undefined)}
      >
        {dieline.faces.map((f) => (
          <path
            key={f.id}
            d={polyToPath([f.poly])}
            fill={selectedFace === f.id ? 'rgba(229,38,46,0.15)' : 'transparent'}
            stroke={selectedFace === f.id ? '#E5262E' : 'none'}
            strokeWidth={0.6}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              selectFace(f.id);
            }}
          >
            <title>{f.name}</title>
          </path>
        ))}
      </svg>
    </Box>
  );
}
