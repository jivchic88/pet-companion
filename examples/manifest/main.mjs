// Модуль страницы примера (examples/manifest/index.html): вход ./web — по пути из перечня (vendor/pet-companion/pet/web.mjs).
// Сайт считает знаки и сообщает о занятии.
import { mountPetIn } from './vendor/pet-companion/pet/web.mjs';

let marks = 0; // знаки за занятия — считает сайт
let today = 0;
const status = document.getElementById('status');
const view = mountPetIn(document.getElementById('pet'), { namespace: 'manifest-demo', progress: () => ({ marks, today, limit: 3 }) });
status.textContent = view.mounted ? 'Питомец подключён.' : 'Питомец не подключён — причина в консоли.';

document.getElementById('done').addEventListener('click', () => {
  marks += 1;
  today += 1;
  view.core?.notify('saved', { key: `lesson-${marks}`, counted: true, first: today === 1 });
});

window.manifestDemo = view;
