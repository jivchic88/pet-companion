// Веб: набор отображения кролика bunnyWeb (с 0.4.0; docs/ARCHITECTURE.md § 7.3, § 7.4) — рисунок bunny-art.mjs, обёрнутый в
// набор по тем же правилам, что catWeb и dogWeb (web/kits.mjs): рисует по снимку (поза — data-pose, облик — data-coat,
// надетый аксессуар — data-acc, вид — data-view) и не принимает решений. Отдельно от штатных наборов: кролик не входит в
// перечень входа «.» (бюджет сайтов с котом и собакой) — его подключают явно: mountPet({ pets: [cat, dog, bunny], kits:
// [bunnyWeb] }) и pet-companion/bunny.css на странице; контейнер (mountPetIn) берёт стили набора из его styles сам.

import { bunnySvg, carrotArt, hayArt, hayMiniSvg } from '../bunny-art.mjs';
import { POSES } from '../core/define.mjs';

// Надетый аксессуар на портрете выбора: рисунок по умолчанию — голубая ленточка ribbon.
const withAcc = (markup, accessory) => (accessory ? markup.replace('data-acc="ribbon"', `data-acc="${accessory}"`) : markup);

export const bunnyWeb = Object.freeze({
  pet: 'bunny',
  poses: Object.freeze([...POSES, 'hop', 'wash']),
  scenes: Object.freeze(['hop', 'wash']),
  coats: Object.freeze(['snow', 'grey', 'spot']),
  accessories: Object.freeze(['ribbon', 'bow', 'clover']),
  items: Object.freeze(['carrot', 'hay']),
  art: ({ id, view, coat, className, box, accessory } = {}) => withAcc(bunnySvg({ id, view, coat, className, box }), accessory),
  item: (id, { fresh = false } = {}) => (id === 'carrot' ? carrotArt() : id === 'hay' ? hayArt({ fresh }) : ''),
  mini: (id) => (id === 'hay' ? hayMiniSvg() : ''),
  // Адрес стилей набора — отдельный литерал new URL('…', import.meta.url): его видят сборщик и перечень (manifest.json).
  styles: Object.freeze([new URL('../bunny.css', import.meta.url).href]),
});
