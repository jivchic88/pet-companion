// Собака-напарник (с 2026-10-08): графика. Тоби — небольшой карамельный пёс с тёмными висячими
// ушами (правое чуть приподнимается), вихром, кремовой мордой, грудью и лапами, карими глазами,
// округлым тёмным носом, пушистым хвостом и терракотовым платком. Тот же подход, что у кота
// (cat-art.mjs): слоистый SVG прямо в странице, части двигает dog.css через transform и opacity.
// Масштаб и точка опоры — как у кота: viewBox 0 0 220 204, земля — y = 188, поэтому в боковой
// панели, сцене и портрете пёс встаёт на то же место. Облик (с 2026-10-08) — палитра и простые отметины
// поверх той же геометрии (DOG_COATS): карамельный (прежний), белый с пятном у глаза, чёрный с подпалом.
// Модуль без DOM; id — с префиксом экземпляра.

export const DOG_VIEWBOX = '0 0 220 204';
export const DOG_PORTRAIT_VIEWBOX = '33 12 134 134';

// Платок — общий для всех обликов и тем.
const S = { scarf: '#cf6741', scarfLight: '#e58a5f', scarfDark: '#9e4528' };

// Палитры обликов — одни для светлой и тёмной темы (как у кота). cream — морда, грудь и низ лап;
// lid / lidR — тон морды у глаз (у правого может быть пятно); blaze — непрозрачность светлой полосы на
// лбу; marks — отметины (patch — пятно у правого глаза и на боку, tan — подпалины-«брови» точками).
export const DOG_COATS = {
  caramel: {
    furLight: '#ebba7b', fur: '#d39652', furDark: '#b2753a', line: '#5a3921', ear: '#8c5632', earDark: '#683b1f', earLight: '#a9713f', earLine: '#b07a4a',
    cream: '#f8ead3', creamShade: '#e9d0ab', muzzleHi: '#fffaf1', bibTop: '#eedcc0', bibBottom: '#ead5b6', bibSheen: '#fffaf2', tailTip: '#fff6e6', tailSheen: '#fff3df',
    headHi: '#efc283', lid: '#e0ab6a', lidR: '#e0ab6a', headSheen: '#f6d39f', sheen: '#f3cf98', paw: '#fbf1e2', toe: '#b49a7d', brow: '#8b5328', browR: '#8b5328',
    blush: '#e7a27f', lidLine: '#7a4b26', eyeLine: '#2c1a0e', blaze: '.8', patch: '', marks: '',
  },
  spotted: {
    furLight: '#fffcf6', fur: '#f1e6d5', furDark: '#d6c4aa', line: '#6b5243', ear: '#8a5430', earDark: '#653819', earLight: '#a8703f', earLine: '#bf8b5b',
    cream: '#fffaf2', creamShade: '#eee0cc', muzzleHi: '#ffffff', bibTop: '#f6ecdd', bibBottom: '#eee2d0', bibSheen: '#ffffff', tailTip: '#ffffff', tailSheen: '#ffffff',
    headHi: '#fffdf8', lid: '#f5ece0', lidR: '#93592f', headSheen: '#ffffff', sheen: '#ffffff', paw: '#fffaf3', toe: '#b8a48e', brow: '#b08a66', browR: '#5f3519',
    blush: '#f0a58c', lidLine: '#a08068', eyeLine: '#2c1a0e', blaze: '0', patch: '#93592f', marks: 'patch',
  },
  blacktan: {
    furLight: '#6b5d54', fur: '#4d423b', furDark: '#342b26', line: '#150f0c', ear: '#43372f', earDark: '#2e2521', earLight: '#5c4c42', earLine: '#75625a',
    cream: '#d39256', creamShade: '#b8763f', muzzleHi: '#e6ae6e', bibTop: '#c9884c', bibBottom: '#c07f44', bibSheen: '#ecc08a', tailTip: '#e0a463', tailSheen: '#8a776b',
    headHi: '#7a685e', lid: '#66574e', lidR: '#66574e', headSheen: '#8f7c70', sheen: '#8a776b', paw: '#dca063', toe: '#8f5f33', brow: '#d69a5e', browR: '#d69a5e',
    blush: '#c98a54', lidLine: '#120c0a', eyeLine: '#0c0806', blaze: '0', patch: '', marks: 'tan',
  },
};

// Прежний экспорт: палитра Тоби по умолчанию.
export const DOG_PALETTE = { ...DOG_COATS.caramel, nose: '#3a2924', ...S };

const coatOf = (coat) => (DOG_COATS[coat] ? coat : 'caramel');

// Глаза — круглые, на одной высоте; клип по глазу, веки — сплошным цветом (как у кота).
const EYE_Y = 63;
const EYE_R = 9.4;
const EYES = { l: 81.5, r: 118.5 };

function defs(p, c) {
  return `<defs>
    <linearGradient id="${p}-fur" gradientUnits="userSpaceOnUse" x1="60" y1="96" x2="150" y2="192">
      <stop offset="0" stop-color="${c.furLight}"/><stop offset=".55" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-head" gradientUnits="userSpaceOnUse" cx="100" cy="58" r="64">
      <stop offset="0" stop-color="${c.headHi}"/><stop offset=".5" stop-color="${c.lid}"/><stop offset=".85" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </radialGradient>
    <linearGradient id="${p}-ear" x1="0" y1="0" x2=".35" y2="1">
      <stop offset="0" stop-color="${c.earLight}"/><stop offset=".45" stop-color="${c.ear}"/><stop offset="1" stop-color="${c.earDark}"/>
    </linearGradient>
    <radialGradient id="${p}-muzzle" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${c.muzzleHi}"/><stop offset=".7" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.creamShade}"/>
    </radialGradient>
    <linearGradient id="${p}-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.bibTop}"/><stop offset=".35" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.bibBottom}"/>
    </linearGradient>
    <linearGradient id="${p}-tail" gradientUnits="userSpaceOnUse" x1="148" y1="182" x2="194" y2="122">
      <stop offset="0" stop-color="${c.furDark}"/><stop offset=".45" stop-color="${c.fur}"/><stop offset=".72" stop-color="${c.furLight}"/><stop offset=".86" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.tailTip}"/>
    </linearGradient>
    <linearGradient id="${p}-tail-lie" gradientUnits="userSpaceOnUse" x1="192" y1="180" x2="122" y2="190">
      <stop offset="0" stop-color="${c.furDark}"/><stop offset=".55" stop-color="${c.fur}"/><stop offset=".8" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.tailTip}"/>
    </linearGradient>
    <radialGradient id="${p}-iris" cx=".42" cy=".38" r=".7">
      <stop offset="0" stop-color="#d79a48"/><stop offset=".45" stop-color="#9a5d26"/><stop offset="1" stop-color="#4b2a13"/>
    </radialGradient>
    <linearGradient id="${p}-scarf" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${S.scarfLight}"/><stop offset=".55" stop-color="${S.scarf}"/><stop offset="1" stop-color="${S.scarfDark}"/>
    </linearGradient>
    <pattern id="${p}-plaid" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(18)">
      <rect width="7" height="7" fill="${S.scarf}"/>
      <rect width="7" height="2" y="2.5" fill="#f2d6bf" opacity=".55"/>
      <rect width="2" height="7" x="2.5" fill="#f2d6bf" opacity=".55"/>
      <rect width="7" height=".8" y="6" fill="${S.scarfDark}" opacity=".7"/>
      <rect width=".8" height="7" x="6" fill="${S.scarfDark}" opacity=".7"/>
    </pattern>
    <radialGradient id="${p}-ground" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#1d2024" stop-opacity=".3"/><stop offset=".6" stop-color="#1d2024" stop-opacity=".12"/><stop offset="1" stop-color="#1d2024" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${p}-eye-l"><circle cx="${EYES.l}" cy="${EYE_Y}" r="${EYE_R}"/></clipPath>
    <clipPath id="${p}-eye-r"><circle cx="${EYES.r}" cy="${EYE_Y}" r="${EYE_R}"/></clipPath>
  </defs>`;
}

// Хвост сидящего пса — пушистое перо справа, кончик светлый; виляние — поворот у основания.
function tail(p, c) {
  return `<g class="dog-tail">
    <path d="M142 185C156 190 172 187 182 177Q189 176.5 189.5 170C194.5 162 197.5 152 195.5 142Q200.5 135.5 197 127.5Q199 119 192.5 114Q189.5 120.5 184 121Q182.5 128 178 132C176 144 170 154 162 160C155 165 150 167.5 143.5 168Z" fill="url(#${p}-tail)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M152 178Q167 177 177 166M168 172Q182 165 187 151M183 142Q189 134 190 125" fill="none" stroke="${c.tailSheen}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    <path d="M157 182Q172 180 182 170M176 160Q182 152 184 144" fill="none" stroke="${c.furDark}" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
  </g>`;
}

// Пятно белого пса на боку — сидя и лёжа на одном месте тела.
const SIDE_PATCH = 'M126 146C133 139.5 148 142 152.5 151.5C156 160 149 169 139 168.5C130 168 123.5 161 124 154C124.2 151 124.8 148.4 126 146Z';
const LIE_PATCH = 'M158 151.5C166 148 178.5 153 181.5 162.5C183.5 170.5 176.5 176.5 168 175.5C159.5 174.5 153.5 168 153.8 160.8C154 157 155.4 153.4 158 151.5Z';

function sittingBody(p, c) {
  const leg = (side) => {
    const l = side === 'l';
    const x = l ? 0 : 20;
    return `<g class="dog-leg-${side}">
      <path d="M${83 + x} 130C${81.5 + x} 147 ${82 + x} 166 ${83 + x} 181L${98 + x} 181C${98 + x} 166 ${98.5 + x} 147 ${99.5 + x} 132Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M${82.4 + x} 160Q${90.5 + x} 164 ${98.4 + x} 160L${98.2 + x} 181L${83 + x} 181Z" fill="${c.cream}"/>
      <path d="M${l ? 95 : 105} 138C${l ? 95 : 105} 148 ${l ? 94.6 : 105.4} 154 ${l ? 94.4 : 105.6} 158" fill="none" stroke="${c.furDark}" stroke-width="1.7" stroke-linecap="round" opacity=".45"/>
      <path d="M${79 + x} 183Q${79 + x} 176 ${90.5 + x} 176Q${102 + x} 176 ${102 + x} 183Q${102 + x} 190.5 ${90.5 + x} 190.5Q${79 + x} 190.5 ${79 + x} 183Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
      <path d="M${86 + x} 184.5v4.5M${90.5 + x} 184v5.5M${95 + x} 184.5v4.5" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  };
  return `<g class="dog-sit">
    ${tail(p, c)}
    <path class="dog-torso" d="M76 104C64 112 58 126 56 141C44 147 38 161 40 173C41 183 48 188 58 188L142 188C152 188 159 183 160 173C162 161 156 147 144 141C142 126 136 112 124 104Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${c.patch ? `<path d="${SIDE_PATCH}" fill="${c.patch}"/>` : ''}
    <path d="M58 149C70 151 78 163 78 179M142 149C130 151 122 163 122 179" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M48 160C47 170 50 179 57 184M66 122C62 129 61 135 61 140" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <path d="M39 182Q39 175.5 49.5 175.5Q60 175.5 60 182Q60 189 49.5 189Q39 189 39 182ZM140 182Q140 175.5 150.5 175.5Q161 175.5 161 182Q161 189 150.5 189Q140 189 140 182Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M45.5 183v4M49.5 182.5v5M53.5 183v4M146.5 183v4M150.5 182.5v5M154.5 183v4" stroke="${c.toe}" stroke-width="1.1" stroke-linecap="round"/>
    <path class="dog-bib" d="M81 106C75 119 73 135 77 149Q82 152 85 158Q90 153 95 160Q100 154 105 160Q110 153 115 158Q118 152 123 149C127 135 125 119 119 106Z" fill="url(#${p}-bib)"/>
    <path d="M90 128q3.5 4 .5 9M110 126q-3.5 4-.5 9M100 137q2 4 0 8" fill="none" stroke="${c.bibSheen}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
    <ellipse cx="100" cy="116" rx="32" ry="8.5" fill="#3a2414" opacity=".14"/>
    ${leg('r')}
    ${leg('l')}
    ${pawUp(p, c)}
  </g>`;
}

// «Дай лапу»: поднятая левая передняя лапа подушечками вперёд — видна только в позе paw
// (обычная левая лапа в это время гаснет); общий сустав у плеча.
function pawUp(p, c) {
  const pad = '#c9877d';
  return `<g class="dog-paw-up">
    <path d="M85 123C80 127 76 131 71 135L82 147C88 143 94 139 100 134Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M59 138C59 129.5 65 124.5 72 124.5C79 124.5 85 129.5 85 138C85 146.5 79 151.5 72 151.5C65 151.5 59 146.5 59 138Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M66.5 145.5C66.5 141.5 69 139.5 72 139.5C75 139.5 77.5 141.5 77.5 145.5C77.5 148 75 149 72 149C69 149 66.5 148 66.5 145.5Z" fill="${pad}"/>
    <ellipse cx="63.8" cy="134.6" rx="2.2" ry="2.6" fill="${pad}"/><ellipse cx="68.9" cy="130.8" rx="2.2" ry="2.6" fill="${pad}"/>
    <ellipse cx="75.1" cy="130.8" rx="2.2" ry="2.6" fill="${pad}"/><ellipse cx="80.2" cy="134.6" rx="2.2" ry="2.6" fill="${pad}"/>
  </g>`;
}

// Отдых: лёг, голова на передних лапах, хвост обёрнут спереди. Видна только в позе rest.
function lyingBody(p, c) {
  return `<g class="dog-lie">
    <path d="M24 188C20 163 49 140 98 138C144 136 182 147 193 171C197 183 191 188 181 188Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${c.patch ? `<path d="${LIE_PATCH}" fill="${c.patch}"/>` : ''}
    <path d="M56 150C88 140 128 140 160 150" fill="none" stroke="${c.sheen}" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <path d="M150 150C168 156 178 168 178 182" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M40 166C40 174 44 182 50 186" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  </g>`;
}

function lyingFront(p, c) {
  const paw = (x) => `<path d="M${x} 186Q${x} 178 ${x + 12} 178Q${x + 24} 178 ${x + 24} 186Q${x + 24} 194 ${x + 12} 194Q${x} 194 ${x} 186Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M${x + 7.5} 187.5v3.8M${x + 12} 187v4.6M${x + 16.5} 187.5v3.8" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  return `<g class="dog-lie-front">
    <path d="M190 175C200 188 182 197 158 196C144 195.5 133 194 124 191Q136 186.5 156 186.5C171 186.5 182 182 190 175Z" fill="url(#${p}-tail-lie)" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    ${paw(74)}${paw(102)}
  </g>`;
}

// Платок: узел сбоку, как у пса на эскизе; три варианта (обычный, клетчатый, с бейджем) —
// виден тот, что в data-acc у svg (правила видимости — общие с котом, pet.css).
function scarf(p) {
  const shape = (fill) => `
      <path d="M63 103C80 116 120 116 137 103L139 112C120 126 80 126 61 112Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M79 115C93 121 108 121 122 114C119 129 111 141 101 149C92 139 84 127 79 115Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M139 112Q148 117 150 128Q143 124 137 117ZM135 115Q138 126 134 135Q130 125 132 116Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M131 106Q139 100 146 106Q147 113 139 116Q131 115 131 106Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5"/>`;
  const folds = `<path d="M95 121Q100 130 103 138M88 119Q93 125 97 130" fill="none" stroke="${S.scarfDark}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
      <path d="M82 117.5Q96 121.5 110 120" fill="none" stroke="#f3b08b" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>`;
  return `<g class="dog-scarf">
    <g class="cat-acc" data-acc-part="scarf">${shape(`url(#${p}-scarf)`)}${folds}</g>
    <g class="cat-acc" data-acc-part="plaid">${shape(`url(#${p}-plaid)`)}${folds}</g>
    <g class="cat-acc" data-acc-part="badge">${shape(`url(#${p}-scarf)`)}${folds}
      <g transform="rotate(-6 96 131)">
        <rect x="88.5" y="121" width="15" height="18" rx="2.5" fill="#f7f1e6" stroke="#8b6f5e" stroke-width="1.2"/>
        <rect x="88.5" y="121" width="15" height="5" rx="2" fill="#4f8a6e"/>
        <rect x="93.5" y="118.5" width="5" height="4" rx="1" fill="#b9bcc2" stroke="#7d8189" stroke-width=".8"/>
        <circle cx="96" cy="133" r="2.3" fill="#c97566"/>
        <circle cx="92.6" cy="129.6" r="1.1" fill="#c97566"/><circle cx="95" cy="128.4" r="1.1" fill="#c97566"/>
        <circle cx="97.6" cy="128.4" r="1.1" fill="#c97566"/><circle cx="99.6" cy="129.8" r="1.1" fill="#c97566"/>
      </g>
    </g>
  </g>`;
}

function eye(p, side, c) {
  const cx = EYES[side];
  const y = EYE_Y;
  const lid = side === 'r' ? c.lidR : c.lid;
  const hl = side === 'l' ? [cx + 3, y - 3.6, cx - 3, y + 3.4] : [cx + 3, y - 3.6, cx - 3, y + 3.4];
  return `<g class="dog-eye dog-eye-${side}">
    <g clip-path="url(#${p}-eye-${side})">
      <circle cx="${cx}" cy="${y}" r="${EYE_R}" fill="url(#${p}-iris)"/>
      <circle cx="${cx}" cy="${y}" r="${EYE_R}" fill="none" stroke="#3a2416" stroke-width="2.6" opacity=".8"/>
      <g class="dog-look"><circle class="dog-pupil" cx="${cx}" cy="${y + 0.4}" r="4.9" fill="#160d08"/></g>
      <circle cx="${hl[0]}" cy="${hl[1]}" r="2.7" fill="#fff"/>
      <circle cx="${hl[2]}" cy="${hl[3]}" r="1.1" fill="#fff" opacity=".8"/>
      <g class="dog-lid-down"><path d="M${cx - 13} ${y + 11}Q${cx} ${y + 6} ${cx + 13} ${y + 11}L${cx + 13} ${y + 30}L${cx - 13} ${y + 30}Z" fill="${lid}"/><path d="M${cx - 8} ${y + 9.2}Q${cx} ${y + 6} ${cx + 8} ${y + 9.2}" fill="none" stroke="${c.lidLine}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></g>
      <g class="dog-lid-up"><path d="M${cx - 13} ${y - 36}L${cx + 13} ${y - 36}L${cx + 13} ${y - 9.6}Q${cx} ${y - 5} ${cx - 13} ${y - 9.6}Z" fill="${lid}"/><path d="M${cx - 13} ${y - 9.6}Q${cx} ${y - 5} ${cx + 13} ${y - 9.6}" fill="none" stroke="#3a2416" stroke-width="1.8"/></g>
    </g>
    <path class="dog-happy" d="M${cx - 9} ${y + 2.5}Q${cx} ${y - 7.5} ${cx + 9} ${y + 2.5}" fill="none" stroke="${c.eyeLine}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="dog-sleep" d="M${cx - 8.5} ${y + 0.5}Q${cx} ${y + 7.5} ${cx + 8.5} ${y + 0.5}" fill="none" stroke="${c.eyeLine}" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

// Пятно белого пса вокруг правого глаза (глаз и веко — поверх, веко цвета пятна).
const EYE_PATCH = 'M107.5 51C113 45.5 126 45 131.5 51.5C136 57 135.5 69 130 75C124.5 80.5 113 80 108.5 74C104.5 68.5 103.5 56 107.5 51Z';

// «Брови»: у подпалого — светлые точки над глазами, у остальных — дуги.
const brow = (side, c) =>
  c.marks === 'tan'
    ? `<ellipse cx="${side === 'l' ? 80.6 : 119.4}" cy="47.6" rx="5.4" ry="3.7" fill="${c.brow}"/>`
    : `<path d="${side === 'l' ? 'M73.5 49.5Q80.5 45 88 48.5' : 'M112 48.5Q119.5 45 126.5 49.5'}" fill="none" stroke="${side === 'l' ? c.brow : c.browR}" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>`;

function head(p, c) {
  return `<g class="dog-head">
    <path class="dog-skull" d="M100 31C122 31 140 43 144 63C146 73 146 83 143 91Q148 95 146 101Q141 100 137 103C128 112 115 116 100 116C85 116 72 112 63 103Q59 100 54 101Q52 95 57 91C54 83 54 73 56 63C60 43 78 31 100 31Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M62 60C60 68 60 76 62 84M138 60C140 68 140 76 138 84" fill="none" stroke="${c.headSheen}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    ${c.blaze !== '0' ? `<path d="M95 40Q100 36 105 40L108.5 66Q100 70 91.5 66Z" fill="${c.cream}" opacity="${c.blaze}"/>` : ''}
    <path class="dog-muzzle" d="M100 67C110 67 118 71 123 79C129 87 128 100 120 107C114 112 107 114.5 100 114.5C93 114.5 86 112 80 107C72 100 71 87 77 79C82 71 90 67 100 67Z" fill="url(#${p}-muzzle)"/>
    ${c.marks === 'patch' ? `<path d="${EYE_PATCH}" fill="${c.patch}"/>` : ''}
    <g class="dog-tuft">
      <path d="M91.5 37C89 29 93 21.5 101 19.5C106.5 18.2 111 20.5 112.5 24C108.5 22.8 104.5 23.8 103.2 26.6C106.6 25.6 110 26.8 111 30C107 29.8 104.4 31.6 104.2 35.6Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M95 34Q95 27 100 24M99.5 34Q101 29 104.5 27.5" fill="none" stroke="${c.headSheen}" stroke-width="1" stroke-linecap="round" opacity=".85"/>
    </g>
    <g class="dog-brow-l">${brow('l', c)}</g>
    <g class="dog-brow-r">${brow('r', c)}</g>
    ${eye(p, 'l', c)}${eye(p, 'r', c)}
    <path d="M71 74Q74 76.5 77 76M129 74Q126 76.5 123 76" fill="none" stroke="${c.blush}" stroke-width="3" stroke-linecap="round" opacity=".45"/>
    <path d="M90 81C90 76.5 95 75 100 75C105 75 110 76.5 110 81C110 86.5 104.5 90.5 100 90.5C95.5 90.5 90 86.5 90 81Z" fill="#3a2924" stroke="#1f1411" stroke-width="1" stroke-linejoin="round"/>
    <ellipse cx="96.2" cy="78.6" rx="3.2" ry="1.6" fill="#fff" opacity=".45"/>
    <g class="dog-mouth dog-mouth-calm"><path d="M100 90.5V95M88.5 94.5Q93.5 101.5 100 96Q106.5 101.5 111.5 94.5" fill="none" stroke="#4a3022" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="dog-mouth dog-mouth-open"><path d="M87.5 95Q100 98.5 112.5 95Q111.5 108 100 111Q88.5 108 87.5 95Z" fill="#5e2b2d" stroke="#4a3022" stroke-width="1.4" stroke-linejoin="round"/><path d="M92.5 102.5Q100 99.5 107.5 102.5Q107.5 111 100 112.5Q92.5 111 92.5 102.5Z" fill="#e2808a"/><path d="M100 103.5V109" stroke="#c4606b" stroke-width="1.1" stroke-linecap="round"/><path d="M100 90.5V96" stroke="#4a3022" stroke-width="1.6" stroke-linecap="round"/></g>
    <g class="dog-mouth dog-mouth-yawn"><path d="M91 95Q100 92 109 95Q112 109 100 113Q88 109 91 95Z" fill="#5e2b2d" stroke="#4a3022" stroke-width="1.3"/><path d="M93.6 105Q100 101.5 106.4 105Q105 112 100 112.6Q95 112 93.6 105Z" fill="#e2808a"/><path d="M92.5 96l1.6 3 1.2-3.4M107.5 96l-1.6 3-1.2-3.4" fill="#fff"/></g>
    <g class="dog-ear-l">
      <path d="M80 37C70 31 54 35 46 47C38 59 37 81 41 95C44 105 53 110 59 104C65 98 66 84 66 72C66 58 70 46 80 37Z" fill="url(#${p}-ear)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M57 50Q50 66 52 90M63 56Q59 70 60 86" fill="none" stroke="${c.earLine}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    </g>
    <g class="dog-ear-r">
      <path d="M120 37C130 31 146 35 154 47C162 59 163 81 159 95C156 105 147 110 141 104C135 98 134 84 134 72C134 58 130 46 120 37Z" fill="url(#${p}-ear)" stroke="${c.line}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M143 50Q150 66 148 90M137 56Q141 70 140 86" fill="none" stroke="${c.earLine}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    </g>
  </g>`;
}

// Полный пёс (боковая панель и сцена) или портрет (телефон, узкая панель, выбор напарника).
// Класс cat-art — общий механизм напарника: позы (data-pose), режим движения, пауза и печать.
// coat — облик (DOG_COATS), неизвестный — прежний карамельный.
export function dogSvg({ id = 'dog', view = 'full', className = '', box = null, coat = 'caramel' } = {}) {
  const portrait = view === 'portrait';
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = DOG_COATS[shown];
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  return `<svg class="cat-art${className ? ` ${className}` : ''}" data-kind="dog" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="scarf" viewBox="${portrait ? DOG_PORTRAIT_VIEWBOX : DOG_VIEWBOX}"${place} aria-hidden="true" focusable="false">
    ${defs(p, c)}
    ${portrait ? '' : `<ellipse cx="102" cy="189" rx="76" ry="7.5" fill="url(#${p}-ground)"/>`}
    <g class="dog-all">
      ${portrait ? '' : `${lyingBody(p, c)}${sittingBody(p, c)}`}
      ${scarf(p)}
      ${head(p, c)}
      ${portrait ? '' : lyingFront(p, c)}
      ${FETCH}
    </g>
  </svg>`;
}

// Мячик — вещь собаки со ступени «Наш ритуал» (9 знаков): лежит на коврике справа, косметика.
// В сцене — в координатах сцены (400×250), с подсветкой новинки, как вещи кота. Тело с полосками — своей группой:
// в сцене «Поиграть» мячик катится и поворачивается, тень и блик — нет.
const BALL = `<g class="cat-play-spin"><circle cx="283" cy="233" r="11" fill="#e3b94a" stroke="#9a7420" stroke-width="2"/>
      <path d="M273.8 227.4Q283 233 292.2 227.4M273.8 238.6Q283 233 292.2 238.6" fill="none" stroke="#f8edd0" stroke-width="2.2" stroke-linecap="round"/></g>
      <ellipse cx="279" cy="228.2" rx="3" ry="1.8" fill="#fff" opacity=".45"/>`;

export function ballArt({ fresh = false } = {}) {
  return `<g class="cat-item${fresh ? ' is-fresh' : ''}" data-item="ball" data-room="ball">
      <ellipse cx="283" cy="244.5" rx="11.5" ry="2.8" fill="#3a2414" opacity=".18"/>
      ${BALL}
    </g>`;
}

// Сценка «приносит мячик» (с 2026-10-10): тот же мячик — временный реквизит у пасти (центр 100, 106), виден только в
// сценке; путь от пола к пасти и к лапам — dog.css.
const FETCH = `<g class="dog-fetch"><g transform="translate(-183 -127)">${BALL}</g></g>`;

// Мячик рядом с псом в боковой панели — на время реакции «новая вещь».
export function ballMiniSvg() {
  return `<svg class="cat-mini-art" viewBox="268 218 30 30" aria-hidden="true" focusable="false">${ballArt()}</svg>`;
}

// Мячик в сцене «Поиграть» (с 2026-10-10) — предмет на полу у кота и собаки (pet-toys.mjs); не вещь ступени.
export function ballToySvg() {
  return `<svg class="cat-play-toy-art" viewBox="270 220 26 28" aria-hidden="true" focusable="false">${ballArt()}</svg>`;
}

// Канат собаки (с 2026-10-10) — игрушка уголка, доступна сразу; место — pet-room.mjs («Обустроить уголок»).
export function ropeArt() {
  return `<g class="cat-item" data-item="rope" data-room="rope">
      <ellipse cx="36" cy="240" rx="23" ry="2.4" fill="#3a2414" opacity=".16"/>
      <path d="M19 233Q36 226.5 53 233" fill="none" stroke="#8b6a47" stroke-width="8.4" stroke-linecap="round"/>
      <path d="M19 233Q36 226.5 53 233" fill="none" stroke="#efe3d0" stroke-width="5.6" stroke-linecap="round"/>
      <path d="M24.5 233.6l3-5M30.2 231.6l3-5M36 230.9l3-5M41.8 231.4l3-5M47.4 233.1l3-4.8" stroke="#cf6741" stroke-width="2" stroke-linecap="round"/>
      <circle cx="17" cy="234" r="5" fill="#cf6741" stroke="#9e4528" stroke-width="1.8"/>
      <circle cx="55" cy="234" r="5" fill="#cf6741" stroke="#9e4528" stroke-width="1.8"/>
      <path d="M13 237.5l-2.2 3.4M15.6 239l-.8 3.6M56.4 239l.8 3.6M59 237.5l2.2 3.4" stroke="#9e4528" stroke-width="1.6" stroke-linecap="round"/>
    </g>`;
}
