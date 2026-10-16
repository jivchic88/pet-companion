// Модуль страницы examples/manifest/legacy.html: вход «.» — по пути из перечня (vendor/pet-companion/pet/pet.mjs).
import { mountPet } from './vendor/pet-companion/pet/pet.mjs';

let marks = 0;
let today = 0;
const head = document.getElementById('head');
const pet = mountPet({
  storage: 'manifest-legacy',
  places: { logo: (el) => head.append(el), top: (el) => head.prepend(el), float: (el) => document.body.append(el) },
  progress: () => ({ marks, today, limit: 3 }),
});

document.getElementById('done').addEventListener('click', () => {
  marks += 1;
  today += 1;
  pet.notify('saved', { key: `lesson-${marks}`, counted: true, first: today === 1 });
});

window.manifestLegacy = pet;
