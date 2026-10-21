// Натив: штатный набор кролика bunnyNative (с 0.4.0; docs/ARCHITECTURE.md § 7.4, § 12.2). Рисунок Пуха веб-набора
// (bunny-art.mjs: высокие уши, чёлка, пухлые щёки, круглые глаза с бровями, зубки, хвост-помпон, ленточка с бантиком)
// перенесён в элементы react-native-svg в тех же единицах 220×204; позы — таблица суставов из bunny.css (веки, уши, брови,
// голова, взгляд, хвост, левая лапка, ленточка, «сидит» / «лежит»), облики — палитры и отметины BUNNY_COATS, надетый
// аксессуар — одна из трёх ленточек. Набор не решает, какую позу показать: Figure получает позу, облик и аксессуар из снимка.

import { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { bodyShift, bowl, grow, h, idPrefix, linear, move, radial, sharedDefs, stretchY, tf, turn } from './svg.mjs';

// Ленточки — общие для всех обликов.
const RIBBON = Object.freeze({ blue: '#6aa7d8', blueLight: '#9cc5e8', blueDark: '#3f6f99', pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' });

// Палитры обликов (bunny-art.mjs, BUNNY_COATS): smoke — тёмные штрихи меха, ear — наружная сторона ушей, marks — отметины.
const COATS = Object.freeze({
  fawn: {
    furLight: '#f6e0bd', fur: '#e4c293', furDark: '#c49c66', line: '#6a4a2c', headHi: '#faeacf', lid: '#eed4a8', headEdge: '#cfa771', ear: '#e4c293', earLine: '#6a4a2c',
    earIn: '#f4bcc3', earDeep: '#e3a0ab', smoke: '#b58a56', sheen: '#fdf1e0', sheenSoft: '#f4e2c5', cream: '#fff7ea', creamHi: '#fffdf8', creamShade: '#efdfc4', bibTop: '#f9eedd', bibBottom: '#f3e3cb', bibSheen: '#fffaf2',
    paw: '#f9ecd8', toe: '#b79a76', tuft: '#fff5e3', tail: '#fff7ec', tailShade: '#e8d2b2', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#eadfca', blush: '#f0a39f', brow: '#a67f4e', eyeLine: '#2b2420', lidLine: '#7d5c38', patch: '', marks: '',
  },
  snow: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', line: '#6b6358', headHi: '#ffffff', lid: '#f3efe8', headEdge: '#d8d1c5', ear: '#f0ece5', earLine: '#6b6358',
    earIn: '#f4bcc6', earDeep: '#e5a0ae', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff',
    paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d9d1c4', blush: '#f0a9b2', brow: '#b3a893', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '', marks: '',
  },
  spot: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', line: '#5f4a3b', headHi: '#ffffff', lid: '#f3efe8', headEdge: '#d8d1c5', ear: '#8a5a3c', earLine: '#5f4a3b',
    earIn: '#efb1bb', earDeep: '#dd96a3', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff',
    paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d9d1c4', blush: '#f0a9b2', brow: '#8a5a3c', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '#8a5a3c', marks: 'patch',
  },
});

// Позы — значения суставов bunny.css (переменные --bn-*); не заданное — как у покоя по умолчанию.
const BASE = Object.freeze({
  lidUp: 3, lidDown: 0, earL: 0, earR: 8, headX: 0, headY: 0, headR: 0, lookX: 0, lookY: 0, pupil: 1, happy: 0, sleep: 0, browY: 0, browL: 0, browR: 0, tail: 0, leg: 0,
  collarY: 0, collarS: 1, sitS: 1, sit: 1, lie: 0, allX: 0, allY: 0, mouth: 'calm', bowl: '', wash: 0,
});
const POSES = Object.freeze({
  calm: { lidUp: 1, lidDown: -1, earL: -2, earR: 10 },
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

const EYE_Y = 82;
const EYE_R = 9.6;
const EYES = { l: 80, r: 120 };
const SIDE_PATCH = 'M126 136C136 130 152 136 156 148C159 158 150 167 139 165C129 163 122 154 123 145C123.3 141.5 124.3 138.5 126 136Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M48 162C54 156 64 158 66 166C67.5 172 62 177 56 176C50 175 46 169 47 165Z';
const EYE_PATCH = 'M107 67C113 60 128 60 133 69C137 75 136 88 130 93C124 98 111 97 107.5 91C103.5 85 103 72 107 67Z';
const stroke = (color, width, extra = {}) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', ...extra });
const outline = (fill, color, width) => ({ fill, stroke: color, strokeWidth: width, strokeLinejoin: 'round' });

function defs(p, c) {
  return h(
    Defs,
    null,
    linear(`${p}-fur`, { gradientUnits: 'userSpaceOnUse', x1: 60, y1: 104, x2: 150, y2: 192 }, [['0', c.furLight], ['0.5', c.fur], ['1', c.furDark]]),
    radial(`${p}-head`, { gradientUnits: 'userSpaceOnUse', cx: 100, cy: 74, r: 60 }, [['0', c.headHi], ['0.45', c.lid], ['0.8', c.fur], ['1', c.headEdge]]),
    linear(`${p}-ear`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.earDeep], ['1', c.earIn]]),
    linear(`${p}-ear-out`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', c.ear], ['1', c.furDark]]),
    radial(`${p}-cream`, { cx: '50%', cy: '42%', r: '62%' }, [['0', c.creamHi], ['0.7', c.cream], ['1', c.creamShade]]),
    linear(`${p}-bib`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.bibTop], ['0.35', c.cream], ['1', c.bibBottom]]),
    radial(`${p}-tail`, { cx: '40%', cy: '35%', r: '70%' }, [['0', c.tail], ['1', c.tailShade]]),
    radial(`${p}-iris`, { cx: '42%', cy: '38%', r: '70%' }, [['0', '#b8743a'], ['0.5', '#6a3a16'], ['1', '#2d170a']]),
    linear(`${p}-ribbon`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', RIBBON.blueLight], ['0.55', RIBBON.blue], ['1', RIBBON.blueDark]]),
    linear(`${p}-bow`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', RIBBON.pinkLight], ['0.55', RIBBON.pink], ['1', RIBBON.pinkDark]]),
    linear(`${p}-clover`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', RIBBON.greenLight], ['0.55', RIBBON.green], ['1', RIBBON.greenDark]]),
    ...sharedDefs(p),
    h(ClipPath, { id: `${p}-eye-l` }, h(Circle, { cx: EYES.l, cy: EYE_Y, r: EYE_R })),
    h(ClipPath, { id: `${p}-eye-r` }, h(Circle, { cx: EYES.r, cy: EYE_Y, r: EYE_R })),
  );
}

// Хвост-помпон за правым бедром; покачивание — поворот у основания.
function tail(p, c, P) {
  return h(
    G,
    { transform: tf(turn(P.tail, 150, 164)) },
    h(Path, { d: 'M150 152C157 143 171 143 177 151C182 158 179 169 169 171C160 173 150 168 149 159C148.8 156 149.3 153.5 150 152Z', ...outline(`url(#${p}-tail)`, c.line, 1.7) }),
    h(Path, { d: 'M156 151q4-4 9-2M171 152q4 4 4 8M155 163q2 4 6 5', ...stroke(c.tailShade, 1.5, { opacity: 0.8 }) }),
  );
}

function leg(p, c, side, P) {
  const l = side === 'l';
  const x = l ? 0 : 19;
  return h(
    G,
    { key: side, transform: tf(l ? turn(P.leg, 92, 162) : '') },
    h(Path, { d: `M${85 + x} 152C${83.5 + x} 162 ${84 + x} 172 ${85 + x} 182L${98 + x} 182C${98 + x} 172 ${98.5 + x} 162 ${99.5 + x} 154Z`, ...outline(`url(#${p}-fur)`, c.line, 1.7) }),
    h(Path, { d: `M${l ? 95.5 : 104.5} 163C${l ? 95.5 : 104.5} 167 ${l ? 95.2 : 104.8} 170 ${l ? 95 : 105} 174`, ...stroke(c.furDark, 1.6, { opacity: 0.45 }) }),
    h(Path, { d: `M${81.5 + x} 184Q${81.5 + x} 177 ${91.5 + x} 177Q${101.5 + x} 177 ${101.5 + x} 184Q${101.5 + x} 191 ${91.5 + x} 191Q${81.5 + x} 191 ${81.5 + x} 184Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { d: `M${87.5 + x} 185.5v4.2M${91.5 + x} 185v5M${95.5 + x} 185.5v4.2`, ...stroke(c.toe, 1.2) }),
  );
}

function foot(c, x) {
  return [
    h(Path, { key: `f${x}`, d: `M${x} 187Q${x} 180 ${x + 14} 180Q${x + 28} 180 ${x + 28} 187Q${x + 28} 193.5 ${x + 14} 193.5Q${x} 193.5 ${x} 187Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { key: `t${x}`, d: `M${x + 9} 188v4.2M${x + 14} 187.5v5.2M${x + 19} 188v4.2`, ...stroke(c.toe, 1.2) }),
  ];
}

function sittingBody(p, c, P) {
  return h(
    G,
    { transform: tf(stretchY(P.sitS, 102, 188)) },
    tail(p, c, P),
    h(Path, { d: 'M82 112C66 120 56 136 54 152C42 157 34 172 40 182C44 187 52 188 62 188L138 188C148 188 156 187 160 182C166 172 158 157 146 152C144 136 134 120 118 112Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.patch ? h(Path, { d: SIDE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    c.patch ? h(Path, { d: HIP_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: 'M56 154C66 158 72 168 73 180M144 154C134 158 128 168 127 180', ...stroke(c.furDark, 2, { opacity: 0.45 }) }),
    h(Path, { d: 'M46 166C44 173 46 180 52 185M60 128Q56 134 56 140M174 166C176 173 174 180 168 185', ...stroke(c.sheen, 2, { opacity: 0.6 }) }),
    h(Path, { d: 'M48 176q3-6 9-7M51 182q3-4 7-5M152 176q-3-6-9-7M149 182q-3-4-7-5', ...stroke(c.sheenSoft, 1.4, { opacity: 0.6 }) }),
    foot(c, 42),
    foot(c, 130),
    leg(p, c, 'r', P),
    leg(p, c, 'l', P),
    h(Path, { d: 'M86 116C80 128 78 142 80 156Q85 158 88 164Q92 159 96 165Q100 159 104 165Q108 159 112 164Q115 158 120 156C122 142 120 128 114 116Z', fill: `url(#${p}-bib)` }),
    h(Path, { d: 'M91 132q3.5 4 .5 9M109 130q-3.5 4-.5 9M100 142q2 4 0 8', ...stroke(c.bibSheen, 1.4, { opacity: 0.9 }) }),
    h(Ellipse, { cx: 100, cy: 121, rx: 31, ry: 8, fill: '#2a2d33', opacity: 0.14 }),
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
    h(Path, { key: `t${x}`, d: `M${x + 7} 187.5v3.8M${x + 11} 187v4.6M${x + 15} 187.5v3.8`, ...stroke(c.toe, 1.2) }),
  ];
  return h(
    G,
    null,
    h(Path, { d: 'M150 176C166 174 186 176 196 182C201 186 198 192 190 192Q166 192 146 189Z', ...outline(`url(#${p}-fur)`, c.line, 1.6) }),
    h(Path, { d: 'M176 183v6M183 183.5v6M190 184.5v5', ...stroke(c.toe, 1.2) }),
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

// Ленточка на шее: виден только надетый аксессуар (ribbon, bow или clover).
function collar(p, accessory, P) {
  const kinds = { ribbon: [`url(#${p}-ribbon)`, RIBBON.blueDark], bow: [`url(#${p}-bow)`, RIBBON.pinkDark], clover: [`url(#${p}-clover)`, RIBBON.greenDark] };
  if (!Object.hasOwn(kinds, accessory)) return null;
  const [fill, dark] = kinds[accessory];
  return h(
    G,
    { transform: tf(move(0, P.collarY), stretchY(P.collarS, 100, 112)) },
    h(Path, { d: 'M68 112C82 125 118 125 132 112L133.5 120.5C118 134 82 134 66.5 120.5Z', ...outline(fill, dark, 1.5) }),
    h(Path, { d: 'M86 120.5Q99 125 112 123', ...stroke('#ffffff', 1.3, { opacity: 0.5 }) }),
    accessory === 'ribbon' ? bow(RIBBON.blue, RIBBON.blueDark, 72, 120, 0.8) : null,
    accessory === 'bow' ? bow(RIBBON.pink, RIBBON.pinkDark, 100, 124, 1.05) : null,
    accessory === 'clover'
      ? h(
          G,
          { transform: tf(move(100, 126)) },
          h(Circle, { cx: 0, cy: 0, r: 6.8, fill: '#f7f1e6', stroke: '#8b6f5e', strokeWidth: 1.2 }),
          h(Circle, { cx: -2.6, cy: -1, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
          h(Circle, { cx: 2.6, cy: -1, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
          h(Circle, { cx: 0, cy: -3.6, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
          h(Circle, { cx: 0, cy: 1.8, r: 2.3, fill: '#4f9a55', stroke: '#2f5f33', strokeWidth: 0.8 }),
          h(Path, { d: 'M0 2v4', ...stroke('#2f5f33', 1) }),
        )
      : null,
  );
}

function eye(p, side, c, P) {
  const cx = EYES[side];
  const y = EYE_Y;
  return h(
    G,
    null,
    h(
      G,
      { clipPath: `url(#${p}-eye-${side})` },
      h(Circle, { cx, cy: y, r: EYE_R, fill: `url(#${p}-iris)` }),
      h(Circle, { cx, cy: y, r: EYE_R, fill: 'none', stroke: '#2d170a', strokeWidth: 2.6, opacity: 0.8 }),
      h(G, { transform: tf(move(P.lookX, P.lookY)) }, h(Circle, { cx, cy: y + 0.5, r: 5, fill: '#120904', transform: tf(grow(P.pupil, P.pupil, cx, y + 0.5)) })),
      h(Circle, { cx: cx + 3.2, cy: y - 3.8, r: 2.8, fill: '#fff' }),
      h(Circle, { cx: cx - 3, cy: y + 3.6, r: 1.2, fill: '#fff', opacity: 0.8 }),
      h(
        G,
        { transform: tf(move(0, P.lidDown)) },
        h(Path, { d: `M${cx - 13} ${y + 11}Q${cx} ${y + 6} ${cx + 13} ${y + 11}L${cx + 13} ${y + 30}L${cx - 13} ${y + 30}Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 8} ${y + 9.2}Q${cx} ${y + 6} ${cx + 8} ${y + 9.2}`, ...stroke(c.lidLine, 1.2, { opacity: 0.5 }) }),
      ),
      h(
        G,
        { transform: tf(move(0, P.lidUp)) },
        h(Path, { d: `M${cx - 13} ${y - 36}L${cx + 13} ${y - 36}L${cx + 13} ${y - 9.6}Q${cx} ${y - 5} ${cx - 13} ${y - 9.6}Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 13} ${y - 9.6}Q${cx} ${y - 5} ${cx + 13} ${y - 9.6}`, fill: 'none', stroke: c.eyeLine, strokeWidth: 1.8 }),
      ),
    ),
    P.happy ? h(Path, { d: `M${cx - 9} ${y + 2.5}Q${cx} ${y - 7.5} ${cx + 9} ${y + 2.5}`, ...stroke(c.eyeLine, 2.6, { opacity: P.happy }) }) : null,
    P.sleep ? h(Path, { d: `M${cx - 8.5} ${y + 0.5}Q${cx} ${y + 7.5} ${cx + 8.5} ${y + 0.5}`, ...stroke(c.eyeLine, 2.4, { opacity: P.sleep }) }) : null,
  );
}

function ear(p, side, c, P) {
  const l = side === 'l';
  const outer = l ? 'M74 60C62 44 62 16 73 6C82 -1 93 8 95 26C96 40 93 52 89 61Z' : 'M146 60C158 44 158 16 147 6C138 -1 127 8 125 26C124 40 127 52 131 61Z';
  const inner = l ? 'M79 56C71 42 71 22 78 13C83 8 89 15 89.5 28C90 40 87.5 50 85 56.5Z' : 'M141 56C149 42 149 22 142 13C137 8 131 15 130.5 28C130 40 132.5 50 135 56.5Z';
  const lines = l ? 'M72 40Q71 26 76 14M68 48Q67 38 69 30' : 'M148 40Q149 26 144 14M152 48Q153 38 151 30';
  return h(
    G,
    { transform: tf(turn(l ? P.earL : P.earR, l ? 86 : 134, 58)) },
    h(Path, { d: outer, ...outline(`url(#${p}-ear-out)`, c.earLine, 1.8) }),
    h(Path, { d: inner, fill: `url(#${p}-ear)` }),
    h(Path, { d: lines, ...stroke(c.tuft, 1.2, { opacity: 0.75 }) }),
  );
}

// Брови — дуги над глазами: подъём и наклон по позе.
function brow(side, c, P) {
  const l = side === 'l';
  return h(G, { transform: tf(move(0, P.browY), turn(l ? P.browL : P.browR, l ? 79 : 121, 64)) }, h(Path, { d: l ? 'M70 66Q79 61 88 65' : 'M112 65Q121 61 130 66', ...stroke(c.brow, 2.6, { opacity: 0.65 }) }));
}

const teeth = (y) => [
  h(Path, { key: 'teeth', d: `M97.2 ${y}h5.6v3.5q-2.8 1.3-5.6 0z`, fill: '#ffffff', stroke: '#8a7f80', strokeWidth: 0.8, strokeLinejoin: 'round' }),
  h(Path, { key: 'gap', d: `M100 ${y + 0.2}v3.3`, stroke: '#b9afb0', strokeWidth: 0.8 }),
];

function mouth(kind) {
  const line = { fill: 'none', stroke: '#4a4045', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'smile')
    return h(
      G,
      null,
      h(Path, { d: 'M94 112.5Q100 120 106 112.5Q100 114.8 94 112.5Z', fill: '#8a3f45' }),
      h(Path, { d: 'M100 107.5V111.5M91.5 112Q96 117.5 100 112.2Q104 117.5 108.5 112', ...line }),
      ...teeth(113.2),
    );
  if (kind === 'yawn')
    return h(
      G,
      null,
      h(Path, { d: 'M93 111Q100 107.5 107 111Q109.5 122 100 125Q90.5 122 93 111Z', fill: '#5b2a31', stroke: '#4a4045', strokeWidth: 1.3 }),
      h(Path, { d: 'M95.2 119.5Q100 116.5 104.8 119.5Q103 123.8 100 124.1Q97 123.8 95.2 119.5Z', fill: '#d77b80' }),
      h(Path, { d: 'M97 111.6h6v3.4q-3 1.2-6 0z', fill: '#ffffff' }),
    );
  return h(G, null, h(Path, { d: 'M100 107.5V111M93 113Q97 116 100 111Q103 116 107 113', ...line }), ...teeth(113.6));
}

function head(p, c, P) {
  return h(
    G,
    { transform: tf(move(P.headX, P.headY), turn(P.headR, 100, 118)) },
    ear(p, 'l', c, P),
    ear(p, 'r', c, P),
    h(Path, {
      d: 'M100 44C126 44 144 58 147 80C149 94 144 108 134 116C126 122 114 126 100 126C86 126 74 122 66 116C56 108 51 94 53 80C56 58 74 44 100 44Z',
      ...outline(`url(#${p}-head)`, c.line, 1.8),
    }),
    h(Path, { d: 'M142 70C144 78 145 86 143 94M58 70C56 78 55 86 57 94', ...stroke(c.sheen, 2, { opacity: 0.55 }) }),
    h(Path, { d: 'M62 100q-7 2-11 7M64 108q-6 3-8 8M138 100q7 2 11 7M136 108q6 3 8 8M84 54Q82 59 83 64M116 54Q118 59 117 64', ...stroke(c.smoke, 2.1, { opacity: 0.55 }) }),
    c.marks === 'patch' ? h(Path, { d: EYE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: 'M84 98C90 92 96 94 100 99C104 94 110 92 116 98C126 104 124 118 112 121C106 122.5 94 122.5 88 121C76 118 74 104 84 98Z', fill: `url(#${p}-cream)` }),
    h(
      G,
      null,
      h(Path, { d: 'M88 52C92 42 102 38 112 44C108 44 105 48 105 52C102 46 98 47 96 53C95 47 91 48 88 52Z', ...outline(`url(#${p}-head)`, c.line, 1.2) }),
      h(Path, { d: 'M92 48Q96 43 101 42M98 49Q100 45 104 44', ...stroke(c.tuft, 1, { opacity: 0.85 }) }),
    ),
    brow('l', c, P),
    brow('r', c, P),
    eye(p, 'l', c, P),
    eye(p, 'r', c, P),
    h(Circle, { cx: 70, cy: 104, r: 7, fill: c.blush, opacity: 0.4 }),
    h(Circle, { cx: 130, cy: 104, r: 7, fill: c.blush, opacity: 0.4 }),
    h(Path, { d: 'M95 99.5Q100 97 105 99.5Q104.5 105 100 107.5Q95.5 105 95 99.5Z', ...outline(c.nose, c.noseLine, 1) }),
    h(Path, { d: 'M97.4 100.2Q100 99.4 102.6 100.2', ...stroke('#ffffff', 0.9, { opacity: 0.55 }) }),
    mouth(P.mouth),
    h(Path, { d: 'M85 104Q66 98 44 99M85 107Q64 106 42 109M86 110Q66 113 46 119M115 104Q134 98 156 99M115 107Q136 106 158 109M114 110Q134 113 154 119', ...stroke(c.whisker, 0.95, { opacity: 0.95 }) }),
  );
}

// Рисунок кролика: поза, облик (неизвестный — палевый, как веб), надетый аксессуар; toward — сторона предмета; prefix —
// префикс id градиентов экземпляра; room — рисунок в сцене комнаты уголка ({ feed } — сдвиг к миске, своей миски нет).
// Только элементы — корневой <Svg viewBox="0 0 220 204"> ставит отображение.
function BunnyFigure({ pose = 'calm', coat = 'fawn', accessory = 'ribbon', toward = '', prefix = '', room = null } = {}) {
  const c = Object.hasOwn(COATS, coat) ? COATS[coat] : COATS.fawn;
  const p = idPrefix(prefix, 'bunny');
  const P = params(pose, toward);
  const [x, y] = bodyShift(P, pose, room);
  return h(
    G,
    null,
    defs(p, c),
    h(Ellipse, { cx: 102, cy: 189, rx: 72, ry: 7.5, fill: `url(#${p}-ground)` }),
    h(
      G,
      { transform: tf(move(x, y)) },
      P.lie ? lyingBody(p, c) : null,
      P.sit ? sittingBody(p, c, P) : null,
      collar(p, accessory, P),
      head(p, c, P),
      P.lie ? lyingFront(p, c) : null,
      // «Умывается»: капли у мордочки.
      P.wash ? h(G, { key: 'wash', fill: '#9cc5e8', opacity: 0.9 }, h(Circle, { cx: 70, cy: 92, r: 1.8 }), h(Circle, { cx: 64, cy: 102, r: 1.3 }), h(Circle, { cx: 76, cy: 85, r: 1.2 })) : null,
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
  accessories: Object.freeze(['ribbon', 'bow', 'clover']),
  Figure: BunnyFigure,
  room: true,
  items: Object.freeze(['carrot', 'hay']),
  Item: BunnyItem,
  play: true,
  scenes: Object.freeze(['hop', 'wash']),
});
