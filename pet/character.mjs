// pet-companion/character — минимальный режим компаньона без DOM (U01; README, «Персонаж: минимальный режим»;
// docs/ARCHITECTURE.md § 19): описание персонажа (defineCharacter — только данные: позы, реакции продукта, реплики) и его
// экземпляр (createCharacter — реакции, реплики, тишина, видимость, уменьшение движения, покой, подписка, отключение) на
// тех же правилах, что у полного ядра, без комнаты, игры, кормления, ступеней, аксессуаров и хранения. Импорт ничего не
// делает; порты по умолчанию — системные. Веб — вход pet-companion/character-web, React — pet-companion/character-react.

export { createCharacter } from './character/core.mjs';
export { defineCharacter } from './character/define.mjs';
export { PetError } from './core/errors.mjs';
export { VERSION } from './core/version.mjs';
