// pet-companion/character-web — персонаж в контейнере страницы (минимальный режим веба, U01; README, «Персонаж: минимальный
// режим»): mountCharacterIn(container, { character, kit, name?, label?, onActivate?, watchTyping? }) → view. Импорт ничего не
// делает (безопасен для серверного рендера); сам персонаж — только в браузере. Описание и экземпляр без DOM — вход
// pet-companion/character, React — pet-companion/character-react.

export { mountCharacterIn } from './character/view.mjs';
