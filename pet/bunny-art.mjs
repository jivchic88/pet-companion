// Кролик-напарник (с 2026-10-21, 0.4.0): графика. Пух — небольшой кролик с высокими ушами (правое чуть отогнуто),
// хохолком, круглыми тёмными глазами, розовым носом, парой передних зубов, пушистым хвостом-помпоном и ленточкой на шее.
// Тот же подход, что у кота и собаки (cat-art.mjs, dog-art.mjs): слоистый SVG прямо в странице, части двигает bunny.css
// через transform и opacity. Масштаб и точка опоры общие: viewBox 0 0 220 204, земля — y = 188, поэтому в боковой панели,
// сцене и портрете кролик встаёт на то же место. Облик — палитра и простые отметины поверх той же геометрии (BUNNY_COATS):
// белый, серый, пятнистый (белый с бурыми пятнами и бурыми ушами). Модуль без DOM; id — с префиксом экземпляра.

export const BUNNY_VIEWBOX = '0 0 220 204';
export const BUNNY_PORTRAIT_VIEWBOX = '40 -4 120 120';

// Ленточки — общие для всех обликов и тем: голубая (ribbon), розовый бантик (bow), зелёная с клевером (clover).
const RIBBON = { blue: '#6aa7d8', blueLight: '#9cc5e8', blueDark: '#3f6f99', pink: '#e07a97', pinkLight: '#f2a7bc', pinkDark: '#9e4a62', green: '#6fae73', greenLight: '#9dcb9f', greenDark: '#3f7444' };

// Палитры обликов — одни для светлой и тёмной темы. lid — тон морды у глаз (веки — ровным цветом, иначе при движении
// градиент едет вместе с ними); ear — наружная сторона ушей (у пятнистого — бурая), earIn / earDeep — внутренняя;
// marks — отметины (patch — бурые пятна на спине, боку и вокруг правого глаза).
export const BUNNY_COATS = {
  snow: {
    furLight: '#fdfcfa', fur: '#f1eee8', furDark: '#d8d2c7', furMid: '#e6e1d8', line: '#6f6358', headHi: '#ffffff', lid: '#f4f1eb', headEdge: '#dcd6cb',
    ear: '#f1eee8', earLine: '#6f6358', earIn: '#f4bcc6', earDeep: '#e5a0ae', sheen: '#ffffff', sheenSoft: '#f8f5f0', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d3cbc0', blush: '#f0a9b2', eyeLine: '#2b2420', lidLine: '#4a403a', patch: '', marks: '',
  },
  grey: {
    furLight: '#cdcac5', fur: '#aeaba6', furDark: '#88847e', furMid: '#9c9893', line: '#46423d', headHi: '#d6d3ce', lid: '#c2bfba', headEdge: '#8f8b85',
    ear: '#aeaba6', earLine: '#46423d', earIn: '#ebb3bd', earDeep: '#d796a3', sheen: '#e2dfda', sheenSoft: '#d4d1cc', cream: '#f4eee5', creamHi: '#fbf7f0', creamShade: '#ddd3c6',
    bibTop: '#ebe4d9', bibBottom: '#e3dacd', bibSheen: '#fffaf2', paw: '#ece6dc', toe: '#a1958a', tuft: '#e8e5e0', tail: '#f4f1ec', tailShade: '#cbc7c1',
    nose: '#dc93a0', noseLine: '#9e5c68', whisker: '#dedad4', blush: '#d9a0a8', eyeLine: '#1f1b18', lidLine: '#3a3531', patch: '', marks: '',
  },
  spot: {
    furLight: '#fdfcfa', fur: '#f1eee8', furDark: '#d8d2c7', furMid: '#e6e1d8', line: '#5f4a3b', headHi: '#ffffff', lid: '#f4f1eb', headEdge: '#dcd6cb',
    ear: '#8a5a3c', earLine: '#5f4a3b', earIn: '#efb1bb', earDeep: '#dd96a3', sheen: '#ffffff', sheenSoft: '#f8f5f0', cream: '#fff9f2', creamHi: '#ffffff', creamShade: '#ebe2d4',
    bibTop: '#f6f0e6', bibBottom: '#efe6d7', bibSheen: '#ffffff', paw: '#f8f3ea', toe: '#b9ad9d', tuft: '#ffffff', tail: '#ffffff', tailShade: '#e4ded4',
    nose: '#e8a0ac', noseLine: '#b06672', whisker: '#d3cbc0', blush: '#f0a9b2', eyeLine: '#2b2420', lidLine: '#4a403a', patch: '#8a5a3c', marks: 'patch',
  },
};

// Прежний экспорт по образцу кота и собаки: палитра Пуха по умолчанию.
export const BUNNY_PALETTE = { ...BUNNY_COATS.snow, ...RIBBON };

const coatOf = (coat) => (BUNNY_COATS[coat] ? coat : 'snow');
const has = (c, mark) => c.marks === mark;

// Глаза — круглые, на одной высоте; клип по глазу, веки — сплошным цветом (как у собаки).
const EYE_Y = 78;
const EYE_R = 8.6;
const EYES = { l: 82, r: 118 };

function defs(p, c) {
  return `<defs>
    <linearGradient id="${p}-fur" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="150" y2="192">
      <stop offset="0" stop-color="${c.furLight}"/><stop offset=".55" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-head" gradientUnits="userSpaceOnUse" cx="100" cy="72" r="58">
      <stop offset="0" stop-color="${c.headHi}"/><stop offset=".5" stop-color="${c.lid}"/><stop offset=".85" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.headEdge}"/>
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
      <stop offset="0" stop-color="#8f5a2e"/><stop offset=".5" stop-color="#4f2c14"/><stop offset="1" stop-color="#23130a"/>
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

// Хвост-помпон за правым бедром; «виляние» — лёгкое покачивание у основания.
function tail(p, c) {
  return `<g class="bunny-tail">
    <path d="M152 150C160 142 174 143 180 152C185 160 181 171 171 173C162 175 151 170 150 160C149.5 156 150 152.5 152 150Z" fill="url(#${p}-tail)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M158 150q4-5 10-3M174 152q4 4 4 9M156 164q2 5 7 6" fill="none" stroke="${c.tailShade}" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
  </g>`;
}

// Пятна пятнистого: на спине у бедра (сидя), на боку (лёжа).
const SIDE_PATCH = 'M128 134C138 128 154 134 158 146C161 156 152 165 141 163C131 161 124 152 125 143C125.3 139.5 126.3 136.5 128 134Z';
const LIE_PATCH = 'M152 150C162 146 176 151 179 161C181 169 173 175 164 174C155 173 149 166 149.5 159C149.7 155.5 150.5 152.5 152 150Z';
const HIP_PATCH = 'M44 162C50 156 60 158 62 166C63.5 172 58 177 52 176C46 175 42 169 43 165Z';

function sittingBody(p, c) {
  // Передние лапы — короткие; левая (.bunny-leg-l) поднимается в позе «лапа» и трёт мордочку в сценке «умывается».
  const leg = (side) => {
    const l = side === 'l';
    const x = l ? 0 : 20;
    return `<g class="bunny-leg-${side}">
      <path d="M${84 + x} 154C${82.5 + x} 164 ${83 + x} 174 ${84 + x} 182L${97 + x} 182C${97 + x} 174 ${97.5 + x} 164 ${99 + x} 156Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M${l ? 95 : 105} 160C${l ? 95 : 105} 165 ${l ? 94.6 : 105.4} 169 ${l ? 94.4 : 105.6} 173" fill="none" stroke="${c.furDark}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
      <path d="M${80 + x} 183Q${80 + x} 176 ${90.5 + x} 176Q${101 + x} 176 ${101 + x} 183Q${101 + x} 190.5 ${90.5 + x} 190.5Q${80 + x} 190.5 ${80 + x} 183Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
      <path d="M${86.5 + x} 184.5v4.5M${90.5 + x} 184v5.5M${94.5 + x} 184.5v4.5" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  };
  // Задние лапы — широкие ступни вперёд по бокам от передних.
  const foot = (x) => `<path d="M${x} 186.5Q${x} 179.5 ${x + 14} 179.5Q${x + 28} 179.5 ${x + 28} 186.5Q${x + 28} 193 ${x + 14} 193Q${x} 193 ${x} 186.5Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M${x + 9} 187.5v4.2M${x + 14} 187v5.2M${x + 19} 187.5v4.2" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  return `<g class="bunny-sit">
    ${tail(p, c)}
    <path class="bunny-torso" d="M80 108C66 116 56 132 54 150C44 156 38 170 40 178C41.5 185 48 188 58 188L142 188C152 188 158.5 185 160 178C162 170 156 156 146 150C144 132 134 116 120 108Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path class="bunny-hip" d="M38 170C36 158 44 148 56 148C64 148 70 154 70 164C70 176 62 186 50 186C42 186 38 178 38 170ZM182 170C184 158 176 148 164 148C156 148 150 154 150 164C150 176 158 186 170 186C178 186 182 178 182 170Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    ${has(c, 'patch') ? `<path d="${SIDE_PATCH}" fill="${c.patch}" opacity=".9"/><path d="${HIP_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="M60 152C68 156 74 166 74 178M140 152C132 156 126 166 126 178" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".45"/>
    <path d="M46 162C44 170 46 178 52 183M174 162C176 170 174 178 168 183" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    <path class="bunny-bib" d="M84 112C78 124 76 138 79 152Q84 155 86 161Q90 156 94 162Q98 156 100 163Q102 156 106 162Q110 156 114 161Q116 155 121 152C124 138 122 124 116 112Z" fill="url(#${p}-bib)"/>
    <path d="M90 130q3.5 4 .5 9M110 128q-3.5 4-.5 9M100 140q2 4 0 8" fill="none" stroke="${c.bibSheen}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
    <ellipse cx="100" cy="118" rx="30" ry="8" fill="#2a2d33" opacity=".14"/>
    ${foot(38)}${foot(154)}
    ${leg('r')}
    ${leg('l')}
  </g>`;
}

// Отдых: распластался — тело низко, задняя лапа вытянута назад, голова на передних лапах. Видна только в позе rest.
function lyingBody(p, c) {
  return `<g class="bunny-lie">
    <path d="M26 188C22 166 48 142 96 140C140 138 176 150 186 172C190 182 184 188 174 188Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
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
// data-acc у svg (правила видимости — общие с котом, pet.css).
function collar(p) {
  const band = (fill, dark) => `<path d="M66 110C80 123 120 123 134 110L135.5 118.5C120 132 80 132 64.5 118.5Z" fill="${fill}" stroke="${dark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M84 118.5Q98 123 112 121" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>`;
  const bow = (fill, dark, cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})">
      <path d="M0 0Q-9-14-18-8Q-20 2-8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M0 0Q9-14 18-8Q20 2 8 6Z" fill="${fill}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-2 4Q-8 12-6 18M2 4Q8 12 6 18" fill="none" stroke="${fill}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="0" cy="1" r="3.6" fill="${fill}" stroke="${dark}" stroke-width="1.3"/>
    </g>`;
  return `<g class="bunny-collar">
    <g class="cat-acc" data-acc-part="ribbon">${band(`url(#${p}-ribbon)`, RIBBON.blueDark)}${bow(RIBBON.blue, RIBBON.blueDark, 70, 118, 0.8)}</g>
    <g class="cat-acc" data-acc-part="bow">${band(`url(#${p}-bow)`, RIBBON.pinkDark)}${bow(RIBBON.pink, RIBBON.pinkDark, 100, 122, 1.05)}</g>
    <g class="cat-acc" data-acc-part="clover">${band(`url(#${p}-clover)`, RIBBON.greenDark)}
      <g transform="translate(100 124)">
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
      <circle cx="${cx}" cy="${y}" r="${EYE_R}" fill="none" stroke="#2a160a" stroke-width="2.4" opacity=".8"/>
      <g class="bunny-look"><circle class="bunny-pupil" cx="${cx}" cy="${y + 0.4}" r="4.4" fill="#120904"/></g>
      <circle cx="${cx + 2.8}" cy="${y - 3.4}" r="2.6" fill="#fff"/>
      <circle cx="${cx - 2.8}" cy="${y + 3.2}" r="1.1" fill="#fff" opacity=".8"/>
      <g class="bunny-lid-down"><path d="M${cx - 12} ${y + 10}Q${cx} ${y + 5.5} ${cx + 12} ${y + 10}L${cx + 12} ${y + 28}L${cx - 12} ${y + 28}Z" fill="${c.lid}"/><path d="M${cx - 7.5} ${y + 8.4}Q${cx} ${y + 5.5} ${cx + 7.5} ${y + 8.4}" fill="none" stroke="${c.lidLine}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></g>
      <g class="bunny-lid-up"><path d="M${cx - 12} ${y - 34}L${cx + 12} ${y - 34}L${cx + 12} ${y - 9}Q${cx} ${y - 4.6} ${cx - 12} ${y - 9}Z" fill="${c.lid}"/><path d="M${cx - 12} ${y - 9}Q${cx} ${y - 4.6} ${cx + 12} ${y - 9}" fill="none" stroke="${c.eyeLine}" stroke-width="1.8"/></g>
    </g>
    <path class="bunny-happy" d="M${cx - 8.4} ${y + 2.2}Q${cx} ${y - 7} ${cx + 8.4} ${y + 2.2}" fill="none" stroke="${c.eyeLine}" stroke-width="2.5" stroke-linecap="round"/>
    <path class="bunny-sleep" d="M${cx - 8} ${y + 0.5}Q${cx} ${y + 7} ${cx + 8} ${y + 0.5}" fill="none" stroke="${c.eyeLine}" stroke-width="2.3" stroke-linecap="round"/>
  </g>`;
}

// Пятно пятнистого вокруг правого глаза (глаз и веко — поверх).
const EYE_PATCH = 'M106 64C112 58 126 58 131 66C135 72 134 84 128 89C122 94 110 93 106.5 87C103 81 102.5 69 106 64Z';

// Ухо: наружная сторона с градиентом, внутренняя — розовая, пара светлых штрихов. Правое ухо чуть отогнуто (bunny.css).
function ear(p, side, c) {
  const l = side === 'l';
  const outer = l ? 'M76 60C66 44 64 20 72 8C78-1 88 2 92 14C96 26 96 44 92 60Z' : 'M144 60C154 44 156 20 148 8C142-1 132 2 128 14C124 26 124 44 128 60Z';
  const inner = l ? 'M80 56C73 42 72 22 77 13C80 8 86 10 88 18C91 30 90 44 88 56Z' : 'M140 56C147 42 148 22 143 13C140 8 134 10 132 18C129 30 130 44 132 56Z';
  const lines = l ? 'M74 36Q74 24 78 15M70 44Q69 34 71 26' : 'M146 36Q146 24 142 15M150 44Q151 34 149 26';
  return `<g class="bunny-ear bunny-ear-${side}">
    <path d="${outer}" fill="url(#${p}-ear-out)" stroke="${c.earLine}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${inner}" fill="url(#${p}-ear)"/>
    <path d="${lines}" fill="none" stroke="${c.tuft}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
  </g>`;
}

function head(p, c) {
  return `<g class="bunny-head">
    ${ear(p, 'l', c)}${ear(p, 'r', c)}
    <path class="bunny-skull" d="M100 46C124 46 142 60 144 82C145 98 136 114 118 120C112 122 106 123 100 123C94 123 88 122 82 120C64 114 55 98 56 82C58 60 76 46 100 46Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M140 72C142 80 142 88 140 96M60 72C58 80 58 88 60 96" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    ${has(c, 'patch') ? `<path d="${EYE_PATCH}" fill="${c.patch}" opacity=".9"/>` : ''}
    <path d="M86 96C91 91 96 93 100 97C104 93 109 91 114 96C124 102 122 116 110 119C105 120.5 95 120.5 90 119C78 116 76 102 86 96Z" fill="url(#${p}-cream)"/>
    <g class="bunny-tuft">
      <path d="M93 50C94 42 99 38 106 40C103 42 101 45 101.5 49C99 46 96 48 95 53Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M96 48Q98 43 102 42" fill="none" stroke="${c.tuft}" stroke-width="1" stroke-linecap="round" opacity=".85"/>
    </g>
    ${eye(p, 'l', c)}${eye(p, 'r', c)}
    <circle cx="74" cy="100" r="6.5" fill="${c.blush}" opacity=".42"/><circle cx="126" cy="100" r="6.5" fill="${c.blush}" opacity=".42"/>
    <g class="bunny-nose"><path d="M95.5 97.5Q100 95.5 104.5 97.5Q104 102.5 100 104.5Q96 102.5 95.5 97.5Z" fill="${c.nose}" stroke="${c.noseLine}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M97.6 98.2Q100 97.5 102.4 98.2" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".55"/></g>
    <g class="bunny-mouth bunny-mouth-calm"><path d="M100 104.5V108M93.5 110Q97 113 100 108Q103 113 106.5 110" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M97.2 110.6h5.6v3.6q-2.8 1.3-5.6 0z" fill="#fff" stroke="#8a7f80" stroke-width=".8" stroke-linejoin="round"/><path d="M100 110.8v3.4" stroke="#b9afb0" stroke-width=".8"/></g>
    <g class="bunny-mouth bunny-mouth-smile"><path d="M94.5 109.5Q100 117 105.5 109.5Q100 111.8 94.5 109.5Z" fill="#8a3f45"/><path d="M100 104.5V108.5M92 109Q96 114.5 100 109.2Q104 114.5 108 109" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M97.2 110.2h5.6v3.4q-2.8 1.2-5.6 0z" fill="#fff" stroke="#8a7f80" stroke-width=".8" stroke-linejoin="round"/><path d="M100 110.4v3.2" stroke="#b9afb0" stroke-width=".8"/></g>
    <g class="bunny-mouth bunny-mouth-yawn"><path d="M93 108Q100 104.5 107 108Q109.5 119 100 122Q90.5 119 93 108Z" fill="#5b2a31" stroke="#4a4045" stroke-width="1.3"/><path d="M95.2 116.5Q100 113.5 104.8 116.5Q103 120.8 100 121.1Q97 120.8 95.2 116.5Z" fill="#d77b80"/><path d="M97 108.6h6v3.4q-3 1.2-6 0z" fill="#fff"/></g>
    <g class="bunny-whiskers" fill="none" stroke="${c.whisker}" stroke-width=".95" stroke-linecap="round" opacity=".95">
      <path d="M86 102Q68 96 46 97M86 105Q66 104 44 107M87 108Q68 111 48 117M114 102Q132 96 154 97M114 105Q134 104 156 107M113 108Q132 111 152 117"/>
    </g>
  </g>`;
}

// Сценка «умывается»: временные «капли» у мордочки — видны только в сценке (bunny.css).
const WASH = '<g class="bunny-wash" fill="#9cc5e8" opacity="0"><circle cx="70" cy="90" r="1.8"/><circle cx="64" cy="100" r="1.3"/><circle cx="76" cy="83" r="1.2"/></g>';

// Полный кролик (боковая панель и сцена) или портрет (телефон, узкая панель, выбор напарника). Класс cat-art — общий
// механизм напарника: позы (data-pose), режим движения, пауза и печать. coat — облик (BUNNY_COATS), неизвестный — белый.
export function bunnySvg({ id = 'bunny', view = 'full', className = '', box = null, coat = 'snow' } = {}) {
  const portrait = view === 'portrait';
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = BUNNY_COATS[shown];
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  return `<svg class="cat-art${className ? ` ${className}` : ''}" data-kind="bunny" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="ribbon" viewBox="${portrait ? BUNNY_PORTRAIT_VIEWBOX : BUNNY_VIEWBOX}"${place} aria-hidden="true" focusable="false">
    ${defs(p, c)}
    ${portrait ? '' : `<ellipse cx="104" cy="189" rx="74" ry="7.5" fill="url(#${p}-ground)"/>`}
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
