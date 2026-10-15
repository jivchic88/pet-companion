// Пример расширения (вне пакета): набор отображения кролика для legacy-веба mountPet — код рисования, отдельно от
// определения (bunny.mjs) и модели. Рисует по снимку: позу (data-pose), облик (data-coat), надетый аксессуар (data-acc),
// сценку (data-scene) и одиночные движения (data-micro) показывают стили bunny.css; решений набор не принимает. Рисунок —
// простой SVG в единицах определения (220×204, земля — y = 188), без сети и внешних ресурсов. Своя вещь комнаты —
// морковка (data-room="carrot", единицы сцены 400×250). Подключение: legacy — mountPet({ pets, behaviors, kits: [bunnyWeb] }) и
// <link rel="stylesheet" href="./bunny.css"> на странице; контейнер (PL07) — mountPetIn(el, { pets, behaviors, kits:
// [bunnyWeb] }): стили набора — его styles (адрес рядом с этим модулем), вид подключает их в своё теневое дерево сам.

const COATS = {
  snow: { fur: '#f6f3ee', shade: '#ddd6cc', line: '#8e8478', inner: '#f2b6bf', spot: 'none' },
  grey: { fur: '#bdb8b2', shade: '#9e988f', line: '#6c665f', inner: '#e9a9b3', spot: 'none' },
  spot: { fur: '#f6f3ee', shade: '#ddd6cc', line: '#8e8478', inner: '#f2b6bf', spot: '#8a6a4f' },
};
const coatOf = (coat) => (Object.hasOwn(COATS, coat) ? coat : 'snow');
const POSES = ['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff', 'hop'];

function svg({ id = 'bunny', view = 'full', coat = 'snow', className = '', box = null, accessory = 'ribbon' } = {}) {
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  const shown = coatOf(coat);
  const c = COATS[shown];
  const portrait = view === 'portrait';
  const place = box ? ` x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" overflow="visible"` : '';
  const spot = c.spot === 'none' ? '' : `<ellipse cx="128" cy="140" rx="18" ry="14" fill="${c.spot}" opacity=".85"/><ellipse cx="88" cy="74" rx="11" ry="9" fill="${c.spot}" opacity=".85"/>`;
  return `<svg class="cat-art bunny-art${className ? ` ${className}` : ''}" data-kind="example.bunny" data-view="${portrait ? 'portrait' : 'full'}" data-coat="${shown}" data-pose="calm" data-acc="${accessory}" viewBox="${portrait ? '50 4 108 108' : '0 0 220 204'}"${place} aria-hidden="true" focusable="false">
    <defs><radialGradient id="${p}-fur" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="${c.fur}"/><stop offset="1" stop-color="${c.shade}"/></radialGradient></defs>
    ${portrait ? '' : `<ellipse class="bunny-shadow" cx="108" cy="190" rx="62" ry="6.5" fill="#3a2414" opacity=".14"/>`}
    <g class="cat-all bunny-all">
      ${
        portrait
          ? ''
          : `<g class="bunny-body">
        <circle class="bunny-tail" cx="166" cy="166" r="13" fill="#fffdf8" stroke="${c.line}" stroke-width="1.6"/>
        <ellipse cx="110" cy="152" rx="58" ry="38" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="2"/>
        <ellipse cx="146" cy="162" rx="26" ry="23" fill="${c.fur}" stroke="${c.line}" stroke-width="1.8"/>
        ${spot}
        <ellipse class="bunny-foot" cx="88" cy="186" rx="15" ry="6.5" fill="${c.fur}" stroke="${c.line}" stroke-width="1.6"/>
        <ellipse class="bunny-foot" cx="122" cy="186" rx="15" ry="6.5" fill="${c.fur}" stroke="${c.line}" stroke-width="1.6"/>
      </g>`
      }
      <g class="bunny-head">
        <g class="bunny-ear bunny-ear-l"><ellipse cx="86" cy="40" rx="12" ry="32" fill="${c.fur}" stroke="${c.line}" stroke-width="2"/><ellipse cx="86" cy="43" rx="5.5" ry="24" fill="${c.inner}"/></g>
        <g class="bunny-ear bunny-ear-r"><ellipse cx="122" cy="38" rx="12" ry="32" fill="${c.fur}" stroke="${c.line}" stroke-width="2"/><ellipse cx="122" cy="41" rx="5.5" ry="24" fill="${c.inner}"/></g>
        <ellipse cx="104" cy="88" rx="40" ry="34" fill="url(#${p}-fur)" stroke="${c.line}" stroke-width="2"/>
        <g class="bunny-eyes bunny-eyes-open"><circle cx="90" cy="84" r="5.2" fill="#2c2622"/><circle cx="118" cy="84" r="5.2" fill="#2c2622"/><circle cx="91.6" cy="82.4" r="1.6" fill="#fff"/><circle cx="119.6" cy="82.4" r="1.6" fill="#fff"/></g>
        <g class="bunny-eyes bunny-eyes-shut" fill="none" stroke="#2c2622" stroke-width="2.2" stroke-linecap="round"><path d="M84 85q6 5 12 0"/><path d="M112 85q6 5 12 0"/></g>
        <circle cx="80" cy="97" r="6" fill="${c.inner}" opacity=".55"/><circle cx="128" cy="97" r="6" fill="${c.inner}" opacity=".55"/>
        <path class="bunny-nose" d="M100 96h8l-4 5z" fill="#d97f8c"/>
        <path d="M104 101v4M104 105q-4 4-8 2M104 105q4 4 8 2" fill="none" stroke="${c.line}" stroke-width="1.6" stroke-linecap="round"/>
      </g>
      <g class="cat-acc" data-acc-part="ribbon"><path d="M74 114q30 12 60 0l-2 8q-28 10-56 0z" fill="#6aa7d8" stroke="#3f6f99" stroke-width="1.6"/></g>
      <g class="cat-acc" data-acc-part="bow"><path d="M74 114q30 12 60 0l-2 8q-28 10-56 0z" fill="#d86a8c" stroke="#99415c" stroke-width="1.6"/><path d="M96 118l-12-8v16zM112 118l12-8v16z" fill="#e88aa6" stroke="#99415c" stroke-width="1.4"/><circle cx="104" cy="118" r="4" fill="#d86a8c" stroke="#99415c" stroke-width="1.4"/></g>
      <g class="cat-acc" data-acc-part="clover"><path d="M74 114q30 12 60 0l-2 8q-28 10-56 0z" fill="#6fae73" stroke="#3f7444" stroke-width="1.6"/><g fill="#4f9a55" stroke="#2f5f33" stroke-width="1"><circle cx="100" cy="122" r="4"/><circle cx="108" cy="122" r="4"/><circle cx="104" cy="117" r="4"/></g></g>
    </g>
  </svg>`;
}

// Морковка — своя игрушка комнаты: исходное место [40, 232] (room.toys определения), сдвиг — transform отображения.
function carrot({ fresh = false } = {}) {
  return `<g class="cat-item${fresh ? ' is-fresh' : ''}" data-item="carrot" data-room="carrot">
      <ellipse cx="40" cy="240" rx="16" ry="2.4" fill="#3a2414" opacity=".16"/>
      <path d="M24 232q2-6 10-6l22 4q2 2 0 4l-22 4q-8 0-10-6z" fill="#ec8b36" stroke="#b3601d" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M33 229l2 6M41 228l1 7M48 230l1 4" stroke="#c96f25" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M56 232q6-8 10-6M56 232q8-2 10 4M56 232q4 6 8 8" fill="none" stroke="#4f9a55" stroke-width="2.4" stroke-linecap="round"/>
    </g>`;
}

export const bunnyWeb = Object.freeze({
  pet: 'example.bunny',
  poses: Object.freeze(POSES),
  scenes: Object.freeze(['hop']),
  coats: Object.freeze(Object.keys(COATS)),
  accessories: Object.freeze(['ribbon', 'bow', 'clover']),
  items: Object.freeze(['carrot']),
  art: (options) => svg(options),
  item: (id, options) => (id === 'carrot' ? carrot(options) : ''),
  styles: Object.freeze([new URL('./bunny.css', import.meta.url).href]),
});
