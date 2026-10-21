// Натив: штатный набор кролика bunnyNative (с 0.4.0; docs/ARCHITECTURE.md § 7.4, § 12.2). Рисунок Пуха веб-набора
// (bunny-art.mjs: высокие уши, хохолок, круглые глаза, зубки, хвост-помпон, ленточка с бантиком) перенесён в элементы
// react-native-svg в тех же единицах 220×204; позы — таблица суставов из bunny.css (веки, уши, голова, взгляд, хвост,
// левая лапка, ленточка, «сидит» / «лежит»), облики — палитры и отметины BUNNY_COATS, надетый аксессуар — одна из трёх
// ленточек. Набор не решает, какую позу показать: Figure получает позу, облик и аксессуар из снимка ядра.

import { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { bodyShift, bowl, grow, h, idPrefix, linear, move, radial, sharedDefs, stretchY, tf, turn } from './svg.mjs';

// Ленточки — общие для всех обликов.
const RIBBON = Object.freeze({ blue: '#6aa7d8', blueLight: '#9cc5e8', blueDark: '#3f6f99', pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' });

// Палитры обликов (bunny-art.mjs, BUNNY_COATS): ear — наружная сторона ушей, marks — отметины (patch — бурые пятна).
const COATS = Object.freeze({
  snow: {
    furLight: '#fdfcfa', fur: '#f1eee8', furDark: '#d8d2c7', line: '#6f6358', headHi: '#ffffff', lid: '#f4f1eb', headEdge: '#dcd6cb', ear: '#f1eee8', earLine: '#6f6358',
    earIn: '#f4bcc6', earDeep: '#e5a0ae', sheen: '#ffffff', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff',
    paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d3cbc0', blush: '#f0a9b2', eyeLine: '#2b2420', lidLine: '#4a403a', patch: '', marks: '',
  },
  grey: {
    furLight: '#cdcac5', fur: '#aeaba6', furDark: '#88847e', line: '#46423d', headHi: '#d6d3ce', lid: '#c2bfba', headEdge: '#8f8b85', ear: '#aeaba6', earLine: '#46423d',
    earIn: '#ebb3bd', earDeep: '#d796a3', sheen: '#e2dfda', cream: '#f4eee5', creamHi: '#fbf7f0', creamShade: '#ddd3c6', bibTop: '#ebe4d9', bibBottom: '#e3dacd', bibSheen: '#fffaf2',
    paw: '#ece6dc', toe: '#a1958a', tuft: '#e8e5e0', tail: '#f4f1ec', tailShade: '#cbc7c1', nose: '#dc93a0', noseLine: '#9e5c68', whisker: '#dedad4', blush: '#d9a0a8', eyeLine: '#1f1b18', lidLine: '#3a3531', patch: '', marks: '',
  },
  spot: {
    furLight: '#fdfcfa', fur: '#f1eee8', furDark: '#d8d2c7', line: '#5f4a3b', headHi: '#ffffff', lid: '#f4f1eb', headEdge: '#dcd6cb', ear: '#8a5a3c', earLine: '#5f4a3b',
    earIn: '#efb1bb', earDeep: '#dd96a3', sheen: '#ffffff', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4', bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff',
    paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4', nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d3cbc0', blush: '#f0a9b2', eyeLine: '#2b2420', lidLine: '#4a403a', patch: '#8a5a3c', marks: 'patch',
  },
});

// Позы — значения суставов bunny.css (переменные --bn-*); не заданное — как у покоя по умолчанию.
const BASE = Object.freeze({
  lidUp: 3, lidDown: 0, earL: 0, earR: 8, headX: 0, headY: 0, headR: 0, lookX: 0, lookY: 0, pupil: 1, happy: 0, sleep: 0, tail: 0, leg: 0,
  collarY: 0, collarS: 1, sitS: 1, sit: 1, lie: 0, allX: 0, allY: 0, mouth: 'calm', bowl: '', wash: 0,
});
const POSES = Object.freeze({
  calm: { lidUp: 1, lidDown: -1, earL: -2, earR: 10 },
  attentive: { lidUp: -1, pupil: 1.08, headR: -4, headY: -2, earL: 4, earR: -4 },
  greet: { lidUp: 24, happy: 1, headY: -3, headR: 4, earL: -8, earR: 14, tail: -6, mouth: 'smile' },
  joy: { lidUp: 24, happy: 1, headY: -3, headR: -4, earL: -12, earR: 18, tail: -8, mouth: 'smile' },
  support: { lidUp: 3, lidDown: -3, headR: -8, earL: -26, earR: 30, lookY: 1 },
  pet: { lidUp: 24, happy: 1, headR: 9, headX: 1, headY: 2, earL: -34, earR: 36, tail: -4 },
  unlock: { lidUp: 0, lookX: -2.6, lookY: 2.6, pupil: 1.1, headR: -9, headY: 2, earL: 6, earR: -2 },
  wait: { lidUp: 3, headR: 3, earL: -6, earR: 12, lookY: 1 },
  rest: { sitS: 0.8, sit: 0, lie: 1, headY: 60, headR: -3, collarY: 55, collarS: 0.7, lidUp: 24, sleep: 1, earL: -62, earR: 66 },
  yawn: { lidUp: 24, sleep: 1, headY: -3, headR: -4, earL: -16, earR: 20, mouth: 'yawn' },
  paw: { leg: -34, lidUp: 1, headR: -7, earL: 2, earR: 2, tail: -5, mouth: 'smile' },
  sniff: { headY: 6, headR: -8, lookX: -2.6, lookY: 2.6, lidUp: 2, earL: 6, earR: -3 },
  watch: { lookX: -2.6, lookY: 1.5, headR: -4, lidUp: 1, earL: 2, earR: 4 },
  ball: { lidUp: -1, lookX: -2.8, lookY: 2.4, pupil: 1.12, headR: -9, earL: 8, earR: -8, tail: -6 },
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

const EYE_Y = 78;
const EYE_R = 8.6;
const EYES = { l: 82, r: 118 };
const SIDE_PATCH = 'M128 134C138 128 154 134 158 146C161 156 152 165 141 163C131 161 124 152 125 143C125.3 139.5 126.3 136.5 128 134Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M44 162C50 156 60 158 62 166C63.5 172 58 177 52 176C46 175 42 169 43 165Z';
const EYE_PATCH = 'M106 64C112 58 126 58 131 66C135 72 134 84 128 89C122 94 110 93 106.5 87C103 81 102.5 69 106 64Z';
const stroke = (color, width, extra = {}) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', ...extra });
const outline = (fill, color, width) => ({ fill, stroke: color, strokeWidth: width, strokeLinejoin: 'round' });

function defs(p, c) {
  return h(
    Defs,
    null,
    linear(`${p}-fur`, { gradientUnits: 'userSpaceOnUse', x1: 60, y1: 100, x2: 150, y2: 192 }, [['0', c.furLight], ['0.55', c.fur], ['1', c.furDark]]),
    radial(`${p}-head`, { gradientUnits: 'userSpaceOnUse', cx: 100, cy: 72, r: 58 }, [['0', c.headHi], ['0.5', c.lid], ['0.85', c.fur], ['1', c.headEdge]]),
    linear(`${p}-ear`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.earDeep], ['1', c.earIn]]),
    linear(`${p}-ear-out`, { x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [['0', c.ear], ['1', c.furDark]]),
    radial(`${p}-cream`, { cx: '50%', cy: '42%', r: '62%' }, [['0', c.creamHi], ['0.7', c.cream], ['1', c.creamShade]]),
    linear(`${p}-bib`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.bibTop], ['0.35', c.cream], ['1', c.bibBottom]]),
    radial(`${p}-tail`, { cx: '40%', cy: '35%', r: '70%' }, [['0', c.tail], ['1', c.tailShade]]),
    radial(`${p}-iris`, { cx: '42%', cy: '38%', r: '70%' }, [['0', '#8f5a2e'], ['0.5', '#4f2c14'], ['1', '#23130a']]),
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
    { transform: tf(turn(P.tail, 152, 162)) },
    h(Path, { d: 'M152 150C160 142 174 143 180 152C185 160 181 171 171 173C162 175 151 170 150 160C149.5 156 150 152.5 152 150Z', ...outline(`url(#${p}-tail)`, c.line, 1.7) }),
    h(Path, { d: 'M158 150q4-5 10-3M174 152q4 4 4 9M156 164q2 5 7 6', ...stroke(c.tailShade, 1.5, { opacity: 0.8 }) }),
  );
}

function leg(p, c, side, P) {
  const l = side === 'l';
  const x = l ? 0 : 20;
  return h(
    G,
    { key: side, transform: tf(l ? turn(P.leg, 92, 158) : '') },
    h(Path, { d: `M${84 + x} 154C${82.5 + x} 164 ${83 + x} 174 ${84 + x} 182L${97 + x} 182C${97 + x} 174 ${97.5 + x} 164 ${99 + x} 156Z`, ...outline(`url(#${p}-fur)`, c.line, 1.7) }),
    h(Path, { d: `M${l ? 95 : 105} 160C${l ? 95 : 105} 165 ${l ? 94.6 : 105.4} 169 ${l ? 94.4 : 105.6} 173`, ...stroke(c.furDark, 1.6, { opacity: 0.45 }) }),
    h(Path, { d: `M${80 + x} 183Q${80 + x} 176 ${90.5 + x} 176Q${101 + x} 176 ${101 + x} 183Q${101 + x} 190.5 ${90.5 + x} 190.5Q${80 + x} 190.5 ${80 + x} 183Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { d: `M${86.5 + x} 184.5v4.5M${90.5 + x} 184v5.5M${94.5 + x} 184.5v4.5`, ...stroke(c.toe, 1.2) }),
  );
}

function foot(c, x) {
  return [
    h(Path, { key: `f${x}`, d: `M${x} 186.5Q${x} 179.5 ${x + 14} 179.5Q${x + 28} 179.5 ${x + 28} 186.5Q${x + 28} 193 ${x + 14} 193Q${x} 193 ${x} 186.5Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { key: `t${x}`, d: `M${x + 9} 187.5v4.2M${x + 14} 187v5.2M${x + 19} 187.5v4.2`, ...stroke(c.toe, 1.2) }),
  ];
}

function sittingBody(p, c, P) {
  return h(
    G,
    { transform: tf(stretchY(P.sitS, 104, 188)) },
    tail(p, c, P),
    h(Path, { d: 'M80 108C66 116 56 132 54 150C44 156 38 170 40 178C41.5 185 48 188 58 188L142 188C152 188 158.5 185 160 178C162 170 156 156 146 150C144 132 134 116 120 108Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    h(Path, { d: 'M38 170C36 158 44 148 56 148C64 148 70 154 70 164C70 176 62 186 50 186C42 186 38 178 38 170ZM182 170C184 158 176 148 164 148C156 148 150 154 150 164C150 176 158 186 170 186C178 186 182 178 182 170Z', ...outline(`url(#${p}-fur)`, c.line, 1.7) }),
    c.patch ? h(Path, { d: SIDE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    c.patch ? h(Path, { d: HIP_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: 'M60 152C68 156 74 166 74 178M140 152C132 156 126 166 126 178', ...stroke(c.furDark, 2, { opacity: 0.45 }) }),
    h(Path, { d: 'M46 162C44 170 46 178 52 183M174 162C176 170 174 178 168 183', ...stroke(c.sheen, 2, { opacity: 0.55 }) }),
    h(Path, { d: 'M84 112C78 124 76 138 79 152Q84 155 86 161Q90 156 94 162Q98 156 100 163Q102 156 106 162Q110 156 114 161Q116 155 121 152C124 138 122 124 116 112Z', fill: `url(#${p}-bib)` }),
    h(Path, { d: 'M90 130q3.5 4 .5 9M110 128q-3.5 4-.5 9M100 140q2 4 0 8', ...stroke(c.bibSheen, 1.4, { opacity: 0.9 }) }),
    h(Ellipse, { cx: 100, cy: 118, rx: 30, ry: 8, fill: '#2a2d33', opacity: 0.14 }),
    foot(c, 38),
    foot(c, 154),
    leg(p, c, 'r', P),
    leg(p, c, 'l', P),
  );
}

// Отдых: распластался — тело низко, задняя лапа вытянута, голова на передних лапах.
function lyingBody(p, c) {
  return h(
    G,
    null,
    h(Path, { d: 'M26 188C22 166 48 142 96 140C140 138 176 150 186 172C190 182 184 188 174 188Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
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
    { transform: tf(move(0, P.collarY), stretchY(P.collarS, 100, 110)) },
    h(Path, { d: 'M66 110C80 123 120 123 134 110L135.5 118.5C120 132 80 132 64.5 118.5Z', ...outline(fill, dark, 1.5) }),
    h(Path, { d: 'M84 118.5Q98 123 112 121', ...stroke('#ffffff', 1.3, { opacity: 0.5 }) }),
    accessory === 'ribbon' ? bow(RIBBON.blue, RIBBON.blueDark, 70, 118, 0.8) : null,
    accessory === 'bow' ? bow(RIBBON.pink, RIBBON.pinkDark, 100, 122, 1.05) : null,
    accessory === 'clover'
      ? h(
          G,
          { transform: tf(move(100, 124)) },
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
      h(Circle, { cx, cy: y, r: EYE_R, fill: 'none', stroke: '#2a160a', strokeWidth: 2.4, opacity: 0.8 }),
      h(G, { transform: tf(move(P.lookX, P.lookY)) }, h(Circle, { cx, cy: y + 0.4, r: 4.4, fill: '#120904', transform: tf(grow(P.pupil, P.pupil, cx, y + 0.4)) })),
      h(Circle, { cx: cx + 2.8, cy: y - 3.4, r: 2.6, fill: '#fff' }),
      h(Circle, { cx: cx - 2.8, cy: y + 3.2, r: 1.1, fill: '#fff', opacity: 0.8 }),
      h(
        G,
        { transform: tf(move(0, P.lidDown)) },
        h(Path, { d: `M${cx - 12} ${y + 10}Q${cx} ${y + 5.5} ${cx + 12} ${y + 10}L${cx + 12} ${y + 28}L${cx - 12} ${y + 28}Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 7.5} ${y + 8.4}Q${cx} ${y + 5.5} ${cx + 7.5} ${y + 8.4}`, ...stroke(c.lidLine, 1.2, { opacity: 0.5 }) }),
      ),
      h(
        G,
        { transform: tf(move(0, P.lidUp)) },
        h(Path, { d: `M${cx - 12} ${y - 34}L${cx + 12} ${y - 34}L${cx + 12} ${y - 9}Q${cx} ${y - 4.6} ${cx - 12} ${y - 9}Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 12} ${y - 9}Q${cx} ${y - 4.6} ${cx + 12} ${y - 9}`, fill: 'none', stroke: c.eyeLine, strokeWidth: 1.8 }),
      ),
    ),
    P.happy ? h(Path, { d: `M${cx - 8.4} ${y + 2.2}Q${cx} ${y - 7} ${cx + 8.4} ${y + 2.2}`, ...stroke(c.eyeLine, 2.5, { opacity: P.happy }) }) : null,
    P.sleep ? h(Path, { d: `M${cx - 8} ${y + 0.5}Q${cx} ${y + 7} ${cx + 8} ${y + 0.5}`, ...stroke(c.eyeLine, 2.3, { opacity: P.sleep }) }) : null,
  );
}

function ear(p, side, c, P) {
  const l = side === 'l';
  const outer = l ? 'M76 60C66 44 64 20 72 8C78-1 88 2 92 14C96 26 96 44 92 60Z' : 'M144 60C154 44 156 20 148 8C142-1 132 2 128 14C124 26 124 44 128 60Z';
  const inner = l ? 'M80 56C73 42 72 22 77 13C80 8 86 10 88 18C91 30 90 44 88 56Z' : 'M140 56C147 42 148 22 143 13C140 8 134 10 132 18C129 30 130 44 132 56Z';
  const lines = l ? 'M74 36Q74 24 78 15M70 44Q69 34 71 26' : 'M146 36Q146 24 142 15M150 44Q151 34 149 26';
  return h(
    G,
    { transform: tf(turn(l ? P.earL : P.earR, l ? 84 : 136, 58)) },
    h(Path, { d: outer, ...outline(`url(#${p}-ear-out)`, c.earLine, 1.8) }),
    h(Path, { d: inner, fill: `url(#${p}-ear)` }),
    h(Path, { d: lines, ...stroke(c.tuft, 1.2, { opacity: 0.7 }) }),
  );
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
      h(Path, { d: 'M94.5 109.5Q100 117 105.5 109.5Q100 111.8 94.5 109.5Z', fill: '#8a3f45' }),
      h(Path, { d: 'M100 104.5V108.5M92 109Q96 114.5 100 109.2Q104 114.5 108 109', ...line }),
      ...teeth(110.2),
    );
  if (kind === 'yawn')
    return h(
      G,
      null,
      h(Path, { d: 'M93 108Q100 104.5 107 108Q109.5 119 100 122Q90.5 119 93 108Z', fill: '#5b2a31', stroke: '#4a4045', strokeWidth: 1.3 }),
      h(Path, { d: 'M95.2 116.5Q100 113.5 104.8 116.5Q103 120.8 100 121.1Q97 120.8 95.2 116.5Z', fill: '#d77b80' }),
      h(Path, { d: 'M97 108.6h6v3.4q-3 1.2-6 0z', fill: '#ffffff' }),
    );
  return h(G, null, h(Path, { d: 'M100 104.5V108M93.5 110Q97 113 100 108Q103 113 106.5 110', ...line }), ...teeth(110.6));
}

function head(p, c, P) {
  return h(
    G,
    { transform: tf(move(P.headX, P.headY), turn(P.headR, 100, 116)) },
    ear(p, 'l', c, P),
    ear(p, 'r', c, P),
    h(Path, {
      d: 'M100 46C124 46 142 60 144 82C145 98 136 114 118 120C112 122 106 123 100 123C94 123 88 122 82 120C64 114 55 98 56 82C58 60 76 46 100 46Z',
      ...outline(`url(#${p}-head)`, c.line, 1.8),
    }),
    h(Path, { d: 'M140 72C142 80 142 88 140 96M60 72C58 80 58 88 60 96', ...stroke(c.sheen, 2, { opacity: 0.55 }) }),
    c.marks === 'patch' ? h(Path, { d: EYE_PATCH, fill: c.patch, opacity: 0.9 }) : null,
    h(Path, { d: 'M86 96C91 91 96 93 100 97C104 93 109 91 114 96C124 102 122 116 110 119C105 120.5 95 120.5 90 119C78 116 76 102 86 96Z', fill: `url(#${p}-cream)` }),
    h(
      G,
      null,
      h(Path, { d: 'M93 50C94 42 99 38 106 40C103 42 101 45 101.5 49C99 46 96 48 95 53Z', ...outline(`url(#${p}-head)`, c.line, 1.3) }),
      h(Path, { d: 'M96 48Q98 43 102 42', ...stroke(c.tuft, 1, { opacity: 0.85 }) }),
    ),
    eye(p, 'l', c, P),
    eye(p, 'r', c, P),
    h(Circle, { cx: 74, cy: 100, r: 6.5, fill: c.blush, opacity: 0.42 }),
    h(Circle, { cx: 126, cy: 100, r: 6.5, fill: c.blush, opacity: 0.42 }),
    h(Path, { d: 'M95.5 97.5Q100 95.5 104.5 97.5Q104 102.5 100 104.5Q96 102.5 95.5 97.5Z', ...outline(c.nose, c.noseLine, 1) }),
    h(Path, { d: 'M97.6 98.2Q100 97.5 102.4 98.2', ...stroke('#ffffff', 0.9, { opacity: 0.55 }) }),
    mouth(P.mouth),
    h(Path, { d: 'M86 102Q68 96 46 97M86 105Q66 104 44 107M87 108Q68 111 48 117M114 102Q132 96 154 97M114 105Q134 104 156 107M113 108Q132 111 152 117', ...stroke(c.whisker, 0.95, { opacity: 0.95 }) }),
  );
}

// Рисунок кролика: поза, облик (неизвестный — белый, как веб), надетый аксессуар; toward — сторона предмета; prefix —
// префикс id градиентов экземпляра; room — рисунок в сцене комнаты уголка ({ feed } — сдвиг к миске, своей миски нет).
// Только элементы — корневой <Svg viewBox="0 0 220 204"> ставит отображение.
function BunnyFigure({ pose = 'calm', coat = 'snow', accessory = 'ribbon', toward = '', prefix = '', room = null } = {}) {
  const c = Object.hasOwn(COATS, coat) ? COATS[coat] : COATS.snow;
  const p = idPrefix(prefix, 'bunny');
  const P = params(pose, toward);
  const [x, y] = bodyShift(P, pose, room);
  return h(
    G,
    null,
    defs(p, c),
    h(Ellipse, { cx: 104, cy: 189, rx: 74, ry: 7.5, fill: `url(#${p}-ground)` }),
    h(
      G,
      { transform: tf(move(x, y)) },
      P.lie ? lyingBody(p, c) : null,
      P.sit ? sittingBody(p, c, P) : null,
      collar(p, accessory, P),
      head(p, c, P),
      P.lie ? lyingFront(p, c) : null,
      // «Умывается»: капли у мордочки.
      P.wash ? h(G, { key: 'wash', fill: '#9cc5e8', opacity: 0.9 }, h(Circle, { cx: 70, cy: 90, r: 1.8 }), h(Circle, { cx: 64, cy: 100, r: 1.3 }), h(Circle, { cx: 76, cy: 83, r: 1.2 })) : null,
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
