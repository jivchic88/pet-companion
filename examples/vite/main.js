// Модуль сайта со сборщиком (examples/vite): только публичные входы пакета. Контейнер — mountPetIn (стили пакета и набора
// кролика вид подключает в своё теневое дерево), шапка — прежний mountPet (стили пакета — импортом, порядок каскада).
import { mountPet } from 'pet-companion';
import { calm } from 'pet-companion/behaviors';
import { cat, dog } from 'pet-companion/pets';
import { mountPetIn } from 'pet-companion/web';
import 'pet-companion/pet-base.css';
import 'pet-companion/pet.css';
import 'pet-companion/dog.css';
import { bunny } from '../extension/bunny.mjs';
import { bunnyWeb } from '../extension/bunny-web.mjs';

let marks = 0; // знаки за занятия — считает сайт
let today = 0;
const progress = () => ({ marks, today, limit: 3 });

// Питомец в блоке страницы — со своим питомцем-расширением; настройки — в пространстве vite-view.
const view = mountPetIn(document.getElementById('pet'), { namespace: 'vite-view', progress, pets: [cat, dog, bunny], behaviors: [calm], kits: [bunnyWeb] });
// Прежнее подключение в шапке — своё пространство имён.
const head = document.getElementById('head');
const pet = mountPet({ storage: 'vite-legacy', places: { logo: (el) => head.append(el), top: (el) => head.prepend(el) }, progress });

document.getElementById('done').addEventListener('click', () => {
  marks += 1;
  today += 1;
  const event = { key: `lesson-${marks}`, counted: true, first: today === 1 };
  view.core?.notify('saved', event);
  pet.notify('saved', event);
});
document.getElementById('bunny').addEventListener('click', () => view.core?.setPet('example.bunny'));
document.getElementById('cat').addEventListener('click', () => view.core?.setPet('cat'));

window.viteDemo = { view, pet };
