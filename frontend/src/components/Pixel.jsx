import './Pixel.css';

// A small pixel drawing of the farm's brown hen, used sparingly (only where a
// page would otherwise be empty). Each sprite is a grid of letters; every
// letter is one colour, drawn as SVG squares so it stays sharp.

const PALETTE = {
  B: '#9a5b34', // hen body
  D: '#6e3d22', // hen wing
  R: '#c2412f', // comb
  Y: '#e3a33b', // beak, legs
  K: '#1f2b22', // eye, outline
};

export const SPRITES = {
  hen: [
    '........RR....',
    '.......RRBB...',
    '.......BBBKY..',
    '.......BBBBYY.',
    '.......BBBR...',
    'B.....BBBBB...',
    'BB...BBBBBB...',
    'BBBBBBBBBBBB..',
    'BBBBDDDDBBBB..',
    '.BBBDDDDDBB...',
    '..BBBBBBBB....',
    '....Y...Y.....',
    '...YY..YY.....',
  ],
  henStep: [
    '........RR....',
    '.......RRBB...',
    '.......BBBKY..',
    '.......BBBBYY.',
    '.......BBBR...',
    'B.....BBBBB...',
    'BB...BBBBBB...',
    'BBBBBBBBBBBB..',
    'BBBBDDDDBBBB..',
    '.BBBDDDDDBB...',
    '..BBBBBBBB....',
    '.....Y.Y......',
    '.....YYYY.....',
  ],
  henPeck: [
    '..............',
    '..............',
    '..............',
    'B.............',
    'BB...BBBBB....',
    'BBBBBBBBBBRR..',
    'BBBBDDDDBBBBR.',
    '.BBBDDDDDBBKY.',
    '..BBBBBBBBBRYY',
    '...BBBBBBB....',
    '....BBBBB.....',
    '....Y...Y.....',
    '...YY..YY.....',
  ],
};

export default function Pixel({ name, scale = 4, className = '', title }) {
  const rows = SPRITES[name];
  if (!rows) return null;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = PALETTE[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={fill} />);
    });
  });
  return (
    <svg
      className={`pixel ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {rects}
    </svg>
  );
}

// A hen that walks: two leg frames swap while she moves, and every so often
// she stops to peck.
export function Hen({ scale = 4, className = '' }) {
  return (
    <span className={`pixel-hen ${className}`} aria-hidden="true">
      <Pixel name="hen" scale={scale} className="pixel-hen__a" />
      <Pixel name="henStep" scale={scale} className="pixel-hen__b" />
      <Pixel name="henPeck" scale={scale} className="pixel-hen__peck" />
    </span>
  );
}
