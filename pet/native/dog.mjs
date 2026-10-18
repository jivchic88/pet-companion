// Натив: штатный набор собаки dogNative (этап PL10.1; docs/ARCHITECTURE.md § 7.4, § 12.2). Рисунок Тоби веб-набора
// (dog-art.mjs: висячие уши, вихор, кремовая морда, пушистый хвост, платок с узлом сбоку) перенесён в элементы
// react-native-svg в тех же единицах 220×204; позы — таблица суставов из dog.css (веки, уши, брови, голова, взгляд,
// хвост, поднятая лапа «Дай лапу», платок, «сидит» / «лежит»), облики — палитры и отметины DOG_COATS, надетый аксессуар —
// один из трёх платков. Набор не решает, какую позу показать: Figure получает позу, облик и аксессуар из снимка ядра.

import { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { badge, ballShape, bodyShift, bowl, grow, h, idPrefix, linear, move, radial, scarfFill, SCARF, sharedDefs, stretchY, tf, turn } from './svg.mjs';

// Палитры обликов (dog-art.mjs, DOG_COATS): lid / lidR — тон морды у глаз, blaze — светлая полоса на лбу, marks —
// отметины (patch — пятно у правого глаза и на боку, tan — подпалины-«брови»).
const COATS = Object.freeze({
  caramel: {
    furLight: '#ebba7b', fur: '#d39652', furDark: '#b2753a', line: '#5a3921', ear: '#8c5632', earDark: '#683b1f', earLight: '#a9713f', earLine: '#b07a4a',
    cream: '#f8ead3', creamShade: '#e9d0ab', muzzleHi: '#fffaf1', bibTop: '#eedcc0', bibBottom: '#ead5b6', bibSheen: '#fffaf2', tailTip: '#fff6e6', tailSheen: '#fff3df',
    headHi: '#efc283', lid: '#e0ab6a', lidR: '#e0ab6a', headSheen: '#f6d39f', sheen: '#f3cf98', paw: '#fbf1e2', toe: '#b49a7d', brow: '#8b5328', browR: '#8b5328',
    blush: '#e7a27f', lidLine: '#7a4b26', eyeLine: '#2c1a0e', blaze: 0.8, patch: '', marks: '',
  },
  spotted: {
    furLight: '#fffcf6', fur: '#f1e6d5', furDark: '#d6c4aa', line: '#6b5243', ear: '#8a5430', earDark: '#653819', earLight: '#a8703f', earLine: '#bf8b5b',
    cream: '#fffaf2', creamShade: '#eee0cc', muzzleHi: '#ffffff', bibTop: '#f6ecdd', bibBottom: '#eee2d0', bibSheen: '#ffffff', tailTip: '#ffffff', tailSheen: '#ffffff',
    headHi: '#fffdf8', lid: '#f5ece0', lidR: '#93592f', headSheen: '#ffffff', sheen: '#ffffff', paw: '#fffaf3', toe: '#b8a48e', brow: '#b08a66', browR: '#5f3519',
    blush: '#f0a58c', lidLine: '#a08068', eyeLine: '#2c1a0e', blaze: 0, patch: '#93592f', marks: 'patch',
  },
  blacktan: {
    furLight: '#6b5d54', fur: '#4d423b', furDark: '#342b26', line: '#150f0c', ear: '#43372f', earDark: '#2e2521', earLight: '#5c4c42', earLine: '#75625a',
    cream: '#d39256', creamShade: '#b8763f', muzzleHi: '#e6ae6e', bibTop: '#c9884c', bibBottom: '#c07f44', bibSheen: '#ecc08a', tailTip: '#e0a463', tailSheen: '#8a776b',
    headHi: '#7a685e', lid: '#66574e', lidR: '#66574e', headSheen: '#8f7c70', sheen: '#8a776b', paw: '#dca063', toe: '#8f5f33', brow: '#d69a5e', browR: '#d69a5e',
    blush: '#c98a54', lidLine: '#120c0a', eyeLine: '#0c0806', blaze: 0, patch: '', marks: 'tan',
  },
});

// Позы — значения суставов dog.css (переменные --dg-*); не заданное — как у покоя по умолчанию.
const BASE = Object.freeze({
  lidUp: 3, lidDown: 0, earL: 0, earR: 0, headX: 0, headY: 0, headR: 0, lookX: 0, lookY: 0, pupil: 1, happy: 0, sleep: 0,
  browY: 0, browL: 0, browR: 0, tail: 0, paw: 0, pawUp: 0, leg: 1, scarfY: 0, scarfS: 1, sitS: 1, sit: 1, lie: 0, allX: 0, allY: 0, mouth: 'calm', bowl: '',
});
const POSES = Object.freeze({
  calm: { lidUp: 0, lidDown: -1, earR: -6 },
  attentive: { lidUp: 0, headR: -7, headY: -2, earL: 5, earR: -24, browY: -2 },
  greet: { lidUp: 24, happy: 1, headY: -3, headR: 5, earL: 9, earR: -16, browY: -1.5, tail: -8, mouth: 'open' },
  joy: { lidUp: 24, happy: 1, headY: -3, headR: -4, earL: 13, earR: -22, browY: -2, tail: -12, mouth: 'open' },
  support: { lidUp: 2, lidDown: -3, headR: -9, earL: -2, earR: 2, browY: -1, browL: -10, browR: 10, lookY: 1, tail: 7 },
  pet: { lidUp: 24, happy: 1, headR: 10, headX: 1, earL: -2, earR: 3, tail: -5 },
  unlock: { lidUp: 0, lookX: -2.6, lookY: 2.6, pupil: 1.1, headR: -8, headY: 1, earL: 7, earR: -22, browY: -2, tail: -6 },
  wait: { lidUp: 2, headR: 4, earL: 2, earR: -3, lookY: 1 },
  rest: { sitS: 0.8, sit: 0, lie: 1, headY: 60, headR: -3, scarfY: 55, scarfS: 0.7, lidUp: 24, sleep: 1, earL: 12, earR: -12 },
  yawn: { lidUp: 24, sleep: 1, headY: -3, headR: -4, earL: 7, earR: -8, mouth: 'yawn' },
  paw: { pawUp: 1, leg: 0, lidUp: 0, headR: -8, earL: 6, earR: -18, browY: -1.5, tail: -6, mouth: 'open' },
  sniff: { headY: 5, headR: -9, lookX: -2.6, lookY: 2.6, lidUp: 2, earL: 6, earR: -10, browY: -1.5, tail: -6 },
  watch: { lookX: -2.6, lookY: 1.5, headR: -4, lidUp: 1, earR: -6 },
  ball: { lidUp: 0, lookX: -2.8, lookY: 2.4, pupil: 1.12, headR: -10, earL: 8, earR: -20, browY: -2, tail: -6 },
  // Сдвиг к миске меньше веба (−30, +12 в сцене 400×250): в рамке рисунка 220×204 питомец не срезается краем.
  feed: { allX: -20, allY: 10, headY: 46, headR: -9, scarfY: 30, scarfS: 0.85, lidUp: 24, happy: 1, earL: 6, earR: -8, tail: -10, bowl: 'full' },
  fed: { lidUp: 24, happy: 1, headY: -3, headR: 6, earL: 12, earR: -20, browY: -2, tail: -12, mouth: 'open', bowl: 'empty' },
  content: { lidUp: 9, lidDown: -2, earL: 3, earR: -12, browY: -1, tail: -5 },
});
// Предмет справа (reaction.toward): взгляд и голова в другую сторону.
const RIGHT = { lookX: 2.6, headR: 8, earL: 12, earR: -6 };

const params = (pose, toward) => {
  const own = Object.hasOwn(POSES, pose) ? POSES[pose] : POSES.calm;
  const turned = toward === 'right' && ['sniff', 'watch', 'ball'].includes(pose) ? RIGHT : {};
  return { ...BASE, ...own, ...turned };
};

const EYE_Y = 63;
const EYE_R = 9.4;
const EYES = { l: 81.5, r: 118.5 };
const SIDE_PATCH = 'M126 146C133 139.5 148 142 152.5 151.5C156 160 149 169 139 168.5C130 168 123.5 161 124 154C124.2 151 124.8 148.4 126 146Z';
const LIE_PATCH = 'M158 151.5C166 148 178.5 153 181.5 162.5C183.5 170.5 176.5 176.5 168 175.5C159.5 174.5 153.5 168 153.8 160.8C154 157 155.4 153.4 158 151.5Z';
const EYE_PATCH = 'M107.5 51C113 45.5 126 45 131.5 51.5C136 57 135.5 69 130 75C124.5 80.5 113 80 108.5 74C104.5 68.5 103.5 56 107.5 51Z';
const stroke = (color, width, extra = {}) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', ...extra });
const outline = (fill, color, width) => ({ fill, stroke: color, strokeWidth: width, strokeLinejoin: 'round' });

function defs(p, c) {
  return h(
    Defs,
    null,
    linear(`${p}-fur`, { gradientUnits: 'userSpaceOnUse', x1: 60, y1: 96, x2: 150, y2: 192 }, [['0', c.furLight], ['0.55', c.fur], ['1', c.furDark]]),
    radial(`${p}-head`, { gradientUnits: 'userSpaceOnUse', cx: 100, cy: 58, r: 64 }, [['0', c.headHi], ['0.5', c.lid], ['0.85', c.fur], ['1', c.furDark]]),
    linear(`${p}-ear`, { x1: '0%', y1: '0%', x2: '35%', y2: '100%' }, [['0', c.earLight], ['0.45', c.ear], ['1', c.earDark]]),
    radial(`${p}-muzzle`, { cx: '50%', cy: '42%', r: '62%' }, [['0', c.muzzleHi], ['0.7', c.cream], ['1', c.creamShade]]),
    linear(`${p}-bib`, { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [['0', c.bibTop], ['0.35', c.cream], ['1', c.bibBottom]]),
    linear(`${p}-tail`, { gradientUnits: 'userSpaceOnUse', x1: 148, y1: 182, x2: 194, y2: 122 }, [['0', c.furDark], ['0.45', c.fur], ['0.72', c.furLight], ['0.86', c.cream], ['1', c.tailTip]]),
    linear(`${p}-tail-lie`, { gradientUnits: 'userSpaceOnUse', x1: 192, y1: 180, x2: 122, y2: 190 }, [['0', c.furDark], ['0.55', c.fur], ['0.8', c.cream], ['1', c.tailTip]]),
    radial(`${p}-iris`, { cx: '42%', cy: '38%', r: '70%' }, [['0', '#d79a48'], ['0.45', '#9a5d26'], ['1', '#4b2a13']]),
    ...sharedDefs(p),
    h(ClipPath, { id: `${p}-eye-l` }, h(Circle, { cx: EYES.l, cy: EYE_Y, r: EYE_R })),
    h(ClipPath, { id: `${p}-eye-r` }, h(Circle, { cx: EYES.r, cy: EYE_Y, r: EYE_R })),
  );
}

// Хвост сидящего пса — перо справа; виляние — поворот у основания.
function tail(p, c, P) {
  return h(
    G,
    { transform: tf(turn(P.tail, 148, 178)) },
    h(Path, {
      d: 'M142 185C156 190 172 187 182 177Q189 176.5 189.5 170C194.5 162 197.5 152 195.5 142Q200.5 135.5 197 127.5Q199 119 192.5 114Q189.5 120.5 184 121Q182.5 128 178 132C176 144 170 154 162 160C155 165 150 167.5 143.5 168Z',
      ...outline(`url(#${p}-tail)`, c.line, 1.7),
    }),
    h(Path, { d: 'M152 178Q167 177 177 166M168 172Q182 165 187 151M183 142Q189 134 190 125', ...stroke(c.tailSheen, 1.4, { opacity: 0.55 }) }),
    h(Path, { d: 'M157 182Q172 180 182 170M176 160Q182 152 184 144', ...stroke(c.furDark, 1.4, { opacity: 0.45 }) }),
  );
}

function leg(p, c, side) {
  const l = side === 'l';
  const x = l ? 0 : 20;
  return h(
    G,
    { key: side },
    h(Path, { d: `M${83 + x} 130C${81.5 + x} 147 ${82 + x} 166 ${83 + x} 181L${98 + x} 181C${98 + x} 166 ${98.5 + x} 147 ${99.5 + x} 132Z`, ...outline(`url(#${p}-fur)`, c.line, 1.7) }),
    h(Path, { d: `M${82.4 + x} 160Q${90.5 + x} 164 ${98.4 + x} 160L${98.2 + x} 181L${83 + x} 181Z`, fill: c.cream }),
    h(Path, { d: `M${l ? 95 : 105} 138C${l ? 95 : 105} 148 ${l ? 94.6 : 105.4} 154 ${l ? 94.4 : 105.6} 158`, ...stroke(c.furDark, 1.7, { opacity: 0.45 }) }),
    h(Path, { d: `M${79 + x} 183Q${79 + x} 176 ${90.5 + x} 176Q${102 + x} 176 ${102 + x} 183Q${102 + x} 190.5 ${90.5 + x} 190.5Q${79 + x} 190.5 ${79 + x} 183Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { d: `M${86 + x} 184.5v4.5M${90.5 + x} 184v5.5M${95 + x} 184.5v4.5`, ...stroke(c.toe, 1.2) }),
  );
}

// «Дай лапу»: поднятая левая передняя лапа подушечками вперёд — только в позе paw (обычная левая лапа тогда скрыта).
function pawUp(p, c, P) {
  const pad = '#c9877d';
  return h(
    G,
    { transform: tf(turn(P.paw, 92, 130)) },
    h(Path, { d: 'M85 123C80 127 76 131 71 135L82 147C88 143 94 139 100 134Z', ...outline(`url(#${p}-fur)`, c.line, 1.7) }),
    h(Path, { d: 'M59 138C59 129.5 65 124.5 72 124.5C79 124.5 85 129.5 85 138C85 146.5 79 151.5 72 151.5C65 151.5 59 146.5 59 138Z', fill: c.paw, stroke: c.line, strokeWidth: 1.6 }),
    h(Path, { d: 'M66.5 145.5C66.5 141.5 69 139.5 72 139.5C75 139.5 77.5 141.5 77.5 145.5C77.5 148 75 149 72 149C69 149 66.5 148 66.5 145.5Z', fill: pad }),
    h(Ellipse, { cx: 63.8, cy: 134.6, rx: 2.2, ry: 2.6, fill: pad }),
    h(Ellipse, { cx: 68.9, cy: 130.8, rx: 2.2, ry: 2.6, fill: pad }),
    h(Ellipse, { cx: 75.1, cy: 130.8, rx: 2.2, ry: 2.6, fill: pad }),
    h(Ellipse, { cx: 80.2, cy: 134.6, rx: 2.2, ry: 2.6, fill: pad }),
  );
}

function sittingBody(p, c, P) {
  return h(
    G,
    { transform: tf(stretchY(P.sitS, 102, 188)) },
    tail(p, c, P),
    h(Path, { d: 'M76 104C64 112 58 126 56 141C44 147 38 161 40 173C41 183 48 188 58 188L142 188C152 188 159 183 160 173C162 161 156 147 144 141C142 126 136 112 124 104Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.patch ? h(Path, { d: SIDE_PATCH, fill: c.patch }) : null,
    h(Path, { d: 'M58 149C70 151 78 163 78 179M142 149C130 151 122 163 122 179', ...stroke(c.furDark, 2, { opacity: 0.5 }) }),
    h(Path, { d: 'M48 160C47 170 50 179 57 184M66 122C62 129 61 135 61 140', ...stroke(c.sheen, 2, { opacity: 0.6 }) }),
    h(Path, { d: 'M39 182Q39 175.5 49.5 175.5Q60 175.5 60 182Q60 189 49.5 189Q39 189 39 182ZM140 182Q140 175.5 150.5 175.5Q161 175.5 161 182Q161 189 150.5 189Q140 189 140 182Z', fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { d: 'M45.5 183v4M49.5 182.5v5M53.5 183v4M146.5 183v4M150.5 182.5v5M154.5 183v4', ...stroke(c.toe, 1.1) }),
    h(Path, { d: 'M81 106C75 119 73 135 77 149Q82 152 85 158Q90 153 95 160Q100 154 105 160Q110 153 115 158Q118 152 123 149C127 135 125 119 119 106Z', fill: `url(#${p}-bib)` }),
    h(Path, { d: 'M90 128q3.5 4 .5 9M110 126q-3.5 4-.5 9M100 137q2 4 0 8', ...stroke(c.bibSheen, 1.4, { opacity: 0.9 }) }),
    h(Ellipse, { cx: 100, cy: 116, rx: 32, ry: 8.5, fill: '#3a2414', opacity: 0.14 }),
    leg(p, c, 'r'),
    P.leg ? leg(p, c, 'l') : null,
    P.pawUp ? pawUp(p, c, P) : null,
  );
}

// Отдых: лёг, голова на передних лапах, хвост обёрнут спереди.
function lyingBody(p, c) {
  return h(
    G,
    null,
    h(Path, { d: 'M24 188C20 163 49 140 98 138C144 136 182 147 193 171C197 183 191 188 181 188Z', ...outline(`url(#${p}-fur)`, c.line, 1.8) }),
    c.patch ? h(Path, { d: LIE_PATCH, fill: c.patch }) : null,
    h(Path, { d: 'M56 150C88 140 128 140 160 150', ...stroke(c.sheen, 2.2, { opacity: 0.6 }) }),
    h(Path, { d: 'M150 150C168 156 178 168 178 182', ...stroke(c.furDark, 2, { opacity: 0.5 }) }),
    h(Path, { d: 'M40 166C40 174 44 182 50 186', ...stroke(c.sheen, 2, { opacity: 0.5 }) }),
  );
}

function lyingFront(p, c) {
  const paw = (x) => [
    h(Path, { key: `p${x}`, d: `M${x} 186Q${x} 178 ${x + 12} 178Q${x + 24} 178 ${x + 24} 186Q${x + 24} 194 ${x + 12} 194Q${x} 194 ${x} 186Z`, fill: c.paw, stroke: c.line, strokeWidth: 1.5 }),
    h(Path, { key: `t${x}`, d: `M${x + 7.5} 187.5v3.8M${x + 12} 187v4.6M${x + 16.5} 187.5v3.8`, ...stroke(c.toe, 1.2) }),
  ];
  return h(
    G,
    null,
    h(Path, { d: 'M190 175C200 188 182 197 158 196C144 195.5 133 194 124 191Q136 186.5 156 186.5C171 186.5 182 182 190 175Z', ...outline(`url(#${p}-tail-lie)`, c.line, 1.6) }),
    paw(74),
    paw(102),
  );
}

// Платок с узлом сбоку: виден только надетый аксессуар (scarf, plaid или badge).
function scarf(p, accessory, P) {
  if (!['scarf', 'plaid', 'badge'].includes(accessory)) return null;
  const fill = scarfFill(p, accessory);
  const edge = (width) => outline(fill, SCARF.dark, width);
  return h(
    G,
    { transform: tf(move(0, P.scarfY), stretchY(P.scarfS, 100, 104)) },
    h(Path, { d: 'M63 103C80 116 120 116 137 103L139 112C120 126 80 126 61 112Z', ...edge(1.5) }),
    h(Path, { d: 'M79 115C93 121 108 121 122 114C119 129 111 141 101 149C92 139 84 127 79 115Z', ...edge(1.5) }),
    h(Path, { d: 'M139 112Q148 117 150 128Q143 124 137 117ZM135 115Q138 126 134 135Q130 125 132 116Z', ...edge(1.4) }),
    h(Path, { d: 'M131 106Q139 100 146 106Q147 113 139 116Q131 115 131 106Z', fill, stroke: SCARF.dark, strokeWidth: 1.5 }),
    h(Path, { d: 'M95 121Q100 130 103 138M88 119Q93 125 97 130', ...stroke(SCARF.dark, 1.2, { opacity: 0.55 }) }),
    h(Path, { d: 'M82 117.5Q96 121.5 110 120', ...stroke('#f3b08b', 1.3, { opacity: 0.6 }) }),
    accessory === 'badge' ? badge(88.5, 121, -6, 96, 131) : null,
  );
}

function eye(p, side, c, P) {
  const cx = EYES[side];
  const y = EYE_Y;
  const lid = side === 'r' ? c.lidR : c.lid;
  return h(
    G,
    null,
    h(
      G,
      { clipPath: `url(#${p}-eye-${side})` },
      h(Circle, { cx, cy: y, r: EYE_R, fill: `url(#${p}-iris)` }),
      h(Circle, { cx, cy: y, r: EYE_R, fill: 'none', stroke: '#3a2416', strokeWidth: 2.6, opacity: 0.8 }),
      h(G, { transform: tf(move(P.lookX, P.lookY)) }, h(Circle, { cx, cy: y + 0.4, r: 4.9, fill: '#160d08', transform: tf(grow(P.pupil, P.pupil, cx, y + 0.4)) })),
      h(Circle, { cx: cx + 3, cy: y - 3.6, r: 2.7, fill: '#fff' }),
      h(Circle, { cx: cx - 3, cy: y + 3.4, r: 1.1, fill: '#fff', opacity: 0.8 }),
      h(
        G,
        { transform: tf(move(0, P.lidDown)) },
        h(Path, { d: `M${cx - 13} ${y + 11}Q${cx} ${y + 6} ${cx + 13} ${y + 11}L${cx + 13} ${y + 30}L${cx - 13} ${y + 30}Z`, fill: lid }),
        h(Path, { d: `M${cx - 8} ${y + 9.2}Q${cx} ${y + 6} ${cx + 8} ${y + 9.2}`, ...stroke(c.lidLine, 1.2, { opacity: 0.5 }) }),
      ),
      h(
        G,
        { transform: tf(move(0, P.lidUp)) },
        h(Path, { d: `M${cx - 13} ${y - 36}L${cx + 13} ${y - 36}L${cx + 13} ${y - 9.6}Q${cx} ${y - 5} ${cx - 13} ${y - 9.6}Z`, fill: lid }),
        h(Path, { d: `M${cx - 13} ${y - 9.6}Q${cx} ${y - 5} ${cx + 13} ${y - 9.6}`, fill: 'none', stroke: '#3a2416', strokeWidth: 1.8 }),
      ),
    ),
    P.happy ? h(Path, { d: `M${cx - 9} ${y + 2.5}Q${cx} ${y - 7.5} ${cx + 9} ${y + 2.5}`, ...stroke(c.eyeLine, 2.6, { opacity: P.happy }) }) : null,
    P.sleep ? h(Path, { d: `M${cx - 8.5} ${y + 0.5}Q${cx} ${y + 7.5} ${cx + 8.5} ${y + 0.5}`, ...stroke(c.eyeLine, 2.4, { opacity: P.sleep }) }) : null,
  );
}

// «Брови»: у подпалого — светлые точки над глазами, у остальных — дуги.
function brow(side, c, P) {
  const l = side === 'l';
  const transform = tf(move(0, P.browY), turn(l ? P.browL : P.browR, l ? 80.5 : 119.5, 48));
  const mark =
    c.marks === 'tan'
      ? h(Ellipse, { cx: l ? 80.6 : 119.4, cy: 47.6, rx: 5.4, ry: 3.7, fill: c.brow })
      : h(Path, { d: l ? 'M73.5 49.5Q80.5 45 88 48.5' : 'M112 48.5Q119.5 45 126.5 49.5', ...stroke(l ? c.brow : c.browR, 2.6, { opacity: 0.75 }) });
  return h(G, { transform }, mark);
}

function mouth(kind) {
  const line = { fill: 'none', stroke: '#4a3022', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'open')
    return h(
      G,
      null,
      h(Path, { d: 'M87.5 95Q100 98.5 112.5 95Q111.5 108 100 111Q88.5 108 87.5 95Z', fill: '#5e2b2d', stroke: '#4a3022', strokeWidth: 1.4, strokeLinejoin: 'round' }),
      h(Path, { d: 'M92.5 102.5Q100 99.5 107.5 102.5Q107.5 111 100 112.5Q92.5 111 92.5 102.5Z', fill: '#e2808a' }),
      h(Path, { d: 'M100 103.5V109', stroke: '#c4606b', strokeWidth: 1.1, strokeLinecap: 'round' }),
      h(Path, { d: 'M100 90.5V96', stroke: '#4a3022', strokeWidth: 1.6, strokeLinecap: 'round' }),
    );
  if (kind === 'yawn')
    return h(
      G,
      null,
      h(Path, { d: 'M91 95Q100 92 109 95Q112 109 100 113Q88 109 91 95Z', fill: '#5e2b2d', stroke: '#4a3022', strokeWidth: 1.3 }),
      h(Path, { d: 'M93.6 105Q100 101.5 106.4 105Q105 112 100 112.6Q95 112 93.6 105Z', fill: '#e2808a' }),
      h(Path, { d: 'M92.5 96l1.6 3 1.2-3.4M107.5 96l-1.6 3-1.2-3.4', fill: '#fff' }),
    );
  return h(G, null, h(Path, { d: 'M100 90.5V95M88.5 94.5Q93.5 101.5 100 96Q106.5 101.5 111.5 94.5', ...line }));
}

function head(p, c, P) {
  return h(
    G,
    { transform: tf(move(P.headX, P.headY), turn(P.headR, 100, 112)) },
    h(Path, {
      d: 'M100 31C122 31 140 43 144 63C146 73 146 83 143 91Q148 95 146 101Q141 100 137 103C128 112 115 116 100 116C85 116 72 112 63 103Q59 100 54 101Q52 95 57 91C54 83 54 73 56 63C60 43 78 31 100 31Z',
      ...outline(`url(#${p}-head)`, c.line, 1.8),
    }),
    h(Path, { d: 'M62 60C60 68 60 76 62 84M138 60C140 68 140 76 138 84', ...stroke(c.headSheen, 2, { opacity: 0.55 }) }),
    c.blaze ? h(Path, { d: 'M95 40Q100 36 105 40L108.5 66Q100 70 91.5 66Z', fill: c.cream, opacity: c.blaze }) : null,
    h(Path, { d: 'M100 67C110 67 118 71 123 79C129 87 128 100 120 107C114 112 107 114.5 100 114.5C93 114.5 86 112 80 107C72 100 71 87 77 79C82 71 90 67 100 67Z', fill: `url(#${p}-muzzle)` }),
    c.marks === 'patch' ? h(Path, { d: EYE_PATCH, fill: c.patch }) : null,
    h(
      G,
      null,
      h(Path, {
        d: 'M91.5 37C89 29 93 21.5 101 19.5C106.5 18.2 111 20.5 112.5 24C108.5 22.8 104.5 23.8 103.2 26.6C106.6 25.6 110 26.8 111 30C107 29.8 104.4 31.6 104.2 35.6Z',
        ...outline(`url(#${p}-head)`, c.line, 1.4),
      }),
      h(Path, { d: 'M95 34Q95 27 100 24M99.5 34Q101 29 104.5 27.5', ...stroke(c.headSheen, 1, { opacity: 0.85 }) }),
    ),
    brow('l', c, P),
    brow('r', c, P),
    eye(p, 'l', c, P),
    eye(p, 'r', c, P),
    h(Path, { d: 'M71 74Q74 76.5 77 76M129 74Q126 76.5 123 76', ...stroke(c.blush, 3, { opacity: 0.45 }) }),
    h(Path, { d: 'M90 81C90 76.5 95 75 100 75C105 75 110 76.5 110 81C110 86.5 104.5 90.5 100 90.5C95.5 90.5 90 86.5 90 81Z', ...outline('#3a2924', '#1f1411', 1) }),
    h(Ellipse, { cx: 96.2, cy: 78.6, rx: 3.2, ry: 1.6, fill: '#fff', opacity: 0.45 }),
    mouth(P.mouth),
    h(
      G,
      { transform: tf(turn(P.earL, 74, 40)) },
      h(Path, { d: 'M80 37C70 31 54 35 46 47C38 59 37 81 41 95C44 105 53 110 59 104C65 98 66 84 66 72C66 58 70 46 80 37Z', ...outline(`url(#${p}-ear)`, c.line, 1.7) }),
      h(Path, { d: 'M57 50Q50 66 52 90M63 56Q59 70 60 86', ...stroke(c.earLine, 1.4, { opacity: 0.55 }) }),
    ),
    h(
      G,
      { transform: tf(turn(P.earR, 126, 40)) },
      h(Path, { d: 'M120 37C130 31 146 35 154 47C162 59 163 81 159 95C156 105 147 110 141 104C135 98 134 84 134 72C134 58 130 46 120 37Z', ...outline(`url(#${p}-ear)`, c.line, 1.7) }),
      h(Path, { d: 'M143 50Q150 66 148 90M137 56Q141 70 140 86', ...stroke(c.earLine, 1.4, { opacity: 0.55 }) }),
    ),
  );
}

// Рисунок собаки: поза, облик (неизвестный — карамельный, как веб), надетый аксессуар; toward — сторона предмета; prefix —
// префикс id градиентов экземпляра; room — рисунок в сцене комнаты уголка ({ feed } — сдвиг к миске, своей миски нет).
// Только элементы — корневой <Svg viewBox="0 0 220 204"> ставит отображение.
function DogFigure({ pose = 'calm', coat = 'caramel', accessory = 'scarf', toward = '', prefix = '', room = null } = {}) {
  const c = Object.hasOwn(COATS, coat) ? COATS[coat] : COATS.caramel;
  const p = idPrefix(prefix, 'dog');
  const P = params(pose, toward);
  const [x, y] = bodyShift(P, pose, room);
  return h(
    G,
    null,
    defs(p, c),
    h(Ellipse, { cx: 102, cy: 189, rx: 76, ry: 7.5, fill: `url(#${p}-ground)` }),
    h(G, { transform: tf(move(x, y)) }, P.lie ? lyingBody(p, c) : null, P.sit ? sittingBody(p, c, P) : null, scarf(p, accessory, P), head(p, c, P), P.lie ? lyingFront(p, c) : null),
    P.bowl && !room ? bowl(P.bowl === 'full') : null,
  );
}

// Свои вещи собаки в уголке (dog-art.mjs, ropeArt и ballArt): канат — сразу, мячик — со ступени «Наш ритуал» (тот же
// рисунок, что предмет «Поиграть», — ballShape общего svg.mjs); единицы сцены 400×250, исходные места (36, 233) и (283, 234).
function DogItem({ id } = {}) {
  if (id === 'rope') {
    return h(
      G,
      null,
      h(Ellipse, { cx: 36, cy: 240, rx: 23, ry: 2.4, fill: '#3a2414', opacity: 0.16 }),
      h(Path, { d: 'M19 233Q36 226.5 53 233', fill: 'none', stroke: '#8b6a47', strokeWidth: 8.4, strokeLinecap: 'round' }),
      h(Path, { d: 'M19 233Q36 226.5 53 233', fill: 'none', stroke: '#efe3d0', strokeWidth: 5.6, strokeLinecap: 'round' }),
      h(Path, { d: 'M24.5 233.6l3-5M30.2 231.6l3-5M36 230.9l3-5M41.8 231.4l3-5M47.4 233.1l3-4.8', stroke: '#cf6741', strokeWidth: 2, strokeLinecap: 'round' }),
      h(Circle, { cx: 17, cy: 234, r: 5, fill: '#cf6741', stroke: '#9e4528', strokeWidth: 1.8 }),
      h(Circle, { cx: 55, cy: 234, r: 5, fill: '#cf6741', stroke: '#9e4528', strokeWidth: 1.8 }),
      h(Path, { d: 'M13 237.5l-2.2 3.4M15.6 239l-.8 3.6M56.4 239l.8 3.6M59 237.5l2.2 3.4', stroke: '#9e4528', strokeWidth: 1.6, strokeLinecap: 'round' }),
    );
  }
  if (id === 'ball') {
    const ball = ballShape();
    return h(G, null, ...ball.shadow, ...ball.body);
  }
  return h(G, null);
}

// Набор: все позы словаря, включая «Дай лапу» (поднятая лапа), кроме settle (устроился на новом месте — вход
// legacy-отображения, нативу не нужен: явная замена — content); ресурсы уголка PL10.2.1 — рисунок в комнате (room), канат
// и мячик; ресурсы игры PL10.2.2 — рисунок совпадает с областями play определения собаки, поднятая лапа «Дай лапу» — там,
// где play.paw.up (play); сценки (fetch) — PL10.2.4.
export const dogNative = Object.freeze({
  pet: 'dog',
  poses: Object.freeze(['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'feed', 'fed', 'sniff', 'watch', 'ball', 'paw', 'yawn']),
  substitutes: Object.freeze({ settle: 'content' }),
  coats: Object.freeze(Object.keys(COATS)),
  accessories: Object.freeze(['scarf', 'plaid', 'badge']),
  Figure: DogFigure,
  room: true,
  items: Object.freeze(['rope', 'ball']),
  Item: DogItem,
  play: true,
});
