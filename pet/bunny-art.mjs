// Кролик-напарник (с 2026-10-21, 0.4.0): графика. Пух — небольшой палевый кролик с высокими ушами (правое чуть отогнуто),
// чёлкой, круглыми карими глазами с бровями, пухлыми щеками, розовым носом, парой передних зубов, хвостом-помпоном и
// ленточкой на шее. Тот же подход, что у кота и собаки (cat-art.mjs, dog-art.mjs): слоистый SVG прямо в странице, части
// двигает bunny.css через transform и opacity. Масштаб и точка опоры общие: viewBox 0 0 220 204, земля — y = 188, поэтому в
// боковой панели, сцене и портрете кролик встаёт на то же место. Облик — палитра и простые отметины поверх той же геометрии
// (BUNNY_COATS): палевый, белый, пятнистый (белый с бурыми пятнами и бурыми ушами). Модуль без DOM; id — с префиксом экземпляра.

export const BUNNY_VIEWBOX = '0 0 220 204';
export const BUNNY_PORTRAIT_VIEWBOX = '36 -2 128 128';

// Ленточки — общие для всех обликов и тем: голубая (ribbon), розовый бантик (bow), зелёная с клевером (clover).
const RIBBON = { blue: '#6aa7d8', blueLight: '#9cc5e8', blueDark: '#3f6f99', pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' };

// Палитры обликов — одни для светлой и тёмной темы. lid — тон морды у глаз (веки — ровным цветом, иначе при движении
// градиент едет вместе с ними); smoke — тёмные штрихи меха (щёки, бока); ear — наружная сторона ушей (у пятнистого —
// бурая), earIn / earDeep — внутренняя; marks — отметины (patch — бурые пятна на спине, бедре и вокруг правого глаза).
export const BUNNY_COATS = {
  fawn: {
    furLight: '#f6e0bd', fur: '#e4c293', furDark: '#c49c66', furMid: '#d6b07c', line: '#6a4a2c', headHi: '#faeacf', lid: '#eed4a8', headEdge: '#cfa771',
    ear: '#e4c293', earLine: '#6a4a2c', earIn: '#f4bcc3', earDeep: '#e3a0ab', smoke: '#b58a56', sheen: '#fdf1e0', sheenSoft: '#f4e2c5', cream: '#fff7ea', creamHi: '#fffdf8', creamShade: '#efdfc4',
    bibTop: '#f9eedd', bibBottom: '#f3e3cb', bibSheen: '#fffaf2', paw: '#f9ecd8', toe: '#b79a76', tuft: '#fff5e3', tail: '#fff7ec', tailShade: '#e8d2b2',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#eadfca', blush: '#f0a39f', brow: '#a67f4e', eyeLine: '#2b2420', lidLine: '#7d5c38', patch: '', marks: '',
  },
  snow: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', furMid: '#e3ddd2', line: '#6b6358', headHi: '#ffffff', lid: '#f3efe8', headEdge: '#d8d1c5',
    ear: '#f0ece5', earLine: '#6b6358', earIn: '#f4bcc6', earDeep: '#e5a0ae', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d9d1c4', blush: '#f0a9b2', brow: '#b3a893', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '', marks: '',
  },
  spot: {
    furLight: '#ffffff', fur: '#f0ece5', furDark: '#d3cbbe', furMid: '#e3ddd2', line: '#5f4a3b', headHi: '#ffffff', lid: '#f3efe8', headEdge: '#d8d1c5',
    ear: '#8a5a3c', earLine: '#5f4a3b', earIn: '#efb1bb', earDeep: '#dd96a3', smoke: '#c6bdae', sheen: '#ffffff', sheenSoft: '#f7f3ec', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d9d1c4', blush: '#f0a9b2', brow: '#8a5a3c', eyeLine: '#2b2420', lidLine: '#5c544b', patch: '#8a5a3c', marks: 'patch',
  },
};

// Прежний экспорт по образцу кота и собаки: палитра Пуха по умолчанию.
export const BUNNY_PALETTE = { ...BUNNY_COATS.fawn, ...RIBBON };

const coatOf = (coat) => (BUNNY_COATS[coat] ? coat : 'fawn');
const has = (c, mark) => c.marks === mark;

// Глаза — круглые, на одной высоте; клип по глазу, веки — сплошным цветом (как у собаки).
const EYE_Y = 82;
const EYE_R = 9.6;
const EYES = { l: 80, r: 120 };

function defs(p, c) {
  return `<defs>
    <linearGradient id="${p}-fur" gradientUnits="userSpaceOnUse" x1="60" y1="104" x2="150" y2="192">
      <stop offset="0" stop-color="${c.furLight}"/><stop offset=".5" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-head" gradientUnits="userSpaceOnUse" cx="100" cy="74" r="60">
      <stop offset="0" stop-color="${c.headHi}"/><stop offset=".45" stop-color="${c.lid}"/><stop offset=".8" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.headEdge}"/>
    </radialGradient>
    <linearGradient id="${p}-ear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.earDeep}"/><stop offset="1" stop-color="${c.earIn}"/>
    </linearGradient>
    <linearGradient id="${p}-ear-out" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${c.ear}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-cream" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${c.creamHi}"/><stop offset=".7" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.creamShade}"/>
    </radialGradient>
    <linearGradient id="${p}-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.bibTop}"/><stop offset=".35" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.bibBottom}"/>
    </linearGradient>
    <radialGradient id="${p}-tail" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="${c.tail}"/><stop offset="1" stop-color="${c.tailShade}"/>
    </radialGradient>
    <radialGradient id="${p}-iris" cx=".42" cy=".38" r=".7">
      <stop offset="0" stop-color="#b8743a"/><stop offset=".5" stop-color="#6a3a16"/><stop offset="1" stop-color="#2d170a"/>
    </radialGradient>
    <linearGradient id="${p}-ribbon" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${RIBBON.blueLight}"/><stop offset=".55" stop-color="${RIBBON.blue}"/><stop offset="1" stop-color="${RIBBON.blueDark}"/>
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
    <clipPath id="${p}-eye-l"><circle cx="${EYES.l}" cy="${EYE_Y}" r="${EYE_R}"/></clipPath>
    <clipPath id="${p}-eye-r"><circle cx="${EYES.r}" cy="${EYE_Y}" r="${EYE_R}"/></clipPath>
  </defs>`;
}

// Хвост-помпон за правым бедром; покачивание — поворот у основания.
function tail(p, c) {
  return `<g class="bunny-tail">
    <path d="M150 152C157 143 171 143 177 151C182 158 179 169 169 171C160 173 150 168 149 159C148.8 156 149.3 153.5 150 152Z" fill="url(#${p}-tail)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M156 151q4-4 9-2M171 152q4 4 4 8M155 163q2 4 6 5" fill="none" stroke="${c.tailShade}" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
  </g>`;
}

// Пятна пятнистого: на спине у бедра (сидя), на боку (лёжа), на левом бедре.
const SIDE_PATCH = 'M126 136C136 130 152 136 156 148C159 158 150 167 139 165C129 163 122 154 123 145C123.3 141.5 124.3 138.5 126 136Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M48 162C54 156 64 158 66 166C67.5 172 62 177 56 176C50 175 46 169 47 165Z';

function sittingBody(p, c) {
  // Передние лапы — короткие, рядом; левая (.bunny-leg-l) поднимается в позе «лапка» и трёт мордочку в сценке «умывается».
  const leg = (side) => {
    const l = side === 'l';
    const x = l ? 0 : 19;
    return `<g class="bunny-leg-${side}">
      <path d="M${85 + x} 152C${83.5 + x} 162 ${84 + x} 172 ${85 + x} 182L${98 + x} 182C${98 + x} 172 ${98.5 + x} 162 ${99.5 + x} 154Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M${l ? 95.5 : 104.5} 163C${l ? 95.5 : 104.5} 167 ${l ? 95.2 : 104.8} 170 ${l ? 95 : 105} 174" fill="none" stroke="${c.furDark}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
      <path d="M${81.5 + x} 184Q${81.5 + x} 177 ${91.5 + x} 177Q${101.5 + x} 177 ${101.5 + x} 184Q${101.5 + x} 191 ${91.5 + x} 191Q${81.5 + x} 191 ${81.5 + x} 184Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
      <path d="M${87.5 + x} 185.5v4.2M${91.5 + x} 185v5M${95.5 + x} 185.5v4.2" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  };
  // Задние лапы — широкие ступни вперёд по бокам от передних, под бёдрами.
  const foot = (x) => `<path d="M${x} 187Q${x} 180 ${x + 14} 180Q${x + 28} 180 ${x + 28} 187Q${x + 28} 193.5 ${x + 14} 193.5Q${x} 193.5 ${x} 187Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M${x + 9} 188v4.2M${x + 14} 187.5v5.2M${x + 19} 188v4.2" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  return `<g class="bunny-sit">
    ${tail(p, c)}
    <path class="bunny-torso" d="M82 112C66 120 56 136 54 152C42 157 34 172 40 182C44 187 52 188 62 188L138 188C148 188 156 187 160 182C166 172 158 157 146 152C144 136 134 120 118 112Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${has(c, 'patch') ? `<path d="${SIDE_PATCH}" fill="${c.patch}" opacity=".9"/><path d="${HIP_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="M56 154C66 158 72 168 73 180M144 154C134 158 128 168 127 180" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".45"/>
    <path d="M46 166C44 173 46 180 52 185M60 128Q56 134 56 140M174 166C176 173 174 180 168 185" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <path d="M48 176q3-6 9-7M51 182q3-4 7-5M152 176q-3-6-9-7M149 182q-3-4-7-5" fill="none" stroke="${c.sheenSoft}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
    ${foot(42)}${foot(130)}
    ${leg('r')}
    ${leg('l')}
    <path class="bunny-bib" d="M86 116C80 128 78 142 80 156Q85 158 88 164Q92 159 96 165Q100 159 104 165Q108 159 112 164Q115 158 120 156C122 142 120 128 114 116Z" fill="url(#${p}-bib)"/>
    <path d="M91 132q3.5 4 .5 9M109 130q-3.5 4-.5 9M100 142q2 4 0 8" fill="none" stroke="${c.bibSheen}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
    <ellipse cx="100" cy="121" rx="31" ry="8" fill="#2a2d33" opacity=".14"/>
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
    <path d="M${x + 7} 187.5v3.8M${x + 11} 187v4.6M${x + 15} 187.5v3.8" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  // Задняя лапа вытянута вправо — ступня лежит на боку.
  return `<g class="bunny-lie-front">
    <path d="M150 176C166 174 186 176 196 182C201 186 198 192 190 192Q166 192 146 189Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M176 183v6M183 183.5v6M190 184.5v5" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    ${paw(78)}${paw(100)}
  </g>`;
}

// Ленточка на шее: три варианта (голубая с бантиком сбоку, розовый бантик спереди, зелёная с клевером) — виден тот, что в
// data-acc у svg (правила видимости — bunny.css, как у платков кота в pet.css).
function collar(p) {
  const band = (fill, dark) => `<path d="M68 112C82 125 118 125 132 112L133.5 120.5C118 134 82 134 66.5 120.5Z" fill="${fill}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M86 120.5Q99 125 112 123" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>`;
  const bow = (fill, dark, cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})">
      <path d="M0 0Q-9-14-18-8Q-20 2-8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M0 0Q9-14 18-8Q20 2 8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${fill}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="0" cy="1" r="3.6" fill="${fill}" stroke="${dark}" stroke-width="1.3"/>
    </g>`;
  return `<g class="bunny-collar">
    <g class="cat-acc" data-acc-part="ribbon">${band(`url(#${p}-ribbon)`, RIBBON.blueDark)}${bow(RIBBON.blue, RIBBON.blueDark, 72, 120, 0.8)}</g>
    <g class="cat-acc" data-acc-part="bow">${band(`url(#${p}-bow)`, RIBBON.pinkDark)}${bow(RIBBON.pink, RIBBON.pinkDark, 100, 124, 1.05)}</g>
    <g class="cat-acc" data-acc-part="clover">${band(`url(#${p}-clover)`, RIBBON.greenDark)}
      <g transform="translate(100 126)">
        <circle cx="0" cy="0" r="6.8" fill="#f7f1e6" stroke="#8b6f5e" stroke-width="1.2"/>
        <g fill="#4f9a55" stroke="#2f5f33" stroke-width=".8"><circle cx="-2.6" cy="-1" r="2.3"/><circle cx="2.6" cy="-1" r="2.3"/><circle cx="0" cy="-3.6" r="2.3"/><circle cx="0" cy="1.8" r="2.3"/></g>
        <path d="M0 2v4" stroke="#2f5f33" stroke-width="1" stroke-linecap="round"/>
      </g>
    </g>
  </g>`;
}

function eye(p, side, c) {
  const cx = EYES[side];
  const y = EYE_Y;
  return `<g class="bunny-eye bunny-eye-${side}">
    <g clip-path="url(#${p}-eye-${side})">
      <circle cx="${cx}" cy="${y}" r="${EYE_R}" fill="url(#${p}-iris)"/>
      <circle cx="${cx}" cy="${y}" r="${EYE_R}" fill="none" stroke="#2d170a" stroke-width="2.6" opacity=".8"/>
      <g class="bunny-look"><circle class="bunny-pupil" cx="${cx}" cy="${y + 0.5}" r="5" fill="#120904"/></g>
      <circle cx="${cx + 3.2}" cy="${y - 3.8}" r="2.8" fill="#fff"/>
      <circle cx="${cx - 3}" cy="${y + 3.6}" r="1.2" fill="#fff" opacity=".8"/>
      <g class="bunny-lid-down"><path d="M${cx - 13} ${y + 11}Q${cx} ${y + 6} ${cx + 13} ${y + 11}L${cx + 13} ${y + 30}L${cx - 13} ${y + 30}Z" fill="${c.lid}"/><path d="M${cx - 8} ${y + 9.2}Q${cx} ${y + 6} ${cx + 8} ${y + 9.2}" fill="none" stroke="${c.lidLine}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></g>
      <g class="bunny-lid-up"><path d="M${cx - 13} ${y - 36}L${cx + 13} ${y - 36}L${cx + 13} ${y - 9.6}Q${cx} ${y - 5} ${cx - 13} ${y - 9.6}Z" fill="${c.lid}"/><path d="M${cx - 13} ${y - 9.6}Q${cx} ${y - 5} ${cx + 13} ${y - 9.6}" fill="none" stroke="${c.eyeLine}" stroke-width="1.8"/></g>
    </g>
    <path class="bunny-happy" d="M${cx - 9} ${y + 2.5}Q${cx} ${y - 7.5} ${cx + 9} ${y + 2.5}" fill="none" stroke="${c.eyeLine}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="bunny-sleep" d="M${cx - 8.5} ${y + 0.5}Q${cx} ${y + 7.5} ${cx + 8.5} ${y + 0.5}" fill="none" stroke="${c.eyeLine}" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

// Пятно пятнистого вокруг правого глаза (глаз и веко — поверх).
const EYE_PATCH = 'M107 67C113 60 128 60 133 69C137 75 136 88 130 93C124 98 111 97 107.5 91C103.5 85 103 72 107 67Z';

// Ухо: наружная сторона с градиентом, внутренняя — розовая, светлые штрихи меха. Правое ухо чуть отогнуто (bunny.css).
function ear(p, side, c) {
  const l = side === 'l';
  const outer = l ? 'M74 60C62 44 62 16 73 6C82 -1 93 8 95 26C96 40 93 52 89 61Z' : 'M146 60C158 44 158 16 147 6C138 -1 127 8 125 26C124 40 127 52 131 61Z';
  const inner = l ? 'M79 56C71 42 71 22 78 13C83 8 89 15 89.5 28C90 40 87.5 50 85 56.5Z' : 'M141 56C149 42 149 22 142 13C137 8 131 15 130.5 28C130 40 132.5 50 135 56.5Z';
  const lines = l ? 'M72 40Q71 26 76 14M68 48Q67 38 69 30' : 'M148 40Q149 26 144 14M152 48Q153 38 151 30';
  return `<g class="bunny-ear bunny-ear-${side}">
    <path d="${outer}" fill="url(#${p}-ear-out)" stroke="${c.earLine}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${inner}" fill="url(#${p}-ear)"/>
    <path d="${lines}" fill="none" stroke="${c.tuft}" stroke-width="1.2" stroke-linecap="round" opacity=".75"/>
  </g>`;
}

// Брови — короткие дуги над глазами: двигаются в позах (bunny.css).
const brow = (side, c) => `<path d="${side === 'l' ? 'M70 66Q79 61 88 65' : 'M112 65Q121 61 130 66'}" fill="none" stroke="${c.brow}" stroke-width="2.6" stroke-linecap="round" opacity=".65"/>`;

function head(p, c) {
  return `<g class="bunny-head">
    ${ear(p, 'l', c)}${ear(p, 'r', c)}
    <path class="bunny-skull" d="M100 44C126 44 144 58 147 80C149 94 144 108 134 116C126 122 114 126 100 126C86 126 74 122 66 116C56 108 51 94 53 80C56 58 74 44 100 44Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M142 70C144 78 145 86 143 94M58 70C56 78 55 86 57 94" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    <path d="M62 100q-7 2-11 7M64 108q-6 3-8 8M138 100q7 2 11 7M136 108q6 3 8 8M84 54Q82 59 83 64M116 54Q118 59 117 64" fill="none" stroke="${c.smoke}" stroke-width="2.1" stroke-linecap="round" opacity=".55"/>
    ${has(c, 'patch') ? `<path d="${EYE_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="M84 98C90 92 96 94 100 99C104 94 110 92 116 98C126 104 124 118 112 121C106 122.5 94 122.5 88 121C76 118 74 104 84 98Z" fill="url(#${p}-cream)"/>
    <g class="bunny-tuft">
      <path d="M88 52C92 42 102 38 112 44C108 44 105 48 105 52C102 46 98 47 96 53C95 47 91 48 88 52Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M92 48Q96 43 101 42M98 49Q100 45 104 44" fill="none" stroke="${c.tuft}" stroke-width="1" stroke-linecap="round" opacity=".85"/>
    </g>
    <g class="bunny-brow-l">${brow('l', c)}</g>
    <g class="bunny-brow-r">${brow('r', c)}</g>
    ${eye(p, 'l', c)}${eye(p, 'r', c)}
    <circle cx="70" cy="104" r="7" fill="${c.blush}" opacity=".4"/><circle cx="130" cy="104" r="7" fill="${c.blush}" opacity=".4"/>
    <g class="bunny-nose"><path d="M95 99.5Q100 97 105 99.5Q104.5 105 100 107.5Q95.5 105 95 99.5Z" fill="${c.nose}" stroke="${c.noseLine}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M97.4 100.2Q100 99.4 102.6 100.2" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".55"/></g>
    <g class="bunny-mouth bunny-mouth-calm"><path d="M100 107.5V111M93 113Q97 116 100 111Q103 116 107 113" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M97.2 113.6h5.6v3.6q-2.8 1.3-5.6 0z" fill="#fff" stroke="#8a7f80" stroke-width=".8" stroke-linejoin="round"/><path d="M100 113.8v3.4" stroke="#b9afb0" stroke-width=".8"/></g>
    <g class="bunny-mouth bunny-mouth-smile"><path d="M94 112.5Q100 120 106 112.5Q100 114.8 94 112.5Z" fill="#8a3f45"/><path d="M100 107.5V111.5M91.5 112Q96 117.5 100 112.2Q104 117.5 108.5 112" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M97.2 113.2h5.6v3.4q-2.8 1.2-5.6 0z" fill="#fff" stroke="#8a7f80" stroke-width=".8" stroke-linejoin="round"/><path d="M100 113.4v3.2" stroke="#b9afb0" stroke-width=".8"/></g>
    <g class="bunny-mouth bunny-mouth-yawn"><path d="M93 111Q100 107.5 107 111Q109.5 122 100 125Q90.5 122 93 111Z" fill="#5b2a31" stroke="#4a4045" stroke-width="1.3"/><path d="M95.2 119.5Q100 116.5 104.8 119.5Q103 123.8 100 124.1Q97 123.8 95.2 119.5Z" fill="#d77b80"/><path d="M97 111.6h6v3.4q-3 1.2-6 0z" fill="#fff"/></g>
    <g class="bunny-whiskers" fill="none" stroke="${c.whisker}" stroke-width=".95" stroke-linecap="round" opacity=".95">
      <path d="M85 104Q66 98 44 99M85 107Q64 106 42 109M86 110Q66 113 46 119M115 104Q134 98 156 99M115 107Q136 106 158 109M114 110Q134 113 154 119"/>
    </g>
  </g>`;
}

// Сценка «умывается»: временные «капли» у мордочки — видны только в сценке (bunny.css).
const WASH = '<g class="bunny-wash" fill="#9cc5e8" opacity="0"><circle cx="70" cy="92" r="1.8"/><circle cx="64" cy="102" r="1.3"/><circle cx="76" cy="85" r="1.2"/></g>';

// Полный кролик (боковая панель и сцена) или портрет (телефон, узкая панель, выбор напарника). Класс cat-art — общий
// механизм напарника: позы (data-pose), режим движения, пауза и печать. coat — облик (BUNNY_COATS), неизвестный — палевый.
export function bunnySvg({ id = 'bunny', view = 'full', className = '', box = null, coat = 'fawn' } = {}) {
  const portrait = view === 'portrait';
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = BUNNY_COATS[shown];
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  return `<svg class="cat-art${className ? ` ${className}` : ''}" data-kind="bunny" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="ribbon" viewBox="${portrait ? BUNNY_PORTRAIT_VIEWBOX : BUNNY_VIEWBOX}"${place} aria-hidden="true" focusable="false">
    ${defs(p, c)}
    ${portrait ? '' : `<ellipse cx="102" cy="189" rx="72" ry="7.5" fill="url(#${p}-ground)"/>`}
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
