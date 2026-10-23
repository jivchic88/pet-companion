// Натив: штатный набор кролика bunnyNative (с 0.4.0; docs/ARCHITECTURE.md § 7.4, § 12.2). Рисунок Пуха веб-набора
// (bunny-art.mjs, по эталону владельца: длинные стоячие уши, широкая голова с пушистыми щеками и хохолком, небольшие карие
// глаза с тёмной линией века, маленький нос, рот «w», тонкие усы за контуром, пушистая грудка, хвост-помпон, терракотовый
// платок с узлом сбоку) перенесён в элементы react-native-svg в тех же единицах 220×204; позы — таблица суставов из
// bunny.css (веки, уши, брови, голова, взгляд, хвост, левая лапка, аксессуар, «сидит» / «лежит»), облики — палитры и
// отметины BUNNY_COATS, надетый аксессуар — платок, бантик или клевер. Набор не решает, какую позу показать: Figure получает
// позу, облик и аксессуар из снимка.

import { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { bodyShift, bowl, grow, h, idPrefix, linear, move, radial, SCARF, sharedDefs, stretchY, tf, turn } from './svg.mjs';

// Бантик и клевер — общие для всех обликов; платок — общий с котом и собакой (svg.mjs, SCARF).
const RIBBON = Object.freeze({ pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' });

// Палитры обликов (bunny-art.mjs, BUNNY_COATS): smoke — штрихи меха, ear — наружная сторона ушей, marks — отметины.
const COATS = Object.freeze({
  fawn: {
    furLight: '#fffaf2', fur: '#f7ecdb', furDark: '#e6d1b0', line: '#4a3326', headHi: '#fffbf5', lid: '#faf1e3', headEdge: '#ecdabd', ear: '#f7ecdb', earLine: '#4a3326',
    earIn: '#f6c3b8', earDeep: '#ec9f96', smoke: '#dcc3a0', sheen: '#ffffff', cream: '#fffaf3', creamHi: '#ffffff', creamShade: '#f3e6d2', bibTop: '#fdf6ec', bibBottom: '#f6ebdc',
    paw: '#fcf4e8', toe: '#9c7f62', tuft: '#ffffff', tail: '#fffaf3', tailShade: '#eadcc6', nose: '#ec9a9a', noseLine: '#b8686c', whisker: '#6b5240', blush: '#f4b8ae', brow: '#c4a37e', eyeLine: '#2a1d16', patch: '', marks: '',
  },
  snow: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', line: '#5a5249', headHi: '#ffffff', lid: '#f6f3ee', headEdge: '#d8d1c5', ear: '#f0ece5', earLine: '#5a5249',
    earIn: '#f4bcc6', earDeep: '#e5a0ae', smoke: '#c6bdae', sheen: '#ffffff', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f8f4ee', bibBottom: '#efe8dd',
    paw: '#f8f3ea', toe: '#9d9284', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#5a5249', blush: '#f0a9b2', brow: '#b3a893', eyeLine: '#2b2420', patch: '', marks: '',
  },
  spot: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', line: '#4f3d30', headHi: '#ffffff', lid: '#f6f3ee', headEdge: '#d8d1c5', ear: '#8a5a3c', earLine: '#4f3d30',
    earIn: '#efb1bb', earDeep: '#dd96a3', smoke: '#c6bdae', sheen: '#ffffff', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f8f4ee', bibBottom: '#efe8dd',
    paw: '#f8f3ea', toe: '#9d9284', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#4f3d30', blush: '#f0a9b2', brow: '#8a5a3c', eyeLine: '#2b2420', patch: '#8a5a3c', marks: 'patch',
  },
});

// Позы — значения суставов bunny.css (переменные --bn-*); не заданное — как у покоя по умолчанию.
const BASE = Object.freeze({
  lidUp: 3, lidDown: 0, earL: 0, earR: 8, headX: 0, headY: 0, headR: 0, lookX: 0, lookY: 0, pupil: 1, happy: 0, sleep: 0, browY: 0, browL: 0, browR: 0, tail: 0, leg: 0,
  collarY: 0, collarS: 1, sitS: 1, sit: 1, lie: 0, allX: 0, allY: 0, mouth: 'calm', bowl: '', wash: 0,
});
const POSES = Object.freeze({
  calm: { lidUp: 1, lidDown: -1, earL: -2, earR: 5 },
  attentive: { lidUp: -1, pupil: 1.08, headR: -4, headY: -2, earL: 4, earR: -4, browY: -2 },
  greet: { lidUp: 24, happy: 1, headY: -3, headR: 4, earL: -8, earR: 14, tail: -6, mouth: 'smile' },
  joy: { lidUp: 24, happy: 1, headY: -3, headR: -4, earL: -12, earR: 18, tail: -8, mouth: 'smile' },
  support: { lidUp: 3, lidDown: -3, headR: -8, earL: -26, earR: 30, lookY: 1, browL: -10, browR: 10, browY: -1 },
  pet: { lidUp: 24, happy: 1, headR: 9, headX: 1, headY: 2, earL: -34, earR: 36, tail: -4 },
  unlock: { lidUp: 0, lookX: -2.6, lookY: 2.6, pupil: 1.1, headR: -9, headY: 2, earL: 6, earR: -2, browY: -2 },
  wait: { lidUp: 3, headR: 3, earL: -6, earR: 12, lookY: 1, browL: -5, browR: 5 },
  rest: { sitS: 0.8, sit: 0, lie: 1, headY: 60, headR: -3, collarY: 55, collarS: 0.7, lidUp: 24, sleep: 1, earL: -62, earR: 66 },
  yawn: { lidUp: 24, sleep: 1, headY: -3, headR: -4, earL: -16, earR: 20, mouth: 'yawn' },
  paw: { leg: -34, lidUp: 1, headR: -7, earL: 2, earR: 2, tail: -5, mouth: 'smile' },
  sniff: { headY: 6, headR: -8, lookX: -2.6, lookY: 2.6, lidUp: 2, earL: 6, earR: -3 },
  watch: { lookX: -2.6, lookY: 1.5, headR: -4, lidUp: 1, earL: 2, earR: 4 },
  ball: { lidUp: -1, lookX: -2.8, lookY: 2.4, pupil: 1.12, headR: -9, earL: 8, earR: -8, tail: -6, browY: -2 },
  // Сдвиг к миске меньше веба (−30, +12 в сцене 400×250): в рамке рисунка 220×204 питомец не срезается краем.
  feed: { allX: -20, allY: 10, headY: 44, headR: -9, collarY: 30, collarS: 0.85, lidUp: 24, happy: 1, earL: 10, earR: -6, tail: -8, bowl: 'full' },
  fed: { lidUp: 24, happy: 1, headY: -3, headR: 5, earL: -10, earR: 16, tail: -8, mouth: 'smile', bowl: 'empty' },
  content: { lidUp: 9, lidDown: -2, earL: -10, earR: 16, tail: -3 },
  // Сценки — ключевые позы кадров веба: «прыгает» — в воздухе с прижатыми ушами, «умывается» — лапка у мордочки.
  hop: { allY: -14, sitS: 1.04, earL: -24, earR: 30, lidUp: 24, happy: 1, headY: -2, mouth: 'smile' },
  wash: { leg: -52, headX: -3, headY: 9, headR: 12, earL: 12, earR: -6, lidUp: 24, wash: 1 },
});
// Предмет справа (reaction.toward): взгляд и голова в другую сторону.
const RIGHT = { lookX: 2.6, headR: 8, earL: -4, earR: 14 };

const params = (pose, toward) => {
  const own = Object.hasOwn(POSES, pose) ? POSES[pose] : POSES.calm;
  const turned = toward === 'right' && ['sniff', 'watch', 'ball'].includes(pose) ? RIGHT : {};
  return { ...BASE, ...own, ...turned };
};

// Геометрия — та же, что в bunny-art.mjs; правая половина — зеркало левой по x = 100.
const mirror = (d) => d.replace(/(\d*\.?\d+) (\d*\.?\d+)/g, (_, x, y) => `${+(200 - Number(x)).toFixed(2)} ${y}`);
const side = (d, l) => (l ? d : mirror(d));

const EYE_Y = 88;
const EYE_RX = 7.6;
const EYE_RY = 8.8;
const EYES = { l: 82, r: 118 };
const TAIL = 'M145 160C148 153.5 158 152.5 162.5 158C167 163.5 165.5 173 158.5 176C152.5 178.5 146 176 144.5 170C143.8 166.5 144 163 145 160Z';
const SIDE_PATCH = 'M124 140C132 135 143 139 146 148C148.5 156 143 163 135 162C127 161 121 154 121.5 147C121.7 144 122.6 141.8 124 140Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M52 164C57 159 65 161 67 168C68.5 173 64 178 58.5 177C53 176 50 171 51 167Z';
const TORSO = 'M75 117C63 127 56 141 56 156C47 162 44.5 175 50 183.5C53 187.5 58 188 64 188L136 188C142 188 147 187.5 150 183.5C155.5 175 153 162 144 156C144 141 137 127 125 117Z';
const CHEST = 'M100 127C112 127 121.5 139 121.5 153C121.5 166 112 174 100 174C88 174 78.5 166 78.5 153C78.5 139 88 127 100 127Z';
const HAUNCH_L = 'M57 156C66.5 159.5 74 168 76.5 179.5';
const FOOT_L = 'M52.5 184.5Q52.5 177.5 65.5 177.5Q78.5 177.5 78.5 184.5Q78.5 190.5 65.5 190.5Q52.5 190.5 52.5 184.5Z';
const FOOT_TOES_L = 'M62 186.5L62 189.8M68.5 186.5L68.5 189.8';
const LEG = {
  fill: 'M80.5 150C79.5 161 79.5 171 80.5 181.5L100 181.5L100 154C94 152 87 151 80.5 150Z',
  side: 'M80 160C79.6 167 79.8 174 80.5 181',
  inner: 'M100 163L100 181',
  paw: 'M78.5 184Q78.5 177.5 89.5 177.5Q100.5 177.5 100.5 184Q100.5 190.5 89.5 190.5Q78.5 190.5 78.5 184Z',
  toes: 'M86.5 186L86.5 189.6M92.5 186L92.5 189.6',
};
const SCARF_BAND = 'M66.5 119.5C82 128 118 128 133.5 119.5L134.5 126.5C118 135 82 135 65.5 126.5Z';
const SCARF_TIP = 'M71 125C85 131.5 115 131.5 129 125C122 137 111 148 100 157C89 148 78 137 71 125Z';
const SCARF_TAILS = 'M131.5 129.5Q138.5 134.5 142.5 146Q136.5 144.5 130.5 137ZM127.5 131Q131.5 139 131.5 149.5Q126.5 145 125.5 136.5Z';
const SCARF_KNOT = 'M124.5 125Q128.5 119.5 134 122.5Q137.5 127 134 131.5Q128.5 133.5 125.5 130Z';
const EYE_PATCH = 'M106 76C111 69 126 69 131 77C134 83 133 95 127 99C121 103 110 102 106.5 96C103 90 103 81 106 76Z';
const EAR_L = 'M68 66C58 50 51.5 29 55 15C57 7 60.5 3 64.5 3.2C70 3.5 77 12 82 22C87.5 33 90.5 46 90 62Z';
const EAR_IN_L = 'M71.5 60C64 46 59.5 29 61 18C62 12 64.5 9 67.5 9.8C71.5 11 76 18 79.5 26C84 36 86 48 85.5 60Z';
const EAR_FUR_L = 'M57.5 31Q57 22 60 14';
const BROW_L = 'M75 75Q81 71.5 87.5 74';
const SKULL = 'M100 53.5C121 53.5 136.5 63 141.5 79C144.5 90 145.5 101 141 110C134 120 118 124.5 100 124.5C82 124.5 66 120 59 110C54.5 101 55.5 90 58.5 79C63.5 63 79 53.5 100 53.5Z';
const CHEEK_EDGE_L = 'M57.5 88Q52 91 53 95.5Q48.5 98.5 51.2 103Q48 107.5 53.5 110.5Q53.5 114.8 59.5 114';
const CHEEK_FILL_L = `${CHEEK_EDGE_L}L62.5 108L60.5 99L59.5 88Z`;
const TUFT_EDGE = 'M92.5 58Q91.5 50.5 96 47Q96 51.5 98.8 53.5Q99 47 103.5 44Q102.8 49.5 105.5 52Q108 49.5 111.5 50Q108.5 53.5 109 58';
const MUZZLE = 'M86 101C91 96 96 97.5 100 101C104 97.5 109 96 114 101C122 106 121 117 111 119.5C106 120.8 94 120.8 89 119.5C79 117 78 106 86 101Z';
const WHISKERS_L = 'M68 101.5Q55 99.8 41.5 100.6M68 105Q55 106 42.5 109.8M70.5 108.5Q60 113 49.5 120';

const stroke = (color, width, extra = {}) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', ...extra });
const outline = (fill, color, width) => ({ fill, stroke: color, strokeWidth: width, strokeLinejoin: 'round' });

function defs(p, c) {
  return h(
    Defs,
    null,
    linear(`${p}-fur`, { gradientUnits: 'userSpaceOnUse', x1: 60, y1: 110, x2: 150, y2: 192 }, [['0', c.furLight], ['0.5', c.fur], ['1', c.furDark]]),
    radial(`${p}-head`, { gradientUnits: 'userSpaceOnUse', cx: 100, cy: 84, r: 54 }, [['0', c.headHi], ['0.5', c.lid], ['0.82', c.fur], ['1', c.headEdge]]),
    linear(`${p}-ear`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.earDeep], ['0.7', c.earIn], ['1', c.earIn, 0.6]]),
    linear(`${p}-ear-out`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', c.ear], ['1', c.furDark]]),
    radial(`${p}-cream`, { cx: '50%', cy: '42%', r: '62%' }, [['0', c.creamHi], ['0.7', c.cream], ['1', c.creamShade, 0]]),
    linear(`${p}-bib`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.bibTop], ['0.45', c.cream], ['1', c.bibBottom]]),
    radial(`${p}-tail`, { cx: '40%', cy: '35%', r: '70%' }, [['0', c.tail], ['1', c.tailShade]]),
    radial(`${p}-iris`, { cx: '45%', cy: '62%', r: '62%' }, [['0', '#b8793c'], ['0.5', '#7a4520'], ['1', '#331b0b']]),
    linear(`${p}-bow`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', RIBBON.pinkLight], ['0.55', RIBBON.pink], ['1', RIBBON.pinkDark]]),
    linear(`${p}-clover`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', RIBBON.greenLight], ['0.55', RIBBON.green], ['1', RIBBON.greenDark]]),
    ...sharedDefs(p),
    h(ClipPath, { id: `${p}-eye-l` }, h(Ellipse, { cx: EYES.l, cy: EYE_Y, rx: EYE_RX, ry: EYE_RY })),
    h(ClipPath, { id: `${p}-eye-r` }, h(Ellipse, { cx: EYES.r, cy: EYE_Y, rx: EYE_RX, ry: EYE_RY })),
  );
}

// Хвост-помпон за правым бедром; покачивание — поворот у основания.
function tail(p, c, P) {
  return h(
    G,
    { transform: tf(turn(P.tail, 150, 164)) },
    h(Path, { d: TAIL, ...outline(`url(#${p}-tail)`, c.line, 1.7) }),
    h(Path, { d: 'M150 157.5Q154 155 158.5 156.5M161.5 162Q164 165.5 163.5 170', ...stroke(c.tailShade, 1.4, { opacity: 0.9 }) }),
  );
}

function leg(p, c, s, P) {
  const l = s === 'l';
  return h(
    G,
    { key: s, transform: tf(l ? turn(P.leg, 92, 162) : '') },
    h(Path, { d: side(LEG.fill, l), fill: `url(#${p}-bib)` }),
    h(Path, { d: `${side(LEG.side, l)}${LEG.inner}`, ...stroke(c.line, 1.7) }),
    h(Path, { d: side(LEG.paw, l), fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { d: side(LEG.toes, l), ...stroke(c.toe, 1.2) }),
  );
}

function foot(c, l) {
  return [
    h(Path, { key: `f${l}`, d: side(FOOT_L, l), fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { key: `t${l}`, d: side(FOOT_TOES_L, l), ...stroke(c.toe, 1.2) }),
  ];
}

// Сидя: туловище-груша, светлая грудка, линии бёдер, большие задние ступни и две передние лапки.
function sittingBody(p, c, P) {
  return h(
    G,
    { transform: tf(stretchY(P.sitS, 104, 188)) },
    tail(p, c, P),
    h(Path, { d: TORSO, ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.patch ? h(Path, { d: SIDE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    c.patch ? h(Path, { d: HIP_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: CHEST, fill: `url(#${p}-bib)`, opacity: 0.95 }),
    h(Path, { d: 'M60 139Q57 147 57.5 154M140 139Q143 147 142.5 154', ...stroke(c.furDark, 1.8, { opacity: 0.55 }) }),
    h(Path, { d: `${HAUNCH_L}${mirror(HAUNCH_L)}`, ...stroke(c.line, 1.6, { opacity: 0.9 }) }),
    foot(c, true),
    foot(c, false),
    leg(p, c, 'r', P),
    leg(p, c, 'l', P),
    h(Path, { d: 'M81.5 140q3 3 3 7.5M118.5 140q-3 3-3 7.5M86.5 150q2 2.5 1.5 6M113.5 150q-2 2.5-1.5 6M61 132q-2.5 3-2 6.5M139 132q2.5 3 2 6.5', ...stroke(c.furDark, 1.3, { opacity: 0.6 }) }),
  );
}

// Отдых: распластался — тело низко, задняя лапа вытянута, голова на передних лапах.
function lyingBody(p, c) {
  return h(
    G,
    null,
    h(Path, { d: 'M28 188C24 166 50 142 96 140C140 138 176 150 186 172C190 182 184 188 174 188Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.patch ? h(Path, { d: LIE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: 'M158 150C166 142 180 142 186 150C192 158 188 170 178 172C170 174 160 168 158 160C157.5 156.5 157.7 153 158 150Z', ...outline(`url(#${p}-tail)`, c.line, 1.6) }),
    h(Path, { d: 'M56 152C86 142 126 142 158 152', ...stroke(c.sheen, 2.2, { opacity: 0.5 }) }),
    h(Path, { d: 'M40 168C40 176 44 184 50 188', ...stroke(c.sheen, 2, { opacity: 0.45 }) }),
  );
}

function lyingFront(p, c) {
  const paw = (x) => [
    h(Path, { key: `p${x}`, d: `M${x} 186Q${x} 179 ${x + 11} 179Q${x + 22} 179 ${x + 22} 186Q${x + 22} 193 ${x + 11} 193Q${x} 193 ${x} 186Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { key: `t${x}`, d: `M${x + 8} 187.5v3.8M${x + 14} 187.5v3.8`, ...stroke(c.toe, 1.2) }),
  ];
  return h(
    G,
    null,
    h(Path, { d: 'M150 176C166 174 186 176 196 182C201 186 198 192 190 192Q166 192 146 189Z', ...outline(`url(#${p}-fur)`, c.line, 1.6) }),
    h(Path, { d: 'M179 184v5.5M186 184.5v5.5', ...stroke(c.toe, 1.2) }),
    paw(78),
    paw(100),
  );
}

// Бантик ленточки: две петли, хвостики, узел — в точке (cx, cy) с масштабом s.
function bow(fill, dark, cx, cy, s) {
  return h(
    G,
    { transform: tf(move(cx, cy), grow(s, s, 0, 0)) },
    h(Path, { d: 'M0 0Q-9-14-18-8Q-20 2-8 6Z', ...outline(fill, dark, 1.4) }),
    h(Path, { d: 'M0 0Q9-14 18-8Q20 2 8 6Z', ...outline(fill, dark, 1.4) }),
    h(Path, { d: 'M-2 4Q-8 12-6 18M2 4Q8 12 6 18', ...stroke(dark, 4) }),
    h(Path, { d: 'M-2 4Q-8 12-6 18M2 4Q8 12 6 18', ...stroke(fill, 2.4) }),
    h(Circle, { cx: 0, cy: 1, r: 3.6, fill, stroke: dark, strokeWidth: 1.3 }),
  );
}

// Аксессуар на шее: виден только надетый — платок (scarf), бантик (bow) или клевер (clover).
function collar(p, accessory, P) {
  if (!['scarf', 'bow', 'clover'].includes(accessory)) return null;
  const band = (fill, dark) => [
    h(Path, { key: 'band', d: 'M68 116C82 128 118 128 132 116L133.5 124C118 137 82 137 66.5 124Z', ...outline(fill, dark, 1.5) }),
    h(Path, { key: 'shine', d: 'M86 125Q99 129 112 127', ...stroke('#ffffff', 1.3, { opacity: 0.5 }) }),
  ];
  const scarf = [
    h(Path, { key: 'band', d: SCARF_BAND, ...outline(`url(#${p}-scarf)`, SCARF.dark, 1.5) }),
    h(Path, { key: 'tip', d: SCARF_TIP, ...outline(`url(#${p}-scarf)`, SCARF.dark, 1.5) }),
    h(Path, { key: 'folds', d: 'M90 134Q95.5 142 99.5 150M84 131Q88.5 136 92 140', ...stroke(SCARF.dark, 1.2, { opacity: 0.5 }) }),
    h(Path, { key: 'shine', d: 'M79 128.5Q94 132.5 112 131', ...stroke('#f3b08b', 1.3, { opacity: 0.6 }) }),
    h(Path, { key: 'tails', d: SCARF_TAILS, ...outline(`url(#${p}-scarf)`, SCARF.dark, 1.4) }),
    h(Path, { key: 'knot', d: SCARF_KNOT, ...outline(SCARF.scarf, SCARF.dark, 1.4) }),
  ];
  return h(
    G,
    { transform: tf(move(0, P.collarY), stretchY(P.collarS, 100, 112)) },
    accessory === 'scarf' ? scarf : null,
    accessory === 'bow' ? [...band(`url(#${p}-bow)`, RIBBON.pinkDark), h(G, { key: 'b' }, bow(RIBBON.pink, RIBBON.pinkDark, 100, 128, 1.05))] : null,
    accessory === 'clover'
      ? [
          ...band(`url(#${p}-clover)`, RIBBON.greenDark),
          h(
            G,
            { key: 'c', transform: tf(move(100, 130)) },
            h(Circle, { cx: 0, cy: 0, r: 6.8, fill: '#f7f1e6', stroke: '#8b6f5e', strokeWidth: 1.2 }),
            h(Circle, { cx: -2.6, cy: -1, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
            h(Circle, { cx: 2.6, cy: -1, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
            h(Circle, { cx: 0, cy: -3.6, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
            h(Circle, { cx: 0, cy: 1.8, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
            h(Path, { d: 'M0 2v4', ...stroke('#2f5f33', 1) }),
          ),
        ]
      : null,
  );
}

// Глаз: верхнее веко — дугой по форме глаза с тёмной линией (в покое — над глазом), нижнее — дугой снизу.
const lidUpPath = (cx, y) => `M${cx - 14} ${y - 40}L${cx + 14} ${y - 40}L${cx + 14} ${y + 0.5}L${cx + 9} ${y + 0.5}C${cx + 9} ${y - 12} ${cx - 9} ${y - 12} ${cx - 9} ${y + 0.5}L${cx - 14} ${y + 0.5}Z`;
const lashPath = (cx, y) => `M${cx - 9} ${y + 0.5}C${cx - 9} ${y - 12} ${cx + 9} ${y - 12} ${cx + 9} ${y + 0.5}`;
const lidDownPath = (cx, y) => `M${cx - 14} ${y + 40}L${cx + 14} ${y + 40}L${cx + 14} ${y - 0.5}L${cx + 9} ${y - 0.5}C${cx + 9} ${y + 12} ${cx - 9} ${y + 12} ${cx - 9} ${y - 0.5}L${cx - 14} ${y - 0.5}Z`;

function eye(p, s, c, P) {
  const cx = EYES[s];
  const y = EYE_Y;
  return h(
    G,
    null,
    h(
      G,
      { clipPath: `url(#${p}-eye-${s})` },
      h(Ellipse, { cx, cy: y, rx: EYE_RX, ry: EYE_RY, fill: `url(#${p}-iris)` }),
      h(Ellipse, { cx, cy: y, rx: EYE_RX, ry: EYE_RY, fill: 'none', stroke: '#24130a', strokeWidth: 2.4, opacity: 0.85 }),
      h(G, { transform: tf(move(P.lookX, P.lookY)) }, h(Ellipse, { cx, cy: y - 0.4, rx: 3.9, ry: 4.7, fill: '#160b05', transform: tf(grow(P.pupil, P.pupil, cx, y - 0.4)) })),
      h(Circle, { cx: cx + 2.4, cy: y - 3.4, r: 2.6, fill: '#fff' }),
      h(Circle, { cx: cx - 2.6, cy: y + 3.6, r: 1.1, fill: '#fff', opacity: 0.85 }),
      h(G, { transform: tf(move(0, P.lidDown)) }, h(Path, { d: lidDownPath(cx, y), fill: c.lid })),
      h(G, { transform: tf(move(0, P.lidUp)) }, h(Path, { d: lidUpPath(cx, y), fill: c.lid }), h(Path, { d: lashPath(cx, y), ...stroke(c.eyeLine, 3) })),
    ),
    P.happy ? h(Path, { d: `M${cx - 7.5} ${y + 2}Q${cx} ${y - 6.5} ${cx + 7.5} ${y + 2}`, ...stroke(c.eyeLine, 2.6, { opacity: P.happy }) }) : null,
    P.sleep ? h(Path, { d: `M${cx - 7.5} ${y}Q${cx} ${y + 6.5} ${cx + 7.5} ${y}`, ...stroke(c.eyeLine, 2.4, { opacity: P.sleep }) }) : null,
  );
}

function ear(p, s, c, P) {
  const l = s === 'l';
  return h(
    G,
    { transform: tf(turn(l ? P.earL : P.earR, l ? 79 : 121, 63)) },
    h(Path, { d: side(EAR_L, l), ...outline(`url(#${p}-ear-out)`, c.earLine, 1.8) }),
    h(Path, { d: side(EAR_IN_L, l), fill: `url(#${p}-ear)` }),
    h(Path, { d: side(EAR_FUR_L, l), ...stroke(c.tuft, 1.3, { opacity: 0.8 }) }),
  );
}

// Брови — едва заметные дуги над глазами: подъём и наклон по позе.
function brow(s, c, P) {
  const l = s === 'l';
  return h(G, { transform: tf(move(0, P.browY), turn(l ? P.browL : P.browR, l ? 81 : 119, 73)) }, h(Path, { d: side(BROW_L, l), ...stroke(c.brow, 1.9, { opacity: 0.8 }) }));
}

function mouth(kind, c) {
  const line = { fill: 'none', stroke: c.eyeLine, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'smile') return h(G, null, h(Path, { d: 'M95 108.5Q100 115 105 108.5Q100 110.6 95 108.5Z', fill: '#8a3f45' }), h(Path, { d: 'M100 105.6V108M92.5 108Q96.5 113 100 108.3Q103.5 113 107.5 108', ...line }));
  if (kind === 'yawn')
    return h(
      G,
      null,
      h(Path, { d: 'M93.5 108Q100 104.8 106.5 108Q109 119 100 121.5Q91 119 93.5 108Z', fill: '#5b2a31', stroke: c.eyeLine, strokeWidth: 1.3 }),
      h(Path, { d: 'M95.5 116Q100 113 104.5 116Q103 120 100 120.4Q97 120 95.5 116Z', fill: '#d77b80' }),
    );
  return h(G, null, h(Path, { d: 'M100 105.6V107.6M93.5 108.2Q96.8 111.8 100 107.6Q103.2 111.8 106.5 108.2', ...line }));
}

// Пушистая щека или хохолок: заливка замкнутого контура тем же градиентом закрывает обводку головы под пучком, обводятся
// только наружные зубцы.
const fluff = (p, c, fillD, edgeD, width) => [h(Path, { key: 'fill', d: fillD, fill: `url(#${p}-head)` }), h(Path, { key: 'edge', d: edgeD, ...stroke(c.line, width, { strokeLinejoin: 'round' }) })];

function head(p, c, P) {
  return h(
    G,
    { transform: tf(move(P.headX, P.headY), turn(P.headR, 100, 118)) },
    ear(p, 'l', c, P),
    ear(p, 'r', c, P),
    h(Path, { d: SKULL, ...outline(`url(#${p}-head)`, c.line, 1.9) }),
    h(G, { key: 'cheek-l' }, ...fluff(p, c, CHEEK_FILL_L, CHEEK_EDGE_L, 1.8)),
    h(G, { key: 'cheek-r' }, ...fluff(p, c, mirror(CHEEK_FILL_L), mirror(CHEEK_EDGE_L), 1.8)),
    h(Path, { d: 'M135.5 72C138.5 79 139.8 86 139.5 92M64.5 72C61.5 79 60.2 86 60.5 92', ...stroke(c.sheen, 2, { opacity: 0.55 }) }),
    c.marks === 'patch' ? h(Path, { d: EYE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: MUZZLE, fill: `url(#${p}-cream)` }),
    h(G, null, ...fluff(p, c, `${TUFT_EDGE}Z`, TUFT_EDGE, 1.6), h(Path, { d: 'M95 52Q96.5 49 97.5 47.5M101.5 50Q102.5 47 103.5 45.5', ...stroke(c.smoke, 1, { opacity: 0.8 }) })),
    brow('l', c, P),
    brow('r', c, P),
    eye(p, 'l', c, P),
    eye(p, 'r', c, P),
    h(Ellipse, { cx: 70.5, cy: 103.5, rx: 6.5, ry: 4.5, fill: c.blush, opacity: 0.35 }),
    h(Ellipse, { cx: 129.5, cy: 103.5, rx: 6.5, ry: 4.5, fill: c.blush, opacity: 0.35 }),
    h(Path, { d: 'M95.5 99.5Q100 97.6 104.5 99.5Q104 103.8 100 105.6Q96 103.8 95.5 99.5Z', ...outline(c.nose, c.noseLine, 1) }),
    h(Path, { d: 'M97.6 100.1Q100 99.4 102.4 100.1', ...stroke('#ffffff', 0.9, { opacity: 0.6 }) }),
    mouth(P.mouth, c),
    h(Path, { d: `${WHISKERS_L}${mirror(WHISKERS_L)}`, ...stroke(c.whisker, 0.85, { opacity: 0.5 }) }),
  );
}

// Рисунок кролика: поза, облик (неизвестный — палевый, как веб), надетый аксессуар; toward — сторона предмета; prefix —
// префикс id градиентов экземпляра; room — рисунок в сцене комнаты уголка ({ feed } — сдвиг к миске, своей миски нет).
// Только элементы — корневой <Svg viewBox="0 0 220 204"> ставит отображение.
function BunnyFigure({ pose = 'calm', coat = 'fawn', accessory = 'scarf', toward = '', prefix = '', room = null } = {}) {
  const c = Object.hasOwn(COATS, coat) ? COATS[coat] : COATS.fawn;
  const p = idPrefix(prefix, 'bunny');
  const P = params(pose, toward);
  const [x, y] = bodyShift(P, pose, room);
  return h(
    G,
    null,
    defs(p, c),
    h(Ellipse, { cx: 100, cy: 189, rx: 64, ry: 7, fill: `url(#${p}-ground)` }),
    h(
      G,
      { transform: tf(move(x, y)) },
      P.lie ? lyingBody(p, c) : null,
      P.sit ? sittingBody(p, c, P) : null,
      collar(p, accessory, P),
      head(p, c, P),
      P.lie ? lyingFront(p, c) : null,
      // «Умывается»: капли у мордочки.
      P.wash ? h(G, { key: 'wash', fill: '#9cc5e8', opacity: 0.9 }, h(Circle, { cx: 70, cy: 96, r: 1.8 }), h(Circle, { cx: 64, cy: 106, r: 1.3 }), h(Circle, { cx: 76, cy: 89, r: 1.2 })) : null,
    ),
    P.bowl && !room ? bowl(P.bowl === 'full') : null,
  );
}

// Свои вещи кролика в уголке (bunny-art.mjs, carrotArt и hayArt): морковка — сразу, пучок сена — со ступени «Наш ритуал»;
// единицы сцены 400×250, исходные места (40, 232) и (280, 236).
function BunnyItem({ id } = {}) {
  if (id === 'carrot') {
    return h(
      G,
      null,
      h(Ellipse, { cx: 40, cy: 241, rx: 18, ry: 2.4, fill: '#3a2414', opacity: 0.16 }),
      h(Path, { d: 'M22 233q2-7 11-7l24 4.5q2.5 2 0 4l-24 4.5q-9 0-11-6z', ...outline('#ec8b36', '#b3601d', 1.6) }),
      h(Path, { d: 'M31 229.5l2.2 7M39.5 228.5l1.3 8.5M47 230l1.2 5', ...stroke('#c96f25', 1.2) }),
      h(Path, { d: 'M26 230.5q6-1 12 1', ...stroke('#f6b06c', 1.4, { opacity: 0.8 }) }),
      h(Path, { d: 'M57 232.5q6-9 11-7M57 232.5q9-2 11 4M57 232.5q4 7 9 9', ...stroke('#4f9a55', 2.6) }),
    );
  }
  if (id === 'hay') {
    return h(
      G,
      null,
      h(Ellipse, { cx: 280, cy: 242, rx: 21, ry: 2.8, fill: '#3a2414', opacity: 0.18 }),
      h(Path, { d: 'M258 239q-2-13 7-20q6-5 13-2q6-8 13-1q8-3 11 6q6 2 5 9q3 6-3 8z', ...outline('#e2c276', '#a07f2a', 1.8) }),
      h(Path, { d: 'M264 235q8-9 19-10M270 239q9-6 20-5M280 224q7 1 11 7M260 231q6-1 9 3', ...stroke('#b8942f', 1.4, { opacity: 0.85 }) }),
      h(Path, { d: 'M266 226l-5-6M289 221l3-7M298 229l6-3M274 221l-2-7', ...stroke('#c9a84a', 1.6) }),
    );
  }
  return h(G, null);
}

// Набор: все позы словаря, включая лапку (поднятая левая лапа), кроме settle (устроился — вход legacy-отображения, нативу
// не нужен: явная замена — content); ресурсы уголка — рисунок в комнате (room), морковка и сено; ресурсы игры — рисунок
// совпадает с областями play определения кролика (play); сценки — hop и wash (ключевые позы, фазы — PetFigure).
export const bunnyNative = Object.freeze({
  pet: 'bunny',
  poses: Object.freeze(['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'feed', 'fed', 'sniff', 'watch', 'ball', 'paw', 'yawn', 'hop', 'wash']),
  substitutes: Object.freeze({ settle: 'content' }),
  coats: Object.freeze(Object.keys(COATS)),
  accessories: Object.freeze(['scarf', 'bow', 'clover']),
  Figure: BunnyFigure,
  room: true,
  items: Object.freeze(['carrot', 'hay']),
  Item: BunnyItem,
  play: true,
  scenes: Object.freeze(['hop', 'wash']),
});
