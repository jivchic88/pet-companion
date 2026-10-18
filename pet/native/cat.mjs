// Натив: штатный набор кота catNative (этап PL10.1; docs/ARCHITECTURE.md § 7.4, § 12.2). Рисунок Марса веб-набора
// (cat-art.mjs: слоистый кот с чёлкой, янтарно-зелёными глазами и платком) перенесён в элементы react-native-svg в тех
// же единицах 220×204; позы — таблица суставов из pet.css (веки, уши, голова, взгляд, хвост из трёх звеньев, лапы,
// платок, «сидит» / «лежит»), облики — палитры и отметины CAT_COATS, надетый аксессуар — один из трёх платков.
// Набор не решает, какую позу показать: Figure получает позу, облик и аксессуар из снимка ядра.

import { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { badge, bodyShift, bowl, grow, h, idPrefix, linear, move, radial, scarfFill, SCARF, sharedDefs, stretchY, tf, turn } from './svg.mjs';

// Палитры обликов (cat-art.mjs, CAT_COATS): halo и bridge — непрозрачность светлой морды и переносицы, marks — отметины.
const COATS = Object.freeze({
  smoke: {
    furLight: '#b3b7be', fur: '#8f949c', furDark: '#6d727a', furMid: '#80858d', headHi: '#b2b6bc', lid: '#a5a9af', headEdge: '#787d85',
    fringeHi: '#757a82', smoke: '#5c6068', stripe: '#6b7078', line: '#43474f', fringeLine: '#50545b', sheen: '#c6cad0', sheenSoft: '#b9bdc3',
    fringeSheen: '#a7acb3', cream: '#f4eadc', creamHi: '#fbf5ec', creamShade: '#ddcdb8', bibTop: '#e9dccb', bibBottom: '#e6d6c1', bibSheen: '#fffaf2',
    paw: '#e9dfd2', toe: '#a9998a', earDeep: '#d99d92', earIn: '#e7b2a4', tuft: '#f6ece2', nose: '#c97566', noseLine: '#8f4c43', whisker: '#dcd6cd',
    eyeLine: '#25282d', lidLine: '#3a3d43', halo: 0.35, bridge: 0.4, marks: '',
  },
  ginger: {
    furLight: '#f3b878', fur: '#e0954f', furDark: '#c0733a', furMid: '#d48545', headHi: '#f6c690', lid: '#eeac6c', headEdge: '#cc7f42',
    fringeHi: '#d98a48', smoke: '#b5612c', stripe: '#b25e2a', line: '#6e3d1e', fringeLine: '#8a4a22', sheen: '#f8d2a6', sheenSoft: '#f2c290',
    fringeSheen: '#f5c995', cream: '#f7ecdc', creamHi: '#fdf7ee', creamShade: '#e8d2b6', bibTop: '#f0dfc6', bibBottom: '#ebd6b9', bibSheen: '#fffaf2',
    paw: '#f3e3cd', toe: '#b8916b', earDeep: '#e0998b', earIn: '#efb7a8', tuft: '#fbeedd', nose: '#d98276', noseLine: '#9b5144', whisker: '#f6ecdf',
    eyeLine: '#3b2414', lidLine: '#5a3418', halo: 0.35, bridge: 0.5, marks: 'tabby',
  },
  tuxedo: {
    furLight: '#686e79', fur: '#4c515a', furDark: '#34373e', furMid: '#43474f', headHi: '#777d88', lid: '#636872', headEdge: '#3b3e45',
    fringeHi: '#474c54', smoke: '#2c2e34', stripe: '#31343a', line: '#141518', fringeLine: '#141518', sheen: '#8f959f', sheenSoft: '#7a808a',
    fringeSheen: '#7e848e', cream: '#f8f6f2', creamHi: '#ffffff', creamShade: '#dedad3', bibTop: '#ece8e2', bibBottom: '#e4e0d8', bibSheen: '#ffffff',
    paw: '#f4f2ee', toe: '#a8a29a', earDeep: '#c98d86', earIn: '#dca39b', tuft: '#f2efe9', nose: '#d4867c', noseLine: '#8f4c43', whisker: '#f4f1ec',
    eyeLine: '#0f1012', lidLine: '#0f1012', halo: 0.92, bridge: 0, marks: 'blaze',
  },
});
const IRIS = { in: '#e3c95e', out: '#4d8a45' };

// Позы — значения суставов pet.css (переменные --lid-up, --ear-l, --head-r …); не заданное — как у покоя по умолчанию.
const BASE = Object.freeze({
  lidUp: 5, lidDown: 0, earL: 0, earR: 0, headX: 0, headY: 0, headR: 0, lookX: 0, lookY: 0, pupilW: 1, pupilH: 1,
  happy: 0, sleep: 0, purr: 0, t1: 0, t2: 0, t3: 0, paw: 0, pawS: 1, pawR: 0, pawRS: 1, scarfY: 0, scarfS: 1,
  sitS: 1, sit: 1, lie: 0, allX: 0, allY: 0, mouth: 'calm', bowl: '',
});
const POSES = Object.freeze({
  calm: { lidUp: 4, lidDown: -2, earL: -3, earR: 3 },
  attentive: { lidUp: 0, earL: 7, earR: -7, pupilW: 0.9, headY: -2.5, t3: -12 },
  greet: { lidUp: 28, happy: 1, headY: -3, headR: -5, earL: 7, earR: -6, t1: -34, t3: 18, paw: 12, pawS: 0.58 },
  joy: { lidUp: 28, happy: 1, headY: -3, headR: 5, earL: 6, earR: -6, t1: -64, t2: -10, t3: 30, mouth: 'smile' },
  support: { lidUp: 5, lidDown: -4, headR: -7, earL: -10, earR: 9, t2: 16, t3: 26, lookY: 1.5 },
  pet: { lidUp: 28, happy: 1, headR: 9, headX: 1, earL: -13, earR: 10, purr: 1, t2: 8, t3: 14 },
  unlock: { lidUp: 1, lookX: -3.2, lookY: 3, pupilW: 1.35, pupilH: 0.95, headR: -7, headY: 1, earL: 6, earR: -3, t1: -44, t3: 22 },
  wait: { lidUp: 3, headR: 4, earL: -6, earR: 3, lookY: 1 },
  rest: { sitS: 0.8, sit: 0, lie: 1, headY: 64, headR: -4, scarfY: 56, scarfS: 0.7, lidUp: 28, sleep: 1, earL: -14, earR: 12 },
  yawn: { lidUp: 28, sleep: 1, headY: -3, headR: -3, earL: -9, earR: 8, mouth: 'yawn' },
  // Сдвиг к миске меньше веба (−30, +12 в сцене 400×250): в рамке рисунка 220×204 питомец не срезается краем.
  feed: { allX: -20, allY: 10, headX: -2, headY: 46, headR: -10, scarfY: 30, scarfS: 0.85, lidUp: 28, happy: 1, earL: -4, earR: 6, t1: -20, t3: 16, bowl: 'full' },
  fed: { lidUp: 28, happy: 1, headR: 6, headY: -1, earL: -8, earR: 7, purr: 1, t2: 10, t3: 18, mouth: 'smile', bowl: 'empty' },
  content: { lidUp: 8, lidDown: -3, headR: 3, earL: -7, earR: 6, t3: 18, mouth: 'smile' },
  paw: { paw: 5, pawS: 0.84, lidUp: 14, lidDown: -3, headR: -5, earL: -6, earR: 5, t3: 16 },
  sniff: { headY: 5, headR: -8, lookX: -3, lookY: 3, lidUp: 4, earL: 8, earR: -5, t3: 20 },
  watch: { lookX: -3, lookY: 1.5, headR: -4, lidUp: 3, earL: 6, earR: -3 },
  ball: { lidUp: 0, lookX: -3.2, lookY: 2.5, pupilW: 1.3, headR: -6, headY: 1, earL: 8, earR: -6, t3: 26, paw: 8, pawS: 0.86 },
});
// Предмет справа (reaction.toward): взгляд и голова в другую сторону, у мячика тянется правая лапа.
const RIGHT = { lookX: 3, headR: 6, earL: 5, earR: -8 };
const BALL_RIGHT = { paw: 0, pawS: 1, pawR: -8, pawRS: 0.86 };

const params = (pose, toward) => {
  const own = Object.hasOwn(POSES, pose) ? POSES[pose] : POSES.calm;
  const turned = toward === 'right' && ['sniff', 'watch', 'ball'].includes(pose) ? { ...RIGHT, ...(pose === 'ball' ? BALL_RIGHT : {}) } : {};
  return { ...BASE, ...own, ...turned };
};

const EYE_L = 'M68 70.5C69 62.5 74.5 58.5 80.5 58.5C87 58.5 92 63 92 69.5C92 77 86.5 81.5 79.5 81.5C72.5 81.5 67.5 77 68 70.5Z';
const EYE_R = 'M132 70.5C131 62.5 125.5 58.5 119.5 58.5C113 58.5 108 63 108 69.5C108 77 113.5 81.5 120.5 81.5C127.5 81.5 132.5 77 132 70.5Z';
const TAIL = ['M150 181Q166 186 178 180', 'M178 180Q190 172 192 158', 'M192 158Q193.5 147 187 141'];
const TABBY_SIDES = 'M47 156q7-1 12 5M45 166q8-1 13 6M48 176q6 0 10 5M153 156q-7-1-12 5M155 166q-8-1-13 6M152 176q-6 0-10 5M67 116q-5 5-5 12M133 116q5 5 5 12';
const TABBY_HEAD = 'M75.5 50.5Q72.5 56 74 61.5M124.5 50.5Q127.5 56 126 61.5M80 44Q78 47.5 78.6 51.5M120 44Q122 47.5 121.4 51.5';
const BLAZE = 'M100 59.5C102.4 66 104.2 75 108.2 85H91.8C95.8 75 97.6 66 100 59.5Z';
const stroke = (color, width, extra = {}) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', ...extra });
const outline = (fill, color, width) => ({ fill, stroke: color, strokeWidth: width, strokeLinejoin: 'round' });

function defs(p, c) {
  return h(
    Defs,
    null,
    linear(`${p}-fur`, { gradientUnits: 'userSpaceOnUse', x1: 60, y1: 30, x2: 150, y2: 192 }, [['0', c.furLight], ['0.5', c.fur], ['1', c.furDark]]),
    radial(`${p}-head`, { gradientUnits: 'userSpaceOnUse', cx: 100, cy: 66, r: 62 }, [['0', c.headHi], ['0.45', c.lid], ['0.78', c.fur], ['1', c.headEdge]]),
    linear(`${p}-fringe`, { x1: '0%', y1: '0%', x2: '30%', y2: '100%' }, [['0', c.fringeHi], ['1', c.smoke]]),
    radial(`${p}-cream`, { cx: '50%', cy: '42%', r: '62%' }, [['0', c.creamHi], ['0.7', c.cream], ['1', c.creamShade]]),
    linear(`${p}-bib`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.bibTop], ['0.35', c.cream], ['1', c.bibBottom]]),
    radial(`${p}-iris`, { cx: '50%', cy: '58%', r: '62%' }, [['0', IRIS.in], ['0.42', '#a9c25a'], ['0.78', '#5f9a4b'], ['1', IRIS.out]]),
    linear(`${p}-ear`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.earDeep], ['1', c.earIn]]),
    ...sharedDefs(p),
    h(ClipPath, { id: `${p}-eye-l` }, h(Path, { d: EYE_L })),
    h(ClipPath, { id: `${p}-eye-r` }, h(Path, { d: EYE_R })),
  );
}

// Хвост сидящего кота — три звена, повороты t1–t3 вложены (как группы cat-t1 › cat-t2 › cat-t3 веба).
function tailChain(kind, c, P) {
  const line = kind === 'line';
  const widths = line ? [15.5, 14, 12.5] : [12, 10.5, 9];
  const colors = line ? [c.line, c.line, c.line] : [c.fur, c.furMid, c.smoke];
  const seg = (i) => h(Path, { d: TAIL[i], ...stroke(colors[i], widths[i]) });
  const tabby = !line && c.marks === 'tabby';
  return h(
    G,
    { transform: tf(turn(P.t1, 150, 181)) },
    seg(0),
    tabby ? h(Path, { d: 'M164.2 178.6l-.8 8.6', ...stroke(c.stripe, 2.4, { opacity: 0.75 }) }) : null,
    h(
      G,
      { transform: tf(turn(P.t2, 178, 180)) },
      seg(1),
      line ? null : h(Path, { d: 'M184.5 170.5l6.5 3.6', ...stroke(c.stripe, 2.4) }),
      h(G, { transform: tf(turn(P.t3, 192, 158)) }, seg(2), tabby ? h(Path, { d: 'M187.6 151.2l7.4-.6', ...stroke(c.stripe, 2.2, { opacity: 0.75 }) }) : null),
    ),
  );
}

function leg(p, c, P, side) {
  const l = side === 'l';
  const x = l ? 0 : 20;
  const transform = l ? tf(turn(P.paw, 91, 134), stretchY(P.pawS, 91, 134)) : tf(turn(P.pawR, 111, 134), stretchY(P.pawRS, 111, 134));
  return h(
    G,
    { transform },
    h(Path, { d: `M${84 + x} 132C${82.5 + x} 148 ${83.5 + x} 168 ${84.5 + x} 182L${97 + x} 182C${97 + x} 168 ${97.5 + x} 148 ${98.5 + x} 134Z`, ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    h(Path, { d: `M${l ? 95 : 105} 140C${l ? 95 : 105} 156 ${l ? 94.5 : 105.5} 168 ${l ? 94 : 106} 178`, ...stroke(c.furDark, 1.8, { opacity: 0.45 }) }),
    c.marks === 'tabby' ? h(Path, { d: `M${85.5 + x} 147q6 1.6 11.4 0M${85.2 + x} 158q6 1.6 11.6 0M${85 + x} 168.5q6 1.4 11.8 0`, ...stroke(c.stripe, 2.2, { opacity: 0.6 }) }) : null,
    h(Path, { d: `M${80 + x} 183Q${80 + x} 176 ${90.5 + x} 176Q${101 + x} 176 ${101 + x} 183Q${101 + x} 190.5 ${90.5 + x} 190.5Q${80 + x} 190.5 ${80 + x} 183Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { d: `M${86.5 + x} 184.5v4.5M${90.5 + x} 184v5.5M${94.5 + x} 184.5v4.5`, ...stroke(c.toe, 1.2) }),
  );
}

function sittingBody(p, c, P) {
  return h(
    G,
    { transform: tf(stretchY(P.sitS, 104, 188)) },
    h(G, null, tailChain('line', c, P), tailChain('fur', c, P)),
    h(Path, { d: 'M78 98C66 106 60 120 58 136C46 142 40 158 42 172C43 182 50 188 60 188L142 188C152 188 158 182 159 172C161 158 154 142 142 136C140 120 134 106 122 98Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    h(Path, { d: 'M60 150C70 152 77 162 77 177M140 150C130 152 123 162 123 177', ...stroke(c.furDark, 2, { opacity: 0.5 }) }),
    c.marks === 'tabby' ? h(Path, { d: TABBY_SIDES, ...stroke(c.stripe, 2.6, { opacity: 0.7 }) }) : null,
    h(Path, { d: 'M50 160C49 170 52 180 60 185M64 124C61 130 60 136 60 140', ...stroke(c.sheen, 2, { opacity: 0.5 }) }),
    h(Path, { d: 'M51 170q3-7 10-8M54 177q3-5 8-6M149 170q-3-7-10-8M146 177q-3-5-8-6', ...stroke(c.sheenSoft, 1.4, { opacity: 0.55 }) }),
    h(Path, { d: 'M81 102C75 114 73 128 76 140Q80.5 143 83 149Q88 145 92 151Q96 146 100 153Q104 146 108 151Q112 145 117 149Q119.5 143 124 140C127 128 125 114 119 102Z', fill: `url(#${p}-bib)` }),
    h(Path, { d: 'M90 128q3.5 4 .5 9M110 126q-3.5 4-.5 9M100 136q2 4 0 8', ...stroke(c.bibSheen, 1.4, { opacity: 0.9 }) }),
    h(Ellipse, { cx: 100, cy: 114, rx: 33, ry: 9, fill: '#2a2d33', opacity: 0.16 }),
    leg(p, c, P, 'r'),
    leg(p, c, P, 'l'),
  );
}

// Отдых: лежит «буханкой», голова на лапах, хвост обёрнут спереди.
function lyingBody(p, c) {
  return h(
    G,
    null,
    h(Path, { d: 'M28 188C24 164 50 140 96 138C140 136 178 148 188 170C192 182 186 188 176 188Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.marks === 'tabby' ? h(Path, { d: 'M78 142q3.5 6 1.5 12M98 140q3.5 7 1.5 13M118 140q3.5 7 1.5 13M138 143q3 6 1 12M156 150q2 6 0 11', ...stroke(c.stripe, 2.6, { opacity: 0.7 }) }) : null,
    h(Path, { d: 'M58 150C88 140 128 140 160 150', ...stroke(c.sheen, 2.2, { opacity: 0.5 }) }),
    h(Path, { d: 'M150 150C168 156 178 168 178 182', ...stroke(c.furDark, 2, { opacity: 0.5 }) }),
    h(Path, { d: 'M40 166C40 174 44 182 50 186', ...stroke(c.sheen, 2, { opacity: 0.45 }) }),
  );
}

function lyingFront(c) {
  const tail = 'M181 177C192 188 172 193 140 193C112 193 86 193 58 189';
  const paw = (x) => [
    h(Path, { key: `p${x}`, d: `M${x} 186Q${x} 179 ${x + 11} 179Q${x + 22} 179 ${x + 22} 186Q${x + 22} 193 ${x + 11} 193Q${x} 193 ${x} 186Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { key: `t${x}`, d: `M${x + 7} 187.5v3.8M${x + 11} 187v4.6M${x + 15} 187.5v3.8`, ...stroke(c.toe, 1.2) }),
  ];
  return h(
    G,
    null,
    h(
      G,
      null,
      h(Path, { d: tail, ...stroke(c.line, 13.5) }),
      h(Path, { d: tail, ...stroke(c.fur, 10) }),
      c.marks === 'tabby' ? h(Path, { d: 'M152 188.6v9M124 188.4v9.2', ...stroke(c.stripe, 2.4, { opacity: 0.75 }) }) : null,
      h(Path, { d: 'M58 189C64 190.2 70 191 77 191.6', ...stroke(c.smoke, 10) }),
    ),
    paw(78),
    paw(100),
  );
}

// Платок: виден только надетый аксессуар (scarf, plaid или badge).
function scarf(p, accessory, P) {
  if (!['scarf', 'plaid', 'badge'].includes(accessory)) return null;
  const fill = scarfFill(p, accessory);
  const edge = (width) => outline(fill, SCARF.dark, width);
  return h(
    G,
    { transform: tf(move(0, P.scarfY), stretchY(P.scarfS, 100, 104)) },
    h(Path, { d: 'M63 104C80 117 120 117 137 104L138 112.5C120 126 80 126 62 112.5Z', ...edge(1.5) }),
    h(Path, { d: 'M81 116C95 122 110 122 123 114C120 127 113 137 104 143C97 135 88 127 81 116Z', ...edge(1.5) }),
    h(Path, { d: 'M62 115Q55 123 57 132Q63 126 66 117ZM67 117Q68 127 64 136Q72 128 71 116Z', ...edge(1.4) }),
    h(Path, { d: 'M59 109Q66 103 73 109Q75 116 67 118Q59 117 59 109Z', fill, stroke: SCARF.dark, strokeWidth: 1.5 }),
    h(Path, { d: 'M95 122Q100 131 104 139M88 120Q93 126 97 131', ...stroke(SCARF.dark, 1.2, { opacity: 0.55 }) }),
    h(Path, { d: 'M84 118.5Q96 122.5 110 121', ...stroke('#f3b08b', 1.3, { opacity: 0.6 }) }),
    accessory === 'badge' ? badge(99.5, 122, 7, 107, 131) : null,
  );
}

function eye(p, side, c, P) {
  const left = side === 'l';
  const d = left ? EYE_L : EYE_R;
  const cx = left ? 80 : 120;
  const hl = left ? [84.5, 64.5, 76.5, 75.5] : [124.5, 64.5, 116.5, 75.5];
  return h(
    G,
    null,
    h(
      G,
      { clipPath: `url(#${p}-eye-${side})` },
      h(Path, { d, fill: `url(#${p}-iris)` }),
      h(Path, { d, fill: 'none', stroke: '#2c4a2b', strokeWidth: 2.6, opacity: 0.75 }),
      h(G, { transform: tf(move(P.lookX, P.lookY)) }, h(Ellipse, { cx, cy: 70.5, rx: 3.4, ry: 8, fill: '#14171a', transform: tf(grow(P.pupilW, P.pupilH, cx, 70.5)) })),
      h(Circle, { cx: hl[0], cy: hl[1], r: 2.7, fill: '#fff' }),
      h(Circle, { cx: hl[2], cy: hl[3], r: 1.15, fill: '#fff', opacity: 0.8 }),
      h(
        G,
        { transform: tf(move(0, P.lidDown)) },
        h(Path, { d: `M${cx - 20} 86Q${cx} 75 ${cx + 20} 86L${cx + 20} 104L${cx - 20} 104Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 14} 83Q${cx} 75.8 ${cx + 14} 83`, ...stroke(c.lidLine, 1.3, { opacity: 0.55 }) }),
      ),
      h(
        G,
        { transform: tf(move(0, P.lidUp)) },
        h(Path, { d: `M${cx - 20} 28L${cx + 20} 28L${cx + 20} 55Q${cx} 62 ${cx - 20} 55Z`, fill: c.lid }),
        h(Path, { d: `M${cx - 20} 55Q${cx} 62 ${cx + 20} 55`, fill: 'none', stroke: c.eyeLine, strokeWidth: 2.6 }),
      ),
    ),
    P.happy ? h(Path, { d: left ? 'M69.5 73Q80 62 90.5 73' : 'M109.5 73Q120 62 130.5 73', ...stroke(c.eyeLine, 2.6, { opacity: P.happy }) }) : null,
    P.sleep ? h(Path, { d: left ? 'M69.5 72.5Q80 79 90.5 72.5' : 'M109.5 72.5Q120 79 130.5 72.5', ...stroke(c.eyeLine, 2.4, { opacity: P.sleep }) }) : null,
  );
}

function mouth(kind) {
  const line = { fill: 'none', stroke: '#4a4045', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'smile')
    return h(G, null, h(Path, { d: 'M96 99.2Q100 106.5 104 99.2Q100 101.3 96 99.2Z', fill: '#8a3f45' }), h(Path, { d: 'M100 93V96.5M92 97Q96 102.8 100 97.2Q104 102.8 108 97', ...line }));
  if (kind === 'yawn')
    return h(
      G,
      null,
      h(Path, { d: 'M93 97Q100 93 107 97Q109.5 108.5 100 111.5Q90.5 108.5 93 97Z', fill: '#5b2a31', stroke: '#4a4045', strokeWidth: 1.3 }),
      h(Path, { d: 'M95.2 106Q100 103 104.8 106Q103 110.3 100 110.6Q97 110.3 95.2 106Z', fill: '#d77b80' }),
      h(Path, { d: 'M94.8 97.6l1.6 3 1.2-3.4M105.2 97.6l-1.6 3-1.2-3.4', fill: '#fff' }),
    );
  return h(G, null, h(Path, { d: 'M100 93V96M93.5 98Q97 101 100 96Q103 101 106.5 98', ...line }));
}

function head(p, c, P) {
  return h(
    G,
    { transform: tf(move(P.headX, P.headY), turn(P.headR, 100, 110)) },
    h(
      G,
      { transform: tf(turn(P.earL, 70, 53)) },
      h(Path, { d: 'M84 43Q69 20 53 10Q48.5 12 48.5 19Q48.5 39 56 61Z', ...outline(`url(#${p}-head)`, c.line, 1.8) }),
      h(Path, { d: 'M78 45Q67 29 55.5 19.5Q54.5 34 59 55Z', fill: `url(#${p}-ear)` }),
      h(Path, { d: 'M66 52Q62 42 57.5 33M71 51Q66 43 61 37', ...stroke(c.tuft, 1.2, { opacity: 0.85 }) }),
    ),
    h(
      G,
      { transform: tf(turn(P.earR, 130, 52)) },
      h(Path, { d: 'M116 42Q130 18 146 8.5Q150.5 10 150.5 16.5Q151 37 144 60Z', ...outline(`url(#${p}-head)`, c.line, 1.8) }),
      h(Path, { d: 'M122 44Q132 27 144 17Q145.5 31 141 54Z', fill: `url(#${p}-ear)` }),
      h(Path, { d: 'M134 51Q138 41 142 32M129 50Q133 42 138 36', ...stroke(c.tuft, 1.2, { opacity: 0.85 }) }),
    ),
    h(Path, { d: 'M97 39Q102 29 111 26.5Q106.5 33 109 40Z', ...outline(`url(#${p}-head)`, c.line, 1.6) }),
    h(Path, {
      d: 'M100 37C120 37 136 45 141 61C144 69 145 75 147 80Q152 84 156 89Q149.5 89 146 90Q150.5 95 150.5 99.5Q145 99 141 100C133 109 118 114 100 114C82 114 67 109 59 101Q54 101.5 48.5 101Q52 97 54 92Q49 90 45.5 86Q51.5 83 54 79C56 72 58 65 60 60C65 45 80 37 100 37Z',
      ...outline(`url(#${p}-head)`, c.line, 1.8),
    }),
    h(Path, { d: 'M140 64C143 70 144 75 146 80M60 64C57 70 56 75 54 79', ...stroke(c.sheen, 2, { opacity: 0.5 }) }),
    h(Path, { d: 'M66 77Q60 78 54.5 81.5M67 82.5Q62 84.5 58 89M134 77Q140 78 145.5 81.5M133 82.5Q138 84.5 142 89M85 49Q82.5 55 83.5 61M115 49Q117.5 55 116.5 61', ...stroke(c.smoke, 2.1, { opacity: 0.6 }) }),
    c.marks === 'tabby' ? h(Path, { d: TABBY_HEAD, ...stroke(c.stripe, 2.3, { opacity: 0.7 }) }) : null,
    h(Path, { d: 'M78 86C70 92 71 106 84 111C90 114.5 110 114.5 116 111C129 106 130 92 122 86C112 80 88 80 78 86Z', fill: c.cream, opacity: c.halo }),
    h(Path, { d: 'M82 86.5C88 82.5 95 84.5 100 88C105 84.5 112 82.5 118 86.5C127.5 91.5 127.5 105.5 115 110.5C109 113.5 91 113.5 85 110.5C72.5 105.5 72.5 91.5 82 86.5Z', fill: `url(#${p}-cream)` }),
    c.marks === 'blaze' ? h(Path, { d: BLAZE, fill: c.cream }) : h(Path, { d: 'M96.5 62Q100 60 103.5 62L102.8 86L97.2 86Z', fill: c.cream, opacity: c.bridge }),
    h(Path, { d: 'M93 38C104 36.5 113 41 115 48.5Q109 46.5 105.5 48.5Q107.5 53 106 58Q101.5 52 97.5 51.5Q98.5 56 95 61Q92.5 53 86 50.5Q88 43 93 38Z', ...outline(`url(#${p}-fringe)`, c.fringeLine, 1) }),
    h(Path, { d: 'M96 41Q102.5 42.5 105.5 48M91 44Q94 47 95 52', ...stroke(c.fringeSheen, 1, { opacity: 0.8 }) }),
    eye(p, 'l', c, P),
    eye(p, 'r', c, P),
    h(Path, { d: 'M95 86.5Q100 85 105 86.5Q104.5 90.5 100 93Q95.5 90.5 95 86.5Z', ...outline(c.nose, c.noseLine, 1) }),
    h(Path, { d: 'M97.6 87.4Q100 86.7 102.2 87.4', ...stroke('#fff', 0.9, { opacity: 0.55 }) }),
    mouth(P.mouth),
    h(Path, { d: 'M86 94Q66 88 43 89M86 97Q64 96 41 99.5M87 100Q67 103.5 46 109M114 94Q134 88 157 89M114 97Q136 96 159 99.5M113 100Q133 103.5 154 109', ...stroke(c.whisker, 0.95, { opacity: 0.95 }) }),
    P.purr ? h(Path, { d: 'M156 72q4 3 0 6M162 69q6 5 0 12', ...stroke(SCARF.scarf, 1.6, { opacity: P.purr }) }) : null,
  );
}

// Рисунок кота: поза, облик (неизвестный — дымчатый, как веб), надетый аксессуар; toward — сторона предмета; prefix —
// префикс id градиентов экземпляра; room — рисунок в сцене комнаты уголка ({ feed } — сдвиг к миске, своей миски нет).
// Только элементы — корневой <Svg viewBox="0 0 220 204"> ставит отображение.
function CatFigure({ pose = 'calm', coat = 'smoke', accessory = 'scarf', toward = '', prefix = '', room = null } = {}) {
  const c = Object.hasOwn(COATS, coat) ? COATS[coat] : COATS.smoke;
  const p = idPrefix(prefix, 'cat');
  const P = params(pose, toward);
  const [x, y] = bodyShift(P, pose, room);
  return h(
    G,
    null,
    defs(p, c),
    h(Ellipse, { cx: 104, cy: 189, rx: 72, ry: 7.5, fill: `url(#${p}-ground)` }),
    h(G, { transform: tf(move(x, y)) }, P.lie ? lyingBody(p, c) : null, P.sit ? sittingBody(p, c, P) : null, scarf(p, accessory, P), head(p, c, P), P.lie ? lyingFront(c) : null),
    P.bowl && !room ? bowl(P.bowl === 'full') : null,
  );
}

// Клубок — своя игрушка кота в уголке (cat-art.mjs, yarnArt), единицы сцены 400×250, исходное место (36, 231).
function CatItem({ id } = {}) {
  if (id !== 'yarn') return h(G, null);
  return h(
    G,
    null,
    h(Ellipse, { cx: 37, cy: 242, rx: 14, ry: 2.4, fill: '#3a2414', opacity: 0.16 }),
    h(Path, { d: 'M45 238q4 4 8 1', fill: 'none', stroke: '#9e4528', strokeWidth: 1.6, strokeLinecap: 'round' }),
    h(Circle, { cx: 36, cy: 231, r: 11, fill: '#cf6741', stroke: '#9e4528', strokeWidth: 2 }),
    h(Path, { d: 'M27.5 225q8-3.5 16 3.5M26 231.5q9-5.5 19 2M28.5 237.5q7.5-4.5 13.5.5M33 220.8q-4.5 7.5 0 19', fill: 'none', stroke: '#e58a5f', strokeWidth: 1.7, strokeLinecap: 'round' }),
  );
}

// Набор: все позы словаря, кроме settle (устроился на новом месте — вход legacy-отображения, нативу не нужен: явная замена
// — content); ресурсы уголка PL10.2.1 — рисунок в комнате (room) и клубок; сценок (stretch, curl) и предметов игры нет —
// PL10.2.2–PL10.2.4.
export const catNative = Object.freeze({
  pet: 'cat',
  poses: Object.freeze(['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'feed', 'fed', 'sniff', 'watch', 'ball', 'paw', 'yawn']),
  substitutes: Object.freeze({ settle: 'content' }),
  coats: Object.freeze(Object.keys(COATS)),
  accessories: Object.freeze(['scarf', 'plaid', 'badge']),
  Figure: CatFigure,
  room: true,
  items: Object.freeze(['yarn']),
  Item: CatItem,
});
