// Типы входов стилей pet-companion/pet.css, pet-companion/dog.css, pet-companion/bunny.css, pet-companion/pet-base.css (условие "types" в exports
// package.json). Стиль подключают ради побочного эффекта — import 'pet-companion/pet.css'; значений он не экспортирует
// (это не CSS Modules), поэтому модуль пустой. Сборщик и Node по тем же входам получают настоящий файл .css.
export {};
