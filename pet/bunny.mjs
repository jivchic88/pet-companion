// pet-companion/bunny — кролик: штатное определение формата 1 (данные) и веб-набор отображения (с 0.4.0; README,
// «Кролик»). Отдельный вход: сайт с котом и собакой его не загружает (перечень входа «.» и бюджет не меняются), сайт с
// кроликом подключает явно — mountPet({ pets: [cat, dog, bunny], kits: [bunnyWeb] }) и стили pet-companion/bunny.css
// (контейнер mountPetIn подключает стили набора сам). Нативный набор — bunnyNative входа pet-companion/native.

export { bunny } from './defs/bunny.mjs';
export { bunnyWeb } from './web/bunny.mjs';
