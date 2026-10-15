// Только проверки: legacy mountPet под строгим CSP (test/csp-legacy/index.html) — места в шапке и внизу окна.
import { mountPet } from '../pet/pet.mjs';

const head = document.getElementById('head');
window.legacyPet = mountPet({
  storage: 'csp-legacy',
  places: { logo: (el) => head.append(el), top: (el) => head.prepend(el), float: (el) => document.body.append(el) },
  progress: () => ({ marks: 1, today: 1, limit: 3 }),
});
