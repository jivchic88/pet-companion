// Кролик-напарник (с 2026-10-21, 0.4.0): графика по эталону владельца. Пух — небольшой кремовый кролик: длинные стоячие уши,
// разведённые в стороны (правое чуть сильнее), розовые внутри; круглая широкая голова с пушистыми щеками и хохолком на
// макушке; небольшие тёмно-карие глаза с крупным бликом и тёмной линией века; маленький розовый нос, рот «w», тонкие тёмные
// усы за контуром головы; пушистая грудка, две передние лапки, большие задние ступни, хвост-помпон и терракотовый платок с
// узлом сбоку. Тот же подход, что у кота и собаки (cat-art.mjs, dog-art.mjs): слоистый SVG прямо в странице, части двигает
// bunny.css через transform и opacity. Масштаб и точка опоры общие: viewBox 0 0 220 204, земля — y = 188, поэтому в боковой
// панели, сцене и портрете кролик встаёт на то же место. Облик — палитра и простые отметины поверх той же геометрии
// (BUNNY_COATS): палевый (кремовый, по эталону), белый, пятнистый (белый с бурыми пятнами и бурыми ушами). Правая
// половина морды — зеркало левой (mirror). Модуль без DOM; id — с префиксом экземпляра.

export const BUNNY_VIEWBOX = '0 0 220 204';
export const BUNNY_PORTRAIT_VIEWBOX = '36 -2 128 128';

// Аксессуары — общие для всех обликов и тем: терракотовый платок (scarf, как у кота), розовый бантик (bow), зелёная
// ленточка с клевером (clover).
const SCARF = { scarf: '#cf6741', scarfLight: '#e58a5f', scarfDark: '#9e4528' };
const RIBBON = { pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' };

// Палитры обликов — одни для светлой и тёмной темы. lid — тон морды у глаз (веки — ровным цветом, иначе при движении
// градиент едет вместе с ними); smoke — тёмные штрихи меха; ear — наружная сторона ушей (у пятнистого — бурая), earIn /
// earDeep — внутренняя; whisker — усы (тёмные, тоном контура); marks — отметины (patch — бурые пятна на спине, бедре и
// вокруг правого глаза).
export const BUNNY_COATS = {
  fawn: {
    furLight: '#fffaf2', fur: '#f7ecdb', furDark: '#e6d1b0', furMid: '#f0e0c7', line: '#4a3326', headHi: '#fffbf5', lid: '#faf1e3', headEdge: '#ecdabd',
    ear: '#f7ecdb', earLine: '#4a3326', earIn: '#f6c3b8', earDeep: '#ec9f96', smoke: '#dcc3a0', sheen: '#ffffff', sheenSoft: '#fbf3e7', cream: '#fffaf3', creamHi: '#ffffff', creamShade: '#f3e6d2',
    bibTop: '#fdf6ec', bibBottom: '#f6ebdc', bibSheen: '#ffffff', paw: '#fcf4e8', toe: '#9c7f62', tuft: '#ffffff', tail: '#fffaf3', tailShade: '#eadcc6',
    nose: '#ec9a9a', noseLine: '#b8686c', whisker: '#6b5240', blush: '#f4b8ae', brow: '#c4a37e', eyeLine: '#2a1d16', lidLine: '#8a6b4d', patch: '', marks: '',
  },
  snow: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', furMid: '#e3ddd2', line: '#5a5249', headHi: '#ffffff', lid: '#f6f3ee', headEdge: '#d8d1c5',
    ear: '#f0ece5', earLine: '#5a5249', earIn: '#f4bcc6', earDeep: '#e5a0ae', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f8f4ee', bibBottom: '#efe8dd', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#9d9284', tail: '#ffffff', tuft: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#5a5249', blush: '#f0a9b2', brow: '#b3a893', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '', marks: '',
  },
  spot: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', furMid: '#e3ddd2', line: '#4f3d30', headHi: '#ffffff', lid: '#f6f3ee', headEdge: '#d8d1c5',
    ear: '#8a5a3c', earLine: '#4f3d30', earIn: '#efb1bb', earDeep: '#dd96a3', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f8f4ee', bibBottom: '#efe8dd', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#9d9284', tail: '#ffffff', tuft: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#4f3d30', blush: '#f0a9b2', brow: '#8a5a3c', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '#8a5a3c', marks: 'patch',
  },
};

// Прежний экспорт по образцу кота и собаки: палитра Пуха по умолчанию.
export const BUNNY_PALETTE = { ...BUNNY_COATS.fawn, ...SCARF, ...RIBBON };

const coatOf = (coat) => (BUNNY_COATS[coat] ? coat : 'fawn');
const has = (c, mark) => c.marks === mark;

// Зеркало пути по вертикали x = 100 (правая половина морды и тела). Пути — только абсолютные команды с парами «x y».
const mirror = (d) => d.replace(/(\d*\.?\d+) (\d*\.?\d+)/g, (_, x, y) => `${+(200 - Number(x)).toFixed(2)} ${y}`);

// Глаза — небольшие, чуть вытянутые по вертикали, на одной высоте; клип по глазу, веки — сплошным цветом.
const EYE_Y = 88;
const EYE_RX = 7.6;
const EYE_RY = 8.8;
const EYES = { l: 82, r: 118 };

function defs(p, c) {
  return `<defs>
    <linearGradient id="${p}-fur" gradientUnits="userSpaceOnUse" x1="60" y1="110" x2="150" y2="192">
      <stop offset="0" stop-color="${c.furLight}"/><stop offset=".5" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-head" gradientUnits="userSpaceOnUse" cx="100" cy="84" r="54">
      <stop offset="0" stop-color="${c.headHi}"/><stop offset=".5" stop-color="${c.lid}"/><stop offset=".82" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.headEdge}"/>
    </radialGradient>
    <linearGradient id="${p}-ear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.earDeep}"/><stop offset=".7" stop-color="${c.earIn}"/><stop offset="1" stop-color="${c.earIn}" stop-opacity=".6"/>
    </linearGradient>
    <linearGradient id="${p}-ear-out" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${c.ear}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-cream" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${c.creamHi}"/><stop offset=".7" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.creamShade}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.bibTop}"/><stop offset=".45" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.bibBottom}"/>
    </linearGradient>
    <radialGradient id="${p}-tail" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="${c.tail}"/><stop offset="1" stop-color="${c.tailShade}"/>
    </radialGradient>
    <radialGradient id="${p}-iris" cx=".45" cy=".62" r=".62">
      <stop offset="0" stop-color="#b8793c"/><stop offset=".5" stop-color="#7a4520"/><stop offset="1" stop-color="#331b0b"/>
    </radialGradient>
    <linearGradient id="${p}-scarf" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${SCARF.scarfLight}"/><stop offset=".55" stop-color="${SCARF.scarf}"/><stop offset="1" stop-color="${SCARF.scarfDark}"/>
    </linearGradient>
    <linearGradient id="${p}-bow" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${RIBBON.pinkLight}"/><stop offset=".55" stop-color="${RIBBON.pink}"/><stop offset="1" stop-color="${RIBBON.pinkDark}"/>
    </linearGradient>
    <linearGradient id="${p}-clover" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${RIBBON.greenLight}"/><stop offset=".55" stop-color="${RIBBON.green}"/><stop offset="1" stop-color="${RIBBON.greenDark}"/>
    </linearGradient>
    <radialGradient id="${p}-ground" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#1d2024" stop-opacity=".3"/><stop offset=".6" stop-color="#1d2024" stop-opacity=".12"/><stop offset="1" stop-color="#1d2024" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${p}-eye-l"><ellipse cx="${EYES.l}" cy="${EYE_Y}" rx="${EYE_RX}" ry="${EYE_RY}"/></clipPath>
    <clipPath id="${p}-eye-r"><ellipse cx="${EYES.r}" cy="${EYE_Y}" rx="${EYE_RX}" ry="${EYE_RY}"/></clipPath>
  </defs>`;
}

// Хвост-помпон за правым бедром; покачивание — поворот у основания.
const TAIL = 'M145 160C148 153.5 158 152.5 162.5 158C167 163.5 165.5 173 158.5 176C152.5 178.5 146 176 144.5 170C143.8 166.5 144 163 145 160Z';
function tail(p, c) {
  return `<g class="bunny-tail">
    <path d="${TAIL}" fill="url(#${p}-tail)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M150 157.5Q154 155 158.5 156.5M161.5 162Q164 165.5 163.5 170" fill="none" stroke="${c.tailShade}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
  </g>`;
}

// Пятна пятнистого: на спине у правого бедра (сидя), на боку (лёжа), на левом бедре.
const SIDE_PATCH = 'M124 140C132 135 143 139 146 148C148.5 156 143 163 135 162C127 161 121 154 121.5 147C121.7 144 122.6 141.8 124 140Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M52 164C57 159 65 161 67 168C68.5 173 64 178 58.5 177C53 176 50 171 51 167Z';

// Сидя: туловище-груша, светлая грудка, линии бёдер, большие задние ступни и две передние лапки.
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
const side = (d, l) => (l ? d : mirror(d));

function sittingBody(p, c) {
  // Передние лапы; левая (.bunny-leg-l) поднимается в позе «лапка» и трёт мордочку в сценке «умывается».
  const leg = (s) => {
    const l = s === 'l';
    return `<g class="bunny-leg-${s}">
      <path d="${side(LEG.fill, l)}" fill="url(#${p}-bib)"/>
      <path d="${side(LEG.side, l)}${LEG.inner}" fill="none" stroke="${c.line}" stroke-width="1.7" stroke-linecap="round"/>
      <path d="${side(LEG.paw, l)}" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
      <path d="${side(LEG.toes, l)}" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  };
  const foot = (l) => `<path d="${side(FOOT_L, l)}" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
    <path d="${side(FOOT_TOES_L, l)}" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  return `<g class="bunny-sit">
    ${tail(p, c)}
    <path class="bunny-torso" d="${TORSO}" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${has(c, 'patch') ? `<path d="${SIDE_PATCH}" fill="${c.patch}" opacity=".9"/><path d="${HIP_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path class="bunny-bib" d="${CHEST}" fill="url(#${p}-bib)" opacity=".95"/>
    <path d="M60 139Q57 147 57.5 154M140 139Q143 147 142.5 154" fill="none" stroke="${c.furDark}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
    <path d="${HAUNCH_L}${mirror(HAUNCH_L)}" fill="none" stroke="${c.line}" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>
    ${foot(true)}${foot(false)}
    ${leg('r')}
    ${leg('l')}
    <path d="M81.5 140q3 3 3 7.5M118.5 140q-3 3-3 7.5M86.5 150q2 2.5 1.5 6M113.5 150q-2 2.5-1.5 6M61 132q-2.5 3-2 6.5M139 132q2.5 3 2 6.5" fill="none" stroke="${c.furDark}" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
  </g>`;
}

// Отдых: распластался — тело низко, задняя лапа вытянута назад, голова на передних лапах. Видна только в позе rest.
function lyingBody(p, c) {
  return `<g class="bunny-lie">
    <path d="M28 188C24 166 50 142 96 140C140 138 176 150 186 172C190 182 184 188 174 188Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${has(c, 'patch') ? `<path d="${LIE_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="M158 150C166 142 180 142 186 150C192 158 188 170 178 172C170 174 160 168 158 160C157.5 156.5 157.7 153 158 150Z" fill="url(#${p}-tail)" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M56 152C86 142 126 142 158 152" fill="none" stroke="${c.sheen}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>
    <path d="M40 168C40 176 44 184 50 188" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".45"/>
  </g>`;
}

function lyingFront(p, c) {
  const paw = (x) => `<path d="M${x} 186Q${x} 179 ${x + 11} 179Q${x + 22} 179 ${x + 22} 186Q${x + 22} 193 ${x + 11} 193Q${x} 193 ${x} 186Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M${x + 8} 187.5v3.8M${x + 14} 187.5v3.8" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  // Задняя лапа вытянута вправо — ступня лежит на боку.
  return `<g class="bunny-lie-front">
    <path d="M150 176C166 174 186 176 196 182C201 186 198 192 190 192Q166 192 146 189Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M179 184v5.5M186 184.5v5.5" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    ${paw(78)}${paw(100)}
  </g>`;
}

// Платок (как у кота, по эталону): полоса на шее, треугольник на груди, узел и два хвостика справа.
const SCARF_BAND = 'M66.5 119.5C82 128 118 128 133.5 119.5L134.5 126.5C118 135 82 135 65.5 126.5Z';
const SCARF_TIP = 'M71 125C85 131.5 115 131.5 129 125C122 137 111 148 100 157C89 148 78 137 71 125Z';
const SCARF_TAILS = 'M131.5 129.5Q138.5 134.5 142.5 146Q136.5 144.5 130.5 137ZM127.5 131Q131.5 139 131.5 149.5Q126.5 145 125.5 136.5Z';
const SCARF_KNOT = 'M124.5 125Q128.5 119.5 134 122.5Q137.5 127 134 131.5Q128.5 133.5 125.5 130Z';

// Аксессуары на шее: платок (scarf), розовый бантик (bow), ленточка с клевером (clover) — виден тот, что в data-acc у svg
// (правила видимости — bunny.css, как у платков кота в pet.css).
function collar(p) {
  const band = (fill, dark) => `<path d="M68 116C82 128 118 128 132 116L133.5 124C118 137 82 137 66.5 124Z" fill="${fill}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M86 125Q99 129 112 127" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>`;
  const bow = (fill, dark, cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})">
      <path d="M0 0Q-9-14-18-8Q-20 2-8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M0 0Q9-14 18-8Q20 2 8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${fill}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="0" cy="1" r="3.6" fill="${fill}" stroke="${dark}" stroke-width="1.3"/>
    </g>`;
  const scarf = `<path d="${SCARF_BAND}" fill="url(#${p}-scarf)" stroke="${SCARF.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="${SCARF_TIP}" fill="url(#${p}-scarf)" stroke="${SCARF.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M90 134Q95.5 142 99.5 150M84 131Q88.5 136 92 140" fill="none" stroke="${SCARF.scarfDark}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
      <path d="M79 128.5Q94 132.5 112 131" fill="none" stroke="#f3b08b" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
      <path d="${SCARF_TAILS}" fill="url(#${p}-scarf)" stroke="${SCARF.scarfDark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="${SCARF_KNOT}" fill="${SCARF.scarf}" stroke="${SCARF.scarfDark}" stroke-width="1.4" stroke-linejoin="round"/>`;
  return `<g class="bunny-collar">
    <g class="cat-acc" data-acc-part="scarf">${scarf}</g>
    <g class="cat-acc" data-acc-part="bow">${band(`url(#${p}-bow)`, RIBBON.pinkDark)}${bow(RIBBON.pink, RIBBON.pinkDark, 100, 128, 1.05)}</g>
    <g class="cat-acc" data-acc-part="clover">${band(`url(#${p}-clover)`, RIBBON.greenDark)}
      <g transform="translate(100 130)">
        <circle cx="0" cy="0" r="6.8" fill="#f7f1e6" stroke="#8b6f5e" stroke-width="1.2"/>
        <g fill="#4f9a55" stroke="#2f5f33" stroke-width=".8"><circle cx="-2.6" cy="-1" r="2.3"/><circle cx="2.6" cy="-1" r="2.3"/><circle cx="0" cy="-3.6" r="2.3"/><circle cx="0" cy="1.8" r="2.3"/></g>
        <path d="M0 2v4" stroke="#2f5f33" stroke-width="1" stroke-linecap="round"/>
      </g>
    </g>
  </g>`;
}

// Глаз: радужка, крупный зрачок, два блика; верхнее веко — дугой по форме глаза с тёмной линией (в покое — над глазом,
// опускается позами), нижнее — дугой снизу.
const lidUp = (cx, y) => `M${cx - 14} ${y - 40}L${cx + 14} ${y - 40}L${cx + 14} ${y + 0.5}L${cx + 9} ${y + 0.5}C${cx + 9} ${y - 12} ${cx - 9} ${y - 12} ${cx - 9} ${y + 0.5}L${cx - 14} ${y + 0.5}Z`;
const lash = (cx, y) => `M${cx - 9} ${y + 0.5}C${cx - 9} ${y - 12} ${cx + 9} ${y - 12} ${cx + 9} ${y + 0.5}`;
const lidDown = (cx, y) => `M${cx - 14} ${y + 40}L${cx + 14} ${y + 40}L${cx + 14} ${y - 0.5}L${cx + 9} ${y - 0.5}C${cx + 9} ${y + 12} ${cx - 9} ${y + 12} ${cx - 9} ${y - 0.5}L${cx - 14} ${y - 0.5}Z`;

function eye(p, s, c) {
  const cx = EYES[s];
  const y = EYE_Y;
  return `<g class="bunny-eye bunny-eye-${s}">
    <g clip-path="url(#${p}-eye-${s})">
      <ellipse cx="${cx}" cy="${y}" rx="${EYE_RX}" ry="${EYE_RY}" fill="url(#${p}-iris)"/>
      <ellipse cx="${cx}" cy="${y}" rx="${EYE_RX}" ry="${EYE_RY}" fill="none" stroke="#24130a" stroke-width="2.4" opacity=".85"/>
      <g class="bunny-look"><ellipse class="bunny-pupil" cx="${cx}" cy="${y - 0.4}" rx="3.9" ry="4.7" fill="#160b05"/></g>
      <circle cx="${cx + 2.4}" cy="${y - 3.4}" r="2.6" fill="#fff"/>
      <circle cx="${cx - 2.6}" cy="${y + 3.6}" r="1.1" fill="#fff" opacity=".85"/>
      <g class="bunny-lid-down"><path d="${lidDown(cx, y)}" fill="${c.lid}"/></g>
      <g class="bunny-lid-up"><path d="${lidUp(cx, y)}" fill="${c.lid}"/><path d="${lash(cx, y)}" fill="none" stroke="${c.eyeLine}" stroke-width="3" stroke-linecap="round"/></g>
    </g>
    <path class="bunny-happy" d="M${cx - 7.5} ${y + 2}Q${cx} ${y - 6.5} ${cx + 7.5} ${y + 2}" fill="none" stroke="${c.eyeLine}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="bunny-sleep" d="M${cx - 7.5} ${y}Q${cx} ${y + 6.5} ${cx + 7.5} ${y}" fill="none" stroke="${c.eyeLine}" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

// Пятно пятнистого вокруг правого глаза (глаз и веко — поверх).
const EYE_PATCH = 'M106 76C111 69 126 69 131 77C134 83 133 95 127 99C121 103 110 102 106.5 96C103 90 103 81 106 76Z';

// Ухо: длинное, шире к середине, кончик скруглён; стоит с наклоном наружу, основание скрыто под головой. Наружная сторона
// с градиентом, внутренняя — розовая почти во всю длину, светлый штрих меха по краю. Правое ухо — зеркало левого, в позах
// отогнуто чуть сильнее (bunny.css).
const EAR_L = 'M68 66C58 50 51.5 29 55 15C57 7 60.5 3 64.5 3.2C70 3.5 77 12 82 22C87.5 33 90.5 46 90 62Z';
const EAR_IN_L = 'M71.5 60C64 46 59.5 29 61 18C62 12 64.5 9 67.5 9.8C71.5 11 76 18 79.5 26C84 36 86 48 85.5 60Z';
const EAR_FUR_L = 'M57.5 31Q57 22 60 14';
function ear(p, s, c) {
  const l = s === 'l';
  return `<g class="bunny-ear bunny-ear-${s}">
    <path d="${side(EAR_L, l)}" fill="url(#${p}-ear-out)" stroke="${c.earLine}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${side(EAR_IN_L, l)}" fill="url(#${p}-ear)"/>
    <path d="${side(EAR_FUR_L, l)}" fill="none" stroke="${c.tuft}" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
  </g>`;
}

// Брови — едва заметные короткие дуги над глазами: двигаются в позах (bunny.css).
const BROW_L = 'M75 75Q81 71.5 87.5 74';
const brow = (s, c) => `<path d="${side(BROW_L, s === 'l')}" fill="none" stroke="${c.brow}" stroke-width="1.9" stroke-linecap="round" opacity=".8"/>`;

// Голова — круглая, шире, чем выше; пушистые щёки (зубцы меха внизу по бокам) и хохолок. Заливка пучка (замкнутый контур,
// тем же градиентом) закрывает обводку головы под ним, обводятся только наружные зубцы — стыков не видно.
const SKULL = 'M100 53.5C121 53.5 136.5 63 141.5 79C144.5 90 145.5 101 141 110C134 120 118 124.5 100 124.5C82 124.5 66 120 59 110C54.5 101 55.5 90 58.5 79C63.5 63 79 53.5 100 53.5Z';
const CHEEK_EDGE_L = 'M57.5 88Q52 91 53 95.5Q48.5 98.5 51.2 103Q48 107.5 53.5 110.5Q53.5 114.8 59.5 114';
const CHEEK_FILL_L = `${CHEEK_EDGE_L}L62.5 108L60.5 99L59.5 88Z`;
const TUFT_EDGE = 'M92.5 58Q91.5 50.5 96 47Q96 51.5 98.8 53.5Q99 47 103.5 44Q102.8 49.5 105.5 52Q108 49.5 111.5 50Q108.5 53.5 109 58';
const MUZZLE = 'M86 101C91 96 96 97.5 100 101C104 97.5 109 96 114 101C122 106 121 117 111 119.5C106 120.8 94 120.8 89 119.5C79 117 78 106 86 101Z';
const WHISKERS_L = 'M68 101.5Q55 99.8 41.5 100.6M68 105Q55 106 42.5 109.8M70.5 108.5Q60 113 49.5 120';

function head(p, c) {
  return `<g class="bunny-head">
    ${ear(p, 'l', c)}${ear(p, 'r', c)}
    <path class="bunny-skull" d="${SKULL}" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="${CHEEK_FILL_L}" fill="url(#${p}-head)"/><path d="${CHEEK_EDGE_L}" fill="none" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${mirror(CHEEK_FILL_L)}" fill="url(#${p}-head)"/><path d="${mirror(CHEEK_EDGE_L)}" fill="none" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M135.5 72C138.5 79 139.8 86 139.5 92M64.5 72C61.5 79 60.2 86 60.5 92" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    ${has(c, 'patch') ? `<path d="${EYE_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="${MUZZLE}" fill="url(#${p}-cream)"/>
    <g class="bunny-tuft">
      <path d="${TUFT_EDGE}Z" fill="url(#${p}-head)"/><path d="${TUFT_EDGE}" fill="none" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M95 52Q96.5 49 97.5 47.5M101.5 50Q102.5 47 103.5 45.5" fill="none" stroke="${c.smoke}" stroke-width="1" stroke-linecap="round" opacity=".8"/>
    </g>
    <g class="bunny-brow-l">${brow('l', c)}</g>
    <g class="bunny-brow-r">${brow('r', c)}</g>
    ${eye(p, 'l', c)}${eye(p, 'r', c)}
    <ellipse cx="70.5" cy="103.5" rx="6.5" ry="4.5" fill="${c.blush}" opacity=".35"/><ellipse cx="129.5" cy="103.5" rx="6.5" ry="4.5" fill="${c.blush}" opacity=".35"/>
    <g class="bunny-nose"><path d="M95.5 99.5Q100 97.6 104.5 99.5Q104 103.8 100 105.6Q96 103.8 95.5 99.5Z" fill="${c.nose}" stroke="${c.noseLine}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M97.6 100.1Q100 99.4 102.4 100.1" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".6"/></g>
    <g class="bunny-mouth bunny-mouth-calm"><path d="M100 105.6V107.6M93.5 108.2Q96.8 111.8 100 107.6Q103.2 111.8 106.5 108.2" fill="none" stroke="${c.eyeLine}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="bunny-mouth bunny-mouth-smile"><path d="M95 108.5Q100 115 105 108.5Q100 110.6 95 108.5Z" fill="#8a3f45"/><path d="M100 105.6V108M92.5 108Q96.5 113 100 108.3Q103.5 113 107.5 108" fill="none" stroke="${c.eyeLine}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="bunny-mouth bunny-mouth-yawn"><path d="M93.5 108Q100 104.8 106.5 108Q109 119 100 121.5Q91 119 93.5 108Z" fill="#5b2a31" stroke="${c.eyeLine}" stroke-width="1.3"/><path d="M95.5 116Q100 113 104.5 116Q103 120 100 120.4Q97 120 95.5 116Z" fill="#d77b80"/></g>
    <g class="bunny-whiskers" fill="none" stroke="${c.whisker}" stroke-width=".85" stroke-linecap="round" opacity=".5">
      <path d="${WHISKERS_L}${mirror(WHISKERS_L)}"/>
    </g>
  </g>`;
}

// Сценка «умывается»: временные «капли» у мордочки — видны только в сценке (bunny.css).
const WASH = '<g class="bunny-wash" fill="#9cc5e8" opacity="0"><circle cx="70" cy="96" r="1.8"/><circle cx="64" cy="106" r="1.3"/><circle cx="76" cy="89" r="1.2"/></g>';

// Полный кролик (боковая панель и сцена) или портрет (телефон, узкая панель, выбор напарника). Класс cat-art — общий
// механизм напарника: позы (data-pose), режим движения, пауза и печать. coat — облик (BUNNY_COATS), неизвестный — палевый.
export function bunnySvg({ id = 'bunny', view = 'full', className = '', box = null, coat = 'fawn' } = {}) {
  const portrait = view === 'portrait';
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = BUNNY_COATS[shown];
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  return `<svg class="cat-art${className ? ` ${className}` : ''}" data-kind="bunny" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="scarf" viewBox="${portrait ? BUNNY_PORTRAIT_VIEWBOX : BUNNY_VIEWBOX}"${place} aria-hidden="true" focusable="false">
    ${defs(p, c)}
    ${portrait ? '' : `<ellipse cx="100" cy="189" rx="64" ry="7" fill="url(#${p}-ground)"/>`}
    <g class="bunny-all">
      ${portrait ? '' : `${lyingBody(p, c)}${sittingBody(p, c)}`}
      ${collar(p)}
      ${head(p, c)}
      ${portrait ? '' : lyingFront(p, c)}
      ${WASH}
    </g>
  </svg>`;
}

// ---------- вещи кролика в уголке (единицы сцены 400×250) ----------

// Морковка — игрушка уголка, доступна сразу; исходное место (40, 232); место — pet-room.mjs («Обустроить уголок»).
export function carrotArt() {
  return `<g class="cat-item" data-item="carrot" data-room="carrot">
      <ellipse cx="40" cy="241" rx="18" ry="2.4" fill="#3a2414" opacity=".16"/>
      <path d="M22 233q2-7 11-7l24 4.5q2.5 2 0 4l-24 4.5q-9 0-11-6z" fill="#ec8b36" stroke="#b3601d" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M31 229.5l2.2 7M39.5 228.5l1.3 8.5M47 230l1.2 5" stroke="#c96f25" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M26 230.5q6-1 12 1" fill="none" stroke="#f6b06c" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
      <path d="M57 232.5q6-9 11-7M57 232.5q9-2 11 4M57 232.5q4 7 9 9" fill="none" stroke="#4f9a55" stroke-width="2.6" stroke-linecap="round"/>
    </g>`;
}

// Пучок сена — вещь кролика со ступени «Наш ритуал»: лежит на коврике справа, перед кружкой (исходное место (280, 236));
// в сцене — с подсветкой новинки.
const HAY = `<path d="M258 239q-2-13 7-20q6-5 13-2q6-8 13-1q8-3 11 6q6 2 5 9q3 6-3 8z" fill="#e2c276" stroke="#a07f2a" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M264 235q8-9 19-10M270 239q9-6 20-5M280 224q7 1 11 7M260 231q6-1 9 3" fill="none" stroke="#b8942f" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>
      <path d="M266 226l-5-6M289 221l3-7M298 229l6-3M274 221l-2-7" stroke="#c9a84a" stroke-width="1.6" stroke-linecap="round"/>`;

export function hayArt({ fresh = false } = {}) {
  return `<g class="cat-item${fresh ? ' is-fresh' : ''}" data-item="hay" data-room="hay">
      <ellipse cx="280" cy="242" rx="21" ry="2.8" fill="#3a2414" opacity=".18"/>
      ${HAY}
    </g>`;
}

// Пучок сена рядом с кроликом в боковой панели — на время реакции «новая вещь».
export function hayMiniSvg() {
  return `<svg class="cat-mini-art" viewBox="252 206 56 42" aria-hidden="true" focusable="false">${hayArt()}</svg>`;
}
