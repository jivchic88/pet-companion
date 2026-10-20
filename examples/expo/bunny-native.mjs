// Нативный набор кролика примера расширения (PL10.2.4): рисунок веб-набора bunny-web.mjs (220×204, земля y = 188) элементами
// react-native-svg; позы — повороты ушей и сдвиг головы bunny.css, глаза закрыты в rest / content / pet; сценка hop — прыжок
// с поднятыми ушами (фазы показывает PetFigure пакета). Своя вещь уголка — морковка (единицы сцены 400×250, место 40, 232).
// Лапы нет — игре кнопки и область лапы не нужны. Только react и react-native-svg — никаких внутренних модулей пакета.
import { createElement as h } from 'react';
import { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

const COATS = {
  snow: { fur: '#f6f3ee', shade: '#ddd6cc', line: '#8e8478', inner: '#f2b6bf', spot: null },
  grey: { fur: '#bdb8b2', shade: '#9e988f', line: '#6c665f', inner: '#e9a9b3', spot: null },
  spot: { fur: '#f6f3ee', shade: '#ddd6cc', line: '#8e8478', inner: '#f2b6bf', spot: '#8a6a4f' },
};
// Позы — значения bunny.css: повороты ушей (градусы), сдвиг и поворот головы, закрытые глаза, подъём всего рисунка (hop).
const POSES = {
  calm: {},
  attentive: { earL: -4, earR: 4 },
  joy: { earL: -18, earR: 18, headY: -3 },
  rest: { shut: 1, earL: -38, earR: 38, headY: 6 },
  content: { shut: 1 },
  pet: { shut: 1, headR: -6 },
  feed: { headX: -8, headY: 18, headR: -8 },
  sniff: { headX: -4, headY: 8 },
  hop: { allY: -18, earL: -18, earR: 18, headY: -3 },
};
const BASE = { earL: 0, earR: 0, headX: 0, headY: 0, headR: 0, shut: 0, allY: 0 };
const rot = (deg, x, y) => (deg ? `rotate(${deg} ${x} ${y})` : '');
const join = (...parts) => parts.filter(Boolean).join(' ') || 'translate(0 0)';

function BunnyFigure({ pose = 'calm', coat = 'snow', accessory = 'ribbon', prefix = '' } = {}) {
  const c = COATS[coat] ?? COATS.snow;
  const P = { ...BASE, ...(POSES[pose] ?? POSES.calm) };
  const id = `${String(prefix).replace(/[^a-z0-9-]/gi, '')}-bunny-fur`;
  const band = { ribbon: ['#6aa7d8', '#3f6f99'], bow: ['#d86a8c', '#99415c'], clover: ['#6fae73', '#3f7444'] }[accessory];
  return h(
    G,
    null,
    h(Defs, null, h(RadialGradient, { id, cx: '0.45', cy: '0.35', r: '0.75' }, h(Stop, { offset: '0', stopColor: c.fur }), h(Stop, { offset: '1', stopColor: c.shade }))),
    h(Ellipse, { cx: 108, cy: 190, rx: 62, ry: 6.5, fill: '#3a2414', opacity: 0.14 }),
    h(
      G,
      { transform: join(P.allY ? `translate(0 ${P.allY})` : '') },
      h(Circle, { cx: 166, cy: 166, r: 13, fill: '#fffdf8', stroke: c.line, strokeWidth: 1.6 }),
      h(Ellipse, { cx: 110, cy: 152, rx: 58, ry: 38, fill: `url(#${id})`, stroke: c.line, strokeWidth: 2 }),
      h(Ellipse, { cx: 146, cy: 162, rx: 26, ry: 23, fill: c.fur, stroke: c.line, strokeWidth: 1.8 }),
      c.spot ? h(Ellipse, { cx: 128, cy: 140, rx: 18, ry: 14, fill: c.spot, opacity: 0.85 }) : null,
      h(Ellipse, { cx: 88, cy: 186, rx: 15, ry: 6.5, fill: c.fur, stroke: c.line, strokeWidth: 1.6 }),
      h(Ellipse, { cx: 122, cy: 186, rx: 15, ry: 6.5, fill: c.fur, stroke: c.line, strokeWidth: 1.6 }),
      h(
        G,
        { transform: join(P.headX || P.headY ? `translate(${P.headX} ${P.headY})` : '', rot(P.headR, 104, 112)) },
        h(G, { transform: join(rot(P.earL, 86, 70)) }, h(Ellipse, { cx: 86, cy: 40, rx: 12, ry: 32, fill: c.fur, stroke: c.line, strokeWidth: 2 }), h(Ellipse, { cx: 86, cy: 43, rx: 5.5, ry: 24, fill: c.inner })),
        h(G, { transform: join(rot(P.earR, 122, 68)) }, h(Ellipse, { cx: 122, cy: 38, rx: 12, ry: 32, fill: c.fur, stroke: c.line, strokeWidth: 2 }), h(Ellipse, { cx: 122, cy: 41, rx: 5.5, ry: 24, fill: c.inner })),
        h(Ellipse, { cx: 104, cy: 88, rx: 40, ry: 34, fill: `url(#${id})`, stroke: c.line, strokeWidth: 2 }),
        c.spot ? h(Ellipse, { cx: 88, cy: 74, rx: 11, ry: 9, fill: c.spot, opacity: 0.85 }) : null,
        P.shut
          ? h(Path, { d: 'M84 85q6 5 12 0M112 85q6 5 12 0', fill: 'none', stroke: '#2c2622', strokeWidth: 2.2, strokeLinecap: 'round' })
          : h(G, null, h(Circle, { cx: 90, cy: 84, r: 5.2, fill: '#2c2622' }), h(Circle, { cx: 118, cy: 84, r: 5.2, fill: '#2c2622' }), h(Circle, { cx: 91.6, cy: 82.4, r: 1.6, fill: '#fff' }), h(Circle, { cx: 119.6, cy: 82.4, r: 1.6, fill: '#fff' })),
        h(Circle, { cx: 80, cy: 97, r: 6, fill: c.inner, opacity: 0.55 }),
        h(Circle, { cx: 128, cy: 97, r: 6, fill: c.inner, opacity: 0.55 }),
        h(Path, { d: 'M100 96h8l-4 5z', fill: '#d97f8c' }),
        h(Path, { d: 'M104 101v4M104 105q-4 4-8 2M104 105q4 4 8 2', fill: 'none', stroke: c.line, strokeWidth: 1.6, strokeLinecap: 'round' }),
      ),
      band ? h(Path, { d: 'M74 114q30 12 60 0l-2 8q-28 10-56 0z', fill: band[0], stroke: band[1], strokeWidth: 1.6 }) : null,
      accessory === 'bow' ? h(Path, { d: 'M96 118l-12-8v16zM112 118l12-8v16z', fill: '#e88aa6', stroke: '#99415c', strokeWidth: 1.4 }) : null,
      accessory === 'clover' ? h(G, { fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 1 }, h(Circle, { cx: 100, cy: 122, r: 4 }), h(Circle, { cx: 108, cy: 122, r: 4 }), h(Circle, { cx: 104, cy: 117, r: 4 })) : null,
    ),
  );
}

// Морковка — своя игрушка уголка (места — сдвиг отображения уголка).
function BunnyItem({ id } = {}) {
  if (id !== 'carrot') return h(G, null);
  return h(
    G,
    null,
    h(Ellipse, { cx: 40, cy: 240, rx: 16, ry: 2.4, fill: '#3a2414', opacity: 0.16 }),
    h(Path, { d: 'M24 232q2-6 10-6l22 4q2 2 0 4l-22 4q-8 0-10-6z', fill: '#ec8b36', stroke: '#b3601d', strokeWidth: 1.6, strokeLinejoin: 'round' }),
    h(Path, { d: 'M33 229l2 6M41 228l1 7M48 230l1 4', stroke: '#c96f25', strokeWidth: 1.2, strokeLinecap: 'round' }),
    h(Path, { d: 'M56 232q6-8 10-6M56 232q8-2 10 4M56 232q4 6 8 8', fill: 'none', stroke: '#4f9a55', strokeWidth: 2.4, strokeLinecap: 'round' }),
  );
}

export const bunnyNative = Object.freeze({
  pet: 'example.bunny',
  poses: Object.freeze(Object.keys(POSES)),
  coats: Object.freeze(Object.keys(COATS)),
  accessories: Object.freeze(['ribbon', 'bow', 'clover']),
  Figure: BunnyFigure,
  room: true,
  items: Object.freeze(['carrot']),
  Item: BunnyItem,
  play: true,
  scenes: Object.freeze(['hop']),
});
