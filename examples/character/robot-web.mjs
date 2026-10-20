// Пример минимального режима (вне пакета): набор отображения робота для mountCharacterIn — код рисования, отдельно от
// описания (robot.mjs). Рисует один SVG; позу (data-pose), одиночные движения (data-micro) и режим движения (data-motion)
// показывают стили robot.css — атрибуты ставит вид. Решений набор не принимает; сети и внешних ресурсов нет. Стили набора —
// styles (адрес рядом с этим модулем): вид подключает их в своё теневое дерево сам.

const POSES = ['calm', 'attentive', 'rest', 'happy', 'think', 'wave'];

function svg({ id = 'robot' } = {}) {
  const p = String(id).replace(/[^a-z0-9-]/gi, '');
  return `<svg class="robot-art" viewBox="0 0 220 204" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${p}-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee3"/><stop offset="1" stop-color="#a7b0b8"/></linearGradient></defs>
    <ellipse class="robot-shadow" cx="110" cy="192" rx="56" ry="6" fill="#2b3135" opacity=".15"/>
    <g class="robot-all">
      <g class="robot-antenna"><line x1="110" y1="38" x2="110" y2="18" stroke="#6b747c" stroke-width="3" stroke-linecap="round"/><circle class="robot-light" cx="110" cy="14" r="6" fill="#f2b64b"/></g>
      <g class="robot-arm robot-arm-l"><rect x="40" y="104" width="22" height="46" rx="10" fill="url(#${p}-metal)" stroke="#6b747c" stroke-width="2"/></g>
      <g class="robot-arm robot-arm-r"><rect x="158" y="104" width="22" height="46" rx="10" fill="url(#${p}-metal)" stroke="#6b747c" stroke-width="2"/></g>
      <g class="robot-body"><rect x="62" y="96" width="96" height="78" rx="16" fill="url(#${p}-metal)" stroke="#6b747c" stroke-width="2"/><rect x="86" y="118" width="48" height="26" rx="6" fill="#2f3a44"/><circle class="robot-lamp" cx="110" cy="131" r="6" fill="#5cc5a7"/></g>
      <rect x="80" y="172" width="22" height="16" rx="5" fill="#6b747c"/><rect x="118" y="172" width="22" height="16" rx="5" fill="#6b747c"/>
      <g class="robot-head"><rect x="66" y="38" width="88" height="62" rx="18" fill="url(#${p}-metal)" stroke="#6b747c" stroke-width="2"/>
        <g class="robot-eyes"><circle class="robot-eye" cx="92" cy="66" r="8" fill="#2f3a44"/><circle class="robot-eye" cx="128" cy="66" r="8" fill="#2f3a44"/><circle class="robot-pupil" cx="92" cy="66" r="3.5" fill="#5cc5a7"/><circle class="robot-pupil" cx="128" cy="66" r="3.5" fill="#5cc5a7"/></g>
        <path class="robot-mouth robot-mouth-line" d="M96 86h28" fill="none" stroke="#2f3a44" stroke-width="3" stroke-linecap="round"/>
        <path class="robot-mouth robot-mouth-smile" d="M94 84q16 12 32 0" fill="none" stroke="#2f3a44" stroke-width="3" stroke-linecap="round"/>
        <path class="robot-mouth robot-mouth-o" d="M104 82h12a6 6 0 0 1 0 12h-12a6 6 0 0 1 0-12z" fill="#2f3a44"/>
      </g>
    </g>
  </svg>`;
}

export const robotWeb = Object.freeze({
  character: 'example.robot',
  poses: Object.freeze(POSES),
  art: (options) => svg(options),
  styles: Object.freeze([new URL('./robot.css', import.meta.url).href]),
});
