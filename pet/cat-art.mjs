// Кот-напарник (с 2026-10-07): графика. Марс — кот с чёлкой, вихром, янтарно-зелёными глазами и
// терракотовым платком. Рисунок — слоистый SVG прямо в странице: уши, веки, зрачки, рот, хвост из трёх
// звеньев и вторая поза тела («лёжа») — отдельные группы, их двигает pet.css через transform и opacity.
// Масштаб и точка опоры у всех поз общие: viewBox 0 0 220 204, земля — y = 188. Портрет — та же голова
// с платком, только другая рамка. Облик (с 2026-10-08) — только палитра и простые отметины поверх той же
// геометрии (CAT_COATS): дымчатый (прежний), рыжий с полосками, чёрно-белый с белой проточиной.
// Модуль без DOM: возвращает строки разметки; id внутри SVG — с префиксом экземпляра.

export const CAT_VIEWBOX = '0 0 220 204';
export const PORTRAIT_VIEWBOX = '43 5 114 114';
export const SCENE_VIEWBOX = '0 0 400 250';

// Платок и глаза — общие для всех обликов и тем.
const S = { scarf: '#cf6741', scarfLight: '#e58a5f', scarfDark: '#9e4528' };
const IRIS = { in: '#e3c95e', out: '#4d8a45' };

// Палитры обликов — одни для светлой и тёмной темы. lid — тон морды у глаз (веки — ровным цветом, иначе
// при движении градиент едет вместе с ними); halo и bridge — непрозрачность светлой морды и переносицы;
// marks — отметины облика (tabby — полоски, blaze — белая проточина и светлая нижняя часть морды).
export const CAT_COATS = {
  smoke: {
    furLight: '#b3b7be', fur: '#8f949c', furDark: '#6d727a', furMid: '#80858d', headHi: '#b2b6bc', lid: '#a5a9af', headEdge: '#787d85',
    fringeHi: '#757a82', smoke: '#5c6068', stripe: '#6b7078', line: '#43474f', fringeLine: '#50545b', sheen: '#c6cad0', sheenSoft: '#b9bdc3',
    fringeSheen: '#a7acb3', cream: '#f4eadc', creamHi: '#fbf5ec', creamShade: '#ddcdb8', bibTop: '#e9dccb', bibBottom: '#e6d6c1', bibSheen: '#fffaf2',
    paw: '#e9dfd2', toe: '#a9998a', earDeep: '#d99d92', earIn: '#e7b2a4', tuft: '#f6ece2', nose: '#c97566', noseLine: '#8f4c43', whisker: '#dcd6cd',
    eyeLine: '#25282d', lidLine: '#3a3d43', halo: '.35', bridge: '.4', marks: '',
  },
  ginger: {
    furLight: '#f3b878', fur: '#e0954f', furDark: '#c0733a', furMid: '#d48545', headHi: '#f6c690', lid: '#eeac6c', headEdge: '#cc7f42',
    fringeHi: '#d98a48', smoke: '#b5612c', stripe: '#b25e2a', line: '#6e3d1e', fringeLine: '#8a4a22', sheen: '#f8d2a6', sheenSoft: '#f2c290',
    fringeSheen: '#f5c995', cream: '#f7ecdc', creamHi: '#fdf7ee', creamShade: '#e8d2b6', bibTop: '#f0dfc6', bibBottom: '#ebd6b9', bibSheen: '#fffaf2',
    paw: '#f3e3cd', toe: '#b8916b', earDeep: '#e0998b', earIn: '#efb7a8', tuft: '#fbeedd', nose: '#d98276', noseLine: '#9b5144', whisker: '#f6ecdf',
    eyeLine: '#3b2414', lidLine: '#5a3418', halo: '.35', bridge: '.5', marks: 'tabby',
  },
  tuxedo: {
    furLight: '#686e79', fur: '#4c515a', furDark: '#34373e', furMid: '#43474f', headHi: '#777d88', lid: '#636872', headEdge: '#3b3e45',
    fringeHi: '#474c54', smoke: '#2c2e34', stripe: '#31343a', line: '#141518', fringeLine: '#141518', sheen: '#8f959f', sheenSoft: '#7a808a',
    fringeSheen: '#7e848e', cream: '#f8f6f2', creamHi: '#ffffff', creamShade: '#dedad3', bibTop: '#ece8e2', bibBottom: '#e4e0d8', bibSheen: '#ffffff',
    paw: '#f4f2ee', toe: '#a8a29a', earDeep: '#c98d86', earIn: '#dca39b', tuft: '#f2efe9', nose: '#d4867c', noseLine: '#8f4c43', whisker: '#f4f1ec',
    eyeLine: '#0f1012', lidLine: '#0f1012', halo: '.92', bridge: '0', marks: 'blaze',
  },
};

// Прежний экспорт: палитра Марса по умолчанию.
export const PALETTE = { ...CAT_COATS.smoke, ...S, irisIn: IRIS.in, irisOut: IRIS.out };

const coatOf = (coat) => (CAT_COATS[coat] ? coat : 'smoke');
const has = (c, mark) => c.marks === mark;

// Разметка частей в координатах viewBox. Порядок слоёв — снизу вверх.
function defs(p, c) {
  return `<defs>
    <linearGradient id="${p}-fur" gradientUnits="userSpaceOnUse" x1="60" y1="30" x2="150" y2="192">
      <stop offset="0" stop-color="${c.furLight}"/><stop offset=".5" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.furDark}"/>
    </linearGradient>
    <radialGradient id="${p}-head" gradientUnits="userSpaceOnUse" cx="100" cy="66" r="62">
      <stop offset="0" stop-color="${c.headHi}"/><stop offset=".45" stop-color="${c.lid}"/><stop offset=".78" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.headEdge}"/>
    </radialGradient>
    <linearGradient id="${p}-fringe" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0" stop-color="${c.fringeHi}"/><stop offset="1" stop-color="${c.smoke}"/>
    </linearGradient>
    <radialGradient id="${p}-cream" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${c.creamHi}"/><stop offset=".7" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.creamShade}"/>
    </radialGradient>
    <linearGradient id="${p}-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.bibTop}"/><stop offset=".35" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.bibBottom}"/>
    </linearGradient>
    <radialGradient id="${p}-iris" cx=".5" cy=".58" r=".62">
      <stop offset="0" stop-color="${IRIS.in}"/><stop offset=".42" stop-color="#a9c25a"/><stop offset=".78" stop-color="#5f9a4b"/><stop offset="1" stop-color="${IRIS.out}"/>
    </radialGradient>
    <linearGradient id="${p}-ear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.earDeep}"/><stop offset="1" stop-color="${c.earIn}"/>
    </linearGradient>
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
    <clipPath id="${p}-eye-l"><path d="${EYE_L}"/></clipPath>
    <clipPath id="${p}-eye-r"><path d="${EYE_R}"/></clipPath>
  </defs>`;
}

const EYE_L = 'M68 70.5C69 62.5 74.5 58.5 80.5 58.5C87 58.5 92 63 92 69.5C92 77 86.5 81.5 79.5 81.5C72.5 81.5 67.5 77 68 70.5Z';
const EYE_R = 'M132 70.5C131 62.5 125.5 58.5 119.5 58.5C113 58.5 108 63 108 69.5C108 77 113.5 81.5 120.5 81.5C127.5 81.5 132.5 77 132 70.5Z';

// Хвост сидящего кота — три звена; у каждого контур и мех лежат в одинаковой цепочке групп,
// поэтому стык звеньев не виден. Повороты звеньев (t1–t3) задаёт pet.css.
const TAIL = [
  'M150 181Q166 186 178 180',
  'M178 180Q190 172 192 158',
  'M192 158Q193.5 147 187 141',
];

// Отметины звеньев хвоста (рыжий — кольца); у прежнего облика их нет.
const TAIL_RINGS = ['<path d="M164.2 178.6l-.8 8.6" stroke="STRIPE" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>', '<path d="M187.6 151.2l7.4-.6" stroke="STRIPE" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>'];

function tailChain(kind, c) {
  const widths = kind === 'line' ? [15.5, 14, 12.5] : [12, 10.5, 9];
  const colors = kind === 'line' ? [c.line, c.line, c.line] : [c.fur, c.furMid, c.smoke];
  const seg = (i) => `<path d="${TAIL[i]}" fill="none" stroke="${colors[i]}" stroke-width="${widths[i]}" stroke-linecap="round"/>`;
  const fur = kind !== 'line';
  const stripe = fur ? `<path d="M184.5 170.5l6.5 3.6" stroke="${c.stripe}" stroke-width="2.4" stroke-linecap="round"/>` : '';
  const ring = (i) => (fur && has(c, 'tabby') ? TAIL_RINGS[i].replace('STRIPE', c.stripe) : '');
  return `<g class="cat-t1">${seg(0)}${ring(0)}<g class="cat-t2">${seg(1)}${stripe}<g class="cat-t3">${seg(2)}${ring(1)}</g></g></g>`;
}

// Полоски рыжего: бока, плечи и поперёк передних лап (в группе лапы — двигаются вместе с ней).
const TABBY_SIDES = 'M47 156q7-1 12 5M45 166q8-1 13 6M48 176q6 0 10 5M153 156q-7-1-12 5M155 166q-8-1-13 6M152 176q-6 0-10 5M67 116q-5 5-5 12M133 116q5 5 5 12';
const tabbyLeg = (x) => `<path d="M${85.5 + x} 147q6 1.6 11.4 0M${85.2 + x} 158q6 1.6 11.6 0M${85 + x} 168.5q6 1.4 11.8 0" fill="none" stroke="STRIPE" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>`;

function sittingBody(p, c) {
  const leg = (side) => {
    const l = side === 'l';
    const x = l ? 0 : 20;
    return `<g class="cat-leg-${side}">
      <path d="M${84 + x} 132C${82.5 + x} 148 ${83.5 + x} 168 ${84.5 + x} 182L${97 + x} 182C${97 + x} 168 ${97.5 + x} 148 ${98.5 + x} 134Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M${l ? 95 : 105} 140C${l ? 95 : 105} 156 ${l ? 94.5 : 105.5} 168 ${l ? 94 : 106} 178" fill="none" stroke="${c.furDark}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>
      ${has(c, 'tabby') ? tabbyLeg(x).replace('STRIPE', c.stripe) : ''}
      <path d="M${80 + x} 183Q${80 + x} 176 ${90.5 + x} 176Q${101 + x} 176 ${101 + x} 183Q${101 + x} 190.5 ${90.5 + x} 190.5Q${80 + x} 190.5 ${80 + x} 183Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
      <path d="M${86.5 + x} 184.5v4.5M${90.5 + x} 184v5.5M${94.5 + x} 184.5v4.5" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  };
  return `<g class="cat-sit">
    <g class="cat-tail">${tailChain('line', c)}${tailChain('fur', c)}</g>
    <path class="cat-torso" d="M78 98C66 106 60 120 58 136C46 142 40 158 42 172C43 182 50 188 60 188L142 188C152 188 158 182 159 172C161 158 154 142 142 136C140 120 134 106 122 98Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M60 150C70 152 77 162 77 177M140 150C130 152 123 162 123 177" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    ${has(c, 'tabby') ? `<path d="${TABBY_SIDES}" fill="none" stroke="${c.stripe}" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>` : ''}
    <path d="M50 160C49 170 52 180 60 185M64 124C61 130 60 136 60 140" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M51 170q3-7 10-8M54 177q3-5 8-6M149 170q-3-7-10-8M146 177q-3-5-8-6" fill="none" stroke="${c.sheenSoft}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    <path class="cat-bib" d="M81 102C75 114 73 128 76 140Q80.5 143 83 149Q88 145 92 151Q96 146 100 153Q104 146 108 151Q112 145 117 149Q119.5 143 124 140C127 128 125 114 119 102Z" fill="url(#${p}-bib)"/>
    <path d="M90 128q3.5 4 .5 9M110 126q-3.5 4-.5 9M100 136q2 4 0 8" fill="none" stroke="${c.bibSheen}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
    <ellipse cx="100" cy="114" rx="33" ry="9" fill="#2a2d33" opacity=".16"/>
    ${leg('r')}
    ${leg('l')}
  </g>`;
}

// Поза отдыха: лежит «буханкой», голова на лапах, хвост обёрнут спереди. Видна только в rest.
function lyingBody(p, c) {
  return `<g class="cat-lie">
    <path class="cat-torso-lie" d="M28 188C24 164 50 140 96 138C140 136 178 148 188 170C192 182 186 188 176 188Z" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    ${has(c, 'tabby') ? `<path d="M78 142q3.5 6 1.5 12M98 140q3.5 7 1.5 13M118 140q3.5 7 1.5 13M138 143q3 6 1 12M156 150q2 6 0 11" fill="none" stroke="${c.stripe}" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>` : ''}
    <path d="M58 150C88 140 128 140 160 150" fill="none" stroke="${c.sheen}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>
    <path d="M150 150C168 156 178 168 178 182" fill="none" stroke="${c.furDark}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M40 166C40 174 44 182 50 186" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".45"/>
  </g>`;
}

function lyingFront(c) {
  const tail = 'M181 177C192 188 172 193 140 193C112 193 86 193 58 189';
  const paw = (x) => `<path d="M${x} 186Q${x} 179 ${x + 11} 179Q${x + 22} 179 ${x + 22} 186Q${x + 22} 193 ${x + 11} 193Q${x} 193 ${x} 186Z" fill="${c.paw}" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M${x + 7} 187.5v3.8M${x + 11} 187v4.6M${x + 15} 187.5v3.8" stroke="${c.toe}" stroke-width="1.2" stroke-linecap="round"/>`;
  // Хвост — своей группой: в сценке «клубок» (с 2026-10-10) он оборачивается вокруг тела (pet.css).
  return `<g class="cat-lie-front">
    <g class="cat-lie-tail"><path d="${tail}" fill="none" stroke="${c.line}" stroke-width="13.5" stroke-linecap="round"/>
    <path d="${tail}" fill="none" stroke="${c.fur}" stroke-width="10" stroke-linecap="round"/>
    ${has(c, 'tabby') ? `<path d="M152 188.6v9M124 188.4v9.2" stroke="${c.stripe}" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>` : ''}
    <path d="M58 189C64 190.2 70 191 77 191.6" fill="none" stroke="${c.smoke}" stroke-width="10" stroke-linecap="round"/></g>
    ${paw(78)}${paw(100)}
  </g>`;
}

// Платок: три варианта (обычный, клетчатый, с бейджем) — виден тот, что в data-acc у svg.
function scarf(p) {
  const shape = (fill) => `
      <path d="M63 104C80 117 120 117 137 104L138 112.5C120 126 80 126 62 112.5Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M81 116C95 122 110 122 123 114C120 127 113 137 104 143C97 135 88 127 81 116Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M62 115Q55 123 57 132Q63 126 66 117ZM67 117Q68 127 64 136Q72 128 71 116Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M59 109Q66 103 73 109Q75 116 67 118Q59 117 59 109Z" fill="${fill}" stroke="${S.scarfDark}" stroke-width="1.5"/>`;
  const folds = `<path d="M95 122Q100 131 104 139M88 120Q93 126 97 131" fill="none" stroke="${S.scarfDark}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
      <path d="M84 118.5Q96 122.5 110 121" fill="none" stroke="#f3b08b" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>`;
  return `<g class="cat-scarf">
    <g class="cat-acc" data-acc-part="scarf">${shape(`url(#${p}-scarf)`)}${folds}</g>
    <g class="cat-acc" data-acc-part="plaid">${shape(`url(#${p}-plaid)`)}${folds}</g>
    <g class="cat-acc" data-acc-part="badge">${shape(`url(#${p}-scarf)`)}${folds}
      <g transform="rotate(7 107 131)">
        <rect x="99.5" y="122" width="15" height="18" rx="2.5" fill="#f7f1e6" stroke="#8b6f5e" stroke-width="1.2"/>
        <rect x="99.5" y="122" width="15" height="5" rx="2" fill="#4f8a6e"/>
        <rect x="104.5" y="119.5" width="5" height="4" rx="1" fill="#b9bcc2" stroke="#7d8189" stroke-width=".8"/>
        <circle cx="107" cy="134" r="2.3" fill="#c97566"/>
        <circle cx="103.6" cy="130.6" r="1.1" fill="#c97566"/><circle cx="106" cy="129.4" r="1.1" fill="#c97566"/>
        <circle cx="108.6" cy="129.4" r="1.1" fill="#c97566"/><circle cx="110.6" cy="130.8" r="1.1" fill="#c97566"/>
      </g>
    </g>
  </g>`;
}

function eye(p, side, c) {
  const left = side === 'l';
  const d = left ? EYE_L : EYE_R;
  const cx = left ? 80 : 120;
  const hl = left ? [84.5, 64.5, 76.5, 75.5] : [124.5, 64.5, 116.5, 75.5];
  return `<g class="cat-eye cat-eye-${side}">
    <g clip-path="url(#${p}-eye-${side})">
      <path d="${d}" fill="url(#${p}-iris)"/>
      <path d="${d}" fill="none" stroke="#2c4a2b" stroke-width="2.6" opacity=".75"/>
      <g class="cat-look"><ellipse class="cat-pupil" cx="${cx}" cy="70.5" rx="3.4" ry="8" fill="#14171a"/></g>
      <circle cx="${hl[0]}" cy="${hl[1]}" r="2.7" fill="#fff"/>
      <circle cx="${hl[2]}" cy="${hl[3]}" r="1.15" fill="#fff" opacity=".8"/>
      <g class="cat-lid-down"><path d="M${cx - 20} 86Q${cx} 75 ${cx + 20} 86L${cx + 20} 104L${cx - 20} 104Z" fill="${c.lid}"/><path d="M${cx - 14} 83Q${cx} 75.8 ${cx + 14} 83" fill="none" stroke="${c.lidLine}" stroke-width="1.3" stroke-linecap="round" opacity=".55"/></g>
      <g class="cat-lid-up"><path d="M${cx - 20} 28L${cx + 20} 28L${cx + 20} 55Q${cx} 62 ${cx - 20} 55Z" fill="${c.lid}"/><path d="M${cx - 20} 55Q${cx} 62 ${cx + 20} 55" fill="none" stroke="${c.eyeLine}" stroke-width="2.6"/></g>
    </g>
    <path class="cat-happy" d="${left ? 'M69.5 73Q80 62 90.5 73' : 'M109.5 73Q120 62 130.5 73'}" fill="none" stroke="${c.eyeLine}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="cat-sleep" d="${left ? 'M69.5 72.5Q80 79 90.5 72.5' : 'M109.5 72.5Q120 79 130.5 72.5'}" fill="none" stroke="${c.eyeLine}" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

// Полоски рыжего на лбу (по бокам от чёлки) — к прежним полоскам щёк и лба.
const TABBY_HEAD = 'M75.5 50.5Q72.5 56 74 61.5M124.5 50.5Q127.5 56 126 61.5M80 44Q78 47.5 78.6 51.5M120 44Q122 47.5 121.4 51.5';
// Белая проточина чёрно-белого: от лба к носу, между глаз.
const BLAZE = 'M100 59.5C102.4 66 104.2 75 108.2 85H91.8C95.8 75 97.6 66 100 59.5Z';

function head(p, c) {
  return `<g class="cat-head">
    <g class="cat-ear-l">
      <path d="M84 43Q69 20 53 10Q48.5 12 48.5 19Q48.5 39 56 61Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M78 45Q67 29 55.5 19.5Q54.5 34 59 55Z" fill="url(#${p}-ear)"/>
      <path d="M66 52Q62 42 57.5 33M71 51Q66 43 61 37" fill="none" stroke="${c.tuft}" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>
    </g>
    <g class="cat-ear-r">
      <path d="M116 42Q130 18 146 8.5Q150.5 10 150.5 16.5Q151 37 144 60Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M122 44Q132 27 144 17Q145.5 31 141 54Z" fill="url(#${p}-ear)"/>
      <path d="M134 51Q138 41 142 32M129 50Q133 42 138 36" fill="none" stroke="${c.tuft}" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>
    </g>
    <path d="M97 39Q102 29 111 26.5Q106.5 33 109 40Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path class="cat-skull" d="M100 37C120 37 136 45 141 61C144 69 145 75 147 80Q152 84 156 89Q149.5 89 146 90Q150.5 95 150.5 99.5Q145 99 141 100C133 109 118 114 100 114C82 114 67 109 59 101Q54 101.5 48.5 101Q52 97 54 92Q49 90 45.5 86Q51.5 83 54 79C56 72 58 65 60 60C65 45 80 37 100 37Z" fill="url(#${p}-head)" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M140 64C143 70 144 75 146 80M60 64C57 70 56 75 54 79" fill="none" stroke="${c.sheen}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <path d="M66 77Q60 78 54.5 81.5M67 82.5Q62 84.5 58 89M134 77Q140 78 145.5 81.5M133 82.5Q138 84.5 142 89M85 49Q82.5 55 83.5 61M115 49Q117.5 55 116.5 61" fill="none" stroke="${c.smoke}" stroke-width="2.1" stroke-linecap="round" opacity=".6"/>
    ${has(c, 'tabby') ? `<path d="${TABBY_HEAD}" fill="none" stroke="${c.stripe}" stroke-width="2.3" stroke-linecap="round" opacity=".7"/>` : ''}
    <path d="M78 86C70 92 71 106 84 111C90 114.5 110 114.5 116 111C129 106 130 92 122 86C112 80 88 80 78 86Z" fill="${c.cream}" opacity="${c.halo}"/>
    <path d="M82 86.5C88 82.5 95 84.5 100 88C105 84.5 112 82.5 118 86.5C127.5 91.5 127.5 105.5 115 110.5C109 113.5 91 113.5 85 110.5C72.5 105.5 72.5 91.5 82 86.5Z" fill="url(#${p}-cream)"/>
    ${has(c, 'blaze') ? `<path d="${BLAZE}" fill="${c.cream}"/>` : `<path d="M96.5 62Q100 60 103.5 62L102.8 86L97.2 86Z" fill="${c.cream}" opacity="${c.bridge}"/>`}
    <path class="cat-fringe" d="M93 38C104 36.5 113 41 115 48.5Q109 46.5 105.5 48.5Q107.5 53 106 58Q101.5 52 97.5 51.5Q98.5 56 95 61Q92.5 53 86 50.5Q88 43 93 38Z" fill="url(#${p}-fringe)" stroke="${c.fringeLine}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M96 41Q102.5 42.5 105.5 48M91 44Q94 47 95 52" fill="none" stroke="${c.fringeSheen}" stroke-width="1" stroke-linecap="round" opacity=".8"/>
    ${eye(p, 'l', c)}${eye(p, 'r', c)}
    <path d="M95 86.5Q100 85 105 86.5Q104.5 90.5 100 93Q95.5 90.5 95 86.5Z" fill="${c.nose}" stroke="${c.noseLine}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M97.6 87.4Q100 86.7 102.2 87.4" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".55"/>
    <g class="cat-mouth cat-mouth-calm"><path d="M100 93V96M93.5 98Q97 101 100 96Q103 101 106.5 98" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="cat-mouth cat-mouth-smile"><path d="M96 99.2Q100 106.5 104 99.2Q100 101.3 96 99.2Z" fill="#8a3f45"/><path d="M100 93V96.5M92 97Q96 102.8 100 97.2Q104 102.8 108 97" fill="none" stroke="#4a4045" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="cat-mouth cat-mouth-yawn"><path d="M93 97Q100 93 107 97Q109.5 108.5 100 111.5Q90.5 108.5 93 97Z" fill="#5b2a31" stroke="#4a4045" stroke-width="1.3"/><path d="M95.2 106Q100 103 104.8 106Q103 110.3 100 110.6Q97 110.3 95.2 106Z" fill="#d77b80"/><path d="M94.8 97.6l1.6 3 1.2-3.4M105.2 97.6l-1.6 3-1.2-3.4" fill="#fff"/></g>
    <g class="cat-whiskers" fill="none" stroke="${c.whisker}" stroke-width=".95" stroke-linecap="round" opacity=".95">
      <path d="M86 94Q66 88 43 89M86 97Q64 96 41 99.5M87 100Q67 103.5 46 109M114 94Q134 88 157 89M114 97Q136 96 159 99.5M113 100Q133 103.5 154 109"/>
    </g>
    <g class="cat-purr" fill="none" stroke="${S.scarf}" stroke-width="1.6" stroke-linecap="round">
      <path d="M156 72q4 3 0 6M162 69q6 5 0 12"/>
    </g>
  </g>`;
}

// Полный кот (компактное место на компьютере и сцена) или портрет (телефон, узкая панель).
// box — место внутри сцены: {x, y, width, height} вложенного svg; coat — облик (CAT_COATS),
// неизвестный — прежний дымчатый.
export function catSvg({ id = 'cat', view = 'full', className = '', box = null, coat = 'smoke' } = {}) {
  const portrait = view === 'portrait';
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = CAT_COATS[shown];
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  return `<svg class="cat-art${className ? ` ${className}` : ''}" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="scarf" viewBox="${portrait ? PORTRAIT_VIEWBOX : CAT_VIEWBOX}"${place} aria-hidden="true" focusable="false">
    ${defs(p, c)}
    ${portrait ? '' : `<ellipse cx="104" cy="189" rx="72" ry="7.5" fill="url(#${p}-ground)"/>`}
    <g class="cat-all">
      ${portrait ? '' : `${lyingBody(p, c)}${sittingBody(p, c)}`}
      ${scarf(p)}
      ${head(p, c)}
      ${portrait ? '' : lyingFront(c)}
    </g>
  </svg>`;
}

// ---------- сцена: место кота и вещи по ступеням ----------
// Цвета стены, окна, пола и пара кружки — переменные темы через классы (pet.css), без атрибутов style в разметке
// (строгий CSP, PL07); вещи нарисованы в одном стиле с котом.

const ITEM_ART = {
  window: () => `<g class="cat-item" data-item="window">
      <rect class="cat-sky-glass" x="34" y="24" width="84" height="74" rx="8" stroke-width="5"/>
      <path class="cat-sky-bars" d="M76 26V96M36 61H116" stroke-width="3.5"/>
      <circle class="cat-sky-dot" cx="98" cy="40" r="6"/>
      <path class="cat-sky-hill" d="M40 92Q58 82 74 90" fill="none" stroke-width="5" stroke-linecap="round"/>
      <rect class="cat-sky-sill" x="28" y="96" width="96" height="7" rx="3"/>
    </g>`,
  board: () => `<g class="cat-item" data-item="board">
      <rect x="280" y="26" width="92" height="64" rx="6" fill="#c9a77c" stroke="#8b6a47" stroke-width="3"/>
      <path d="M311 30V86M341 30V86" stroke="#8b6a47" stroke-width="1.4" opacity=".6"/>
      <rect x="287" y="34" width="17" height="14" rx="1.5" fill="#f2d16b" transform="rotate(-4 295 41)"/>
      <rect x="287" y="53" width="17" height="14" rx="1.5" fill="#9fd0b6" transform="rotate(3 295 60)"/>
      <rect x="317" y="36" width="17" height="14" rx="1.5" fill="#f4a988" transform="rotate(5 325 43)"/>
      <rect x="347" y="35" width="17" height="14" rx="1.5" fill="#9fd0b6" transform="rotate(-3 355 42)"/>
      <rect x="347" y="54" width="17" height="14" rx="1.5" fill="#f2d16b" transform="rotate(4 355 61)"/>
      <path d="M350 61l3 3 6-7" fill="none" stroke="#4d7a5a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="295" cy="35" r="1.6" fill="#b24a3a"/><circle cx="325" cy="37" r="1.6" fill="#b24a3a"/><circle cx="355" cy="36" r="1.6" fill="#b24a3a"/>
    </g>`,
  plant: () => `<g class="cat-item" data-item="plant">
      <path d="M50 150Q34 128 26 112Q44 118 54 140Z" fill="#5f8f5a"/>
      <path d="M56 148Q52 118 60 96Q70 120 62 148Z" fill="#6da266"/>
      <path d="M60 150Q78 126 94 120Q88 140 66 152Z" fill="#4f7d4b"/>
      <path d="M54 150Q40 140 30 142Q42 152 56 154Z" fill="#7cae6f"/>
      <path d="M60 148Q60 124 60 104M58 150Q46 132 34 118M62 151Q76 136 88 126" fill="none" stroke="#3f6a3d" stroke-width="1.2" opacity=".7"/>
      <path d="M38 150H82L77 190Q76 196 70 196H50Q44 196 43 190Z" fill="#c4683f" stroke="#8f4527" stroke-width="2" stroke-linejoin="round"/>
      <rect x="35" y="147" width="50" height="9" rx="3" fill="#d67b51" stroke="#8f4527" stroke-width="2"/>
    </g>`,
  lamp: () => `<g class="cat-item" data-item="lamp">
      <rect x="304" y="182" width="82" height="12" rx="2.5" fill="#4f7d72" stroke="#2f5249" stroke-width="1.6"/>
      <rect x="310" y="170" width="70" height="12" rx="2.5" fill="#c9a26a" stroke="#8b6a47" stroke-width="1.6"/>
      <path d="M316 176H374M310 188H380" stroke="#fff" stroke-width="1" opacity=".35"/>
      <ellipse cx="356" cy="168" rx="16" ry="4" fill="#3b3f46"/>
      <path d="M356 166L346 122L330 108" fill="none" stroke="#3b3f46" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="346" cy="122" r="3.4" fill="#3b3f46"/>
      <path d="M318 92L342 110Q338 122 324 126L306 116Q308 100 318 92Z" fill="#d9a441" stroke="#9c6e1f" stroke-width="1.8" stroke-linejoin="round"/>
      <ellipse cx="315" cy="121" rx="10" ry="4.5" transform="rotate(32 315 121)" fill="#fff4cf"/>
    </g>`,
  notebook: () => `<g class="cat-item" data-item="notebook">
      <path d="M58 214L112 204L128 226L72 237Z" fill="#3f6b62" stroke="#244640" stroke-width="2" stroke-linejoin="round"/>
      <path d="M72 237L128 226L128.5 229.5L73 240.5Z" fill="#efe6d6" stroke="#b9a991" stroke-width="1.2"/>
      <path d="M100 206.5L116 229" stroke="#cf6741" stroke-width="2.6"/>
      <path d="M76 210L118 231" stroke="#e5c37a" stroke-width="3" stroke-linecap="round"/>
      <path d="M76 210L72 207.6" stroke="#3b3f46" stroke-width="3" stroke-linecap="round"/>
      <path d="M118 231L121 232.6" stroke="#f0b9a5" stroke-width="3" stroke-linecap="round"/>
    </g>`,
  mug: () => `<g class="cat-item" data-item="mug">
      <g class="cat-steam" fill="none" stroke-width="2" stroke-linecap="round">
        <path d="M316 196q-5-7 0-13t0-12"/><path d="M326 198q-5-7 0-13t0-11"/>
      </g>
      <path d="M306 204H336L333.5 232Q333 238 327 238H315Q309 238 308.5 232Z" fill="#f2ead9" stroke="#8b7b67" stroke-width="2" stroke-linejoin="round"/>
      <path d="M335 209Q346 209 346 218Q346 227 333.6 227" fill="none" stroke="#8b7b67" stroke-width="3.2"/>
      <path d="M307.5 214H335" stroke="#4f8a6e" stroke-width="4"/>
      <ellipse cx="321" cy="204.5" rx="15" ry="3" fill="#7a5537"/>
    </g>`,
};

// Где сидит кот: до «Уютного штаба» — подушка, с ним — лежанка (передний край — перед котом). data-room — переставляемое
// место отдыха (pet-room.mjs): подушка или лежанка вместе с питомцем.
function seat(stage) {
  if (stage >= 3) {
    return {
      name: 'bed',
      back: `<g class="cat-item" data-item="bed" data-room="rest">
        <ellipse cx="200" cy="208" rx="98" ry="32" fill="#b98a5a" stroke="#7d5733" stroke-width="2.4"/>
        <ellipse cx="200" cy="201" rx="84" ry="22" fill="#efe3d0"/>
        <ellipse cx="200" cy="204" rx="72" ry="16" fill="#e2d2bb"/>
      </g>`,
      front: `<g class="cat-item" data-item="bed-front" data-room="rest">
        <path d="M102 208Q104 236 200 240Q296 236 298 208Q284 228 200 230Q116 228 102 208Z" fill="#c99863" stroke="#7d5733" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M122 220l10 8M146 226l8 7M172 229l6 8M200 231v8M228 229l-6 8M254 226l-8 7M278 220l-10 8" stroke="#8d6340" stroke-width="2" stroke-linecap="round" opacity=".7"/>
        <path d="M110 212Q200 236 290 212" fill="none" stroke="#e2b98a" stroke-width="2" opacity=".6"/>
      </g>`,
    };
  }
  return {
    name: 'cushion',
    back: `<g class="cat-item" data-item="cushion" data-room="rest">
      <path d="M118 206C118 188 158 182 200 182C242 182 282 188 282 206C282 224 242 232 200 232C158 232 118 224 118 206Z" fill="#8ea787" stroke="#5c7558" stroke-width="2.4"/>
      <path d="M126 204C130 192 164 188 200 188C236 188 270 192 274 204" fill="none" stroke="#b6c8ae" stroke-width="2.4" opacity=".7"/>
      <path d="M120 210Q200 236 280 210" fill="none" stroke="#6f8a69" stroke-width="2" opacity=".7"/>
    </g>`,
    front: '',
  };
}

// Вещи ступеней сцены (stage — номер ступени 0–4); подушку заменяет лежанка.
export function sceneItems(stage) {
  const items = [stage >= 3 ? 'bed' : 'cushion'];
  if (stage >= 2) items.push('notebook', 'mug');
  if (stage >= 3) items.push('lamp');
  if (stage >= 4) items.push('board', 'plant');
  return items;
}

// Сцена ступени stage: стена, окно, коврик, подушка или лежанка, вещи ступени; напарник — готовая
// разметка catSvg или dogSvg с box. fresh — вещи, которых на этом устройстве ещё не видели (мягкая
// подсветка). extra — вещи напарника поверх остальных (мячик собаки, dog-art.mjs); у кота их нет.
export function sceneSvg({ id = 'scene', stage = 0, fresh = [], cat = '', extra = '' } = {}) {
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const items = sceneItems(stage);
  const freshSet = new Set(fresh);
  const art = (name, markup) => markup.replace('class="cat-item"', `class="cat-item${freshSet.has(name) ? ' is-fresh' : ''}"`);
  const pick = (names) => names.filter((name) => items.includes(name)).map((name) => art(name, ITEM_ART[name]())).join('');
  const s = seat(stage);
  const glow = items.includes('lamp')
    ? `<ellipse class="cat-lamp-glow" cx="300" cy="138" rx="190" ry="128" fill="url(#${p}-glow)"/>`
    : '';
  return `<svg class="cat-scene-art" viewBox="${SCENE_VIEWBOX}" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${p}-wall" x1="0" y1="0" x2="0" y2="1"><stop class="cat-wall-top" offset="0"/><stop class="cat-wall-low" offset="1"/></linearGradient>
      <radialGradient id="${p}-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".42"/><stop offset=".45" stop-color="#ffd98a" stop-opacity=".16"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}-rug" cx=".5" cy=".5" r=".5"><stop class="cat-rug-mid" offset="0"/><stop class="cat-rug-mid" offset=".85"/><stop class="cat-rug-edge" offset="1"/></radialGradient>
    </defs>
    <rect width="400" height="250" fill="url(#${p}-wall)"/>
    <path class="cat-floor-fill" d="M0 176H400V250H0Z"/>
    <path class="cat-floor-line" d="M0 176H400" stroke-width="3"/>
    ${ITEM_ART.window()}
    ${glow}
    ${pick(['board', 'plant', 'lamp'])}
    <ellipse cx="200" cy="216" rx="150" ry="26" fill="url(#${p}-rug)"/>
    ${art(s.name, s.back)}
    ${cat}
    ${s.front}
    ${pick(['notebook', 'mug'])}
    ${extra}
  </svg>`;
}

// Место кота в сцене: вложенный svg c общим viewBox — тот же масштаб и точка опоры.
export function sceneCatBox(stage) {
  return { x: 114, y: stage >= 3 ? 50 : 46, width: 176, height: 160 };
}

// Маленькая вещь для реакции «новая вещь» в компактном месте: та же графика, что в сцене.
const MINI = {
  mug: '300 166 52 76',
  notebook: '54 198 78 46',
  lamp: '300 86 90 112',
  bed: '98 172 204 72',
  board: '276 22 100 72',
  plant: '22 94 74 104',
};

export function miniItemSvg(name) {
  if (!MINI[name]) return '';
  const art = name === 'bed' ? seat(3).back + seat(3).front : ITEM_ART[name]();
  return `<svg class="cat-mini-art" viewBox="${MINI[name]}" aria-hidden="true" focusable="false">${art}</svg>`;
}

// ---------- миска ежедневного лакомства (с 2026-10-08) ----------
// Общая для кота и собаки, в координатах сцены: перед подушкой, слева от лап. state — состояние
// ритуала (waiting — миски нет, ready — пустая, fed — пустая после лакомства); корм виден, пока
// напарник ест (поза feed, pet.css). full — корм сразу (маленькая миска на время реакции).
const BOWL = `<ellipse cx="170" cy="213" rx="25" ry="4.2" fill="#3a2414" opacity=".16"/>
      <path d="M147.5 200.5Q149.5 212.5 158 213.5H182Q190.5 212.5 192.5 200.5Z" fill="#4f8a6e" stroke="#2f5249" stroke-width="2" stroke-linejoin="round"/>
      <path d="M150.5 206.5Q170 210.5 189.5 206.5" fill="none" stroke="#f2ead9" stroke-width="2" stroke-linecap="round" opacity=".55"/>
      <ellipse cx="170" cy="200.5" rx="22.5" ry="5.2" fill="#6aa58a" stroke="#2f5249" stroke-width="2"/>
      <ellipse cx="170" cy="200.8" rx="18" ry="3.4" fill="#2f5249"/>`;
const FOOD = `<path d="M153.5 200.8Q156 193.5 162 194Q166 190.5 171 192.5Q177 190 180 194.5Q185.5 195 186.5 200.8Z" fill="#b0743f" stroke="#7a4a22" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="161" cy="196.6" r="2.1" fill="#d39a5e"/><circle cx="170.5" cy="194.6" r="2.2" fill="#d39a5e"/><circle cx="178.6" cy="197" r="2" fill="#d39a5e"/>`;

export function bowlArt({ state = 'ready', full = false } = {}) {
  return `<g class="cat-bowl" data-cat-bowl data-state="${state === 'fed' ? 'fed' : state === 'waiting' ? 'waiting' : 'ready'}" data-room="bowl">
      ${BOWL}
      <g class="cat-bowl-food"${full ? ' data-full' : ''}>${FOOD}</g>
    </g>`;
}

// Миска рядом с напарником в боковой панели — на время кормления (с кормом, потом пустая).
export function bowlMiniSvg({ full = true } = {}) {
  return `<svg class="cat-mini-art" viewBox="142 178 56 40" aria-hidden="true" focusable="false">${bowlArt({ state: 'fed', full })}</svg>`;
}

// Миска в сцене «Поиграть» (с 2026-10-10) — предмет на полу (pet-toys.mjs): та же миска, всегда пустая; state — день
// лакомства, как в уголке (корм в сцене не показывается, перенос не кормит).
export function bowlToySvg(state = 'ready') {
  return `<svg class="cat-play-toy-art" viewBox="144 193 52 25" aria-hidden="true" focusable="false">${bowlArt({ state })}</svg>`;
}

// Клубок кота (с 2026-10-10) — игрушка уголка, доступна сразу; место — pet-room.mjs («Обустроить уголок»).
export function yarnArt() {
  return `<g class="cat-item" data-item="yarn" data-room="yarn">
      <ellipse cx="37" cy="242" rx="14" ry="2.4" fill="#3a2414" opacity=".16"/>
      <path d="M45 238q4 4 8 1" fill="none" stroke="#9e4528" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="36" cy="231" r="11" fill="#cf6741" stroke="#9e4528" stroke-width="2"/>
      <path d="M27.5 225q8-3.5 16 3.5M26 231.5q9-5.5 19 2M28.5 237.5q7.5-4.5 13.5.5M33 220.8q-4.5 7.5 0 19" fill="none" stroke="#e58a5f" stroke-width="1.7" stroke-linecap="round"/>
    </g>`;
}
