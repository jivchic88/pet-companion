// Облик (pet/pet-rules.mjs, pet/cat-art.mjs, pet/dog-art.mjs): три облика у каждого животного, отдельный ключ без
// потери чужих полей и облика другого животного, та же геометрия и позы у всех обликов.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../pet/pet-rules.mjs';
import { CAT_COATS, PALETTE, catSvg, sceneCatBox, sceneSvg } from '../pet/cat-art.mjs';
import { DOG_COATS, DOG_PALETTE, dogSvg } from '../pet/dog-art.mjs';

const ART = { cat: { svg: catSvg, coats: CAT_COATS }, dog: { svg: dogSvg, coats: DOG_COATS } };
const K = R.storageKeys('site');

// ---------- облик: правила и хранение ----------

test('облик: три варианта у каждого животного, первый — прежний; неизвестный — по умолчанию', () => {
  assert.equal(K.look, 'site:look:v1');
  assert.equal(new Set([K.look, K.cat, K.companion, K.treat]).size, 4, 'отдельный ключ');
  for (const kind of R.KINDS) {
    const coats = R.coatsOf(kind);
    assert.equal(coats.length, 3, kind);
    assert.equal(new Set(coats.map((coat) => coat.id)).size, 3, `${kind}: id разные`);
    for (const coat of coats) assert.ok(coat.title.length >= 4 && coat.title.length <= 18, `${kind}: «${coat.title}» — коротко`);
    for (const bad of [undefined, '', 'purple', 42, null, coats === R.COATS.cat ? 'caramel' : 'smoke']) assert.equal(R.coatOf(kind, bad), coats[0].id, `${kind}: ${bad}`);
  }
  assert.deepEqual(R.defaultLook(), { v: 1, cat: 'smoke', dog: 'caramel' });
  // Прежние Марс и Тоби — облик по умолчанию: палитры совпадают с прежними экспортами.
  assert.equal(PALETTE.fur, '#8f949c');
  assert.equal(DOG_PALETTE.fur, '#d39652');
});

test('облик: повреждённое и чужое значение — без сбоя; запись хранит чужие поля и облик другого животного', () => {
  for (const bad of [null, '', '{oops', '[]', '"ginger"', '42', '{"cat":"purple","dog":7}', '{"cat":"caramel","dog":"smoke"}']) {
    assert.deepEqual(R.parseLook(bad), R.defaultLook(), String(bad));
  }
  assert.deepEqual(R.parseLook('{"v":9,"cat":"tuxedo","dog":"spotted","hat":"cap"}'), { v: 1, cat: 'tuxedo', dog: 'spotted' });
  // Запись облика кота не трогает облик собаки и поля будущих версий.
  const stored = JSON.stringify({ v: 2, cat: 'smoke', dog: 'blacktan', hat: 'cap', extra: { a: 1 } });
  const written = R.lookRecord(stored, { cat: 'ginger' });
  assert.deepEqual(written, { v: 1, cat: 'ginger', dog: 'blacktan', hat: 'cap', extra: { a: 1 } });
  assert.deepEqual(R.lookRecord('{oops', { dog: 'spotted' }), { v: 1, cat: 'smoke', dog: 'spotted' });
  assert.deepEqual(R.lookRecord(null, { dog: 'nope' }), R.defaultLook(), 'неизвестный облик не записывается');
  // Две вкладки: одна меняет кота, другая (по свежему значению) — собаку; ничего не теряется.
  let key = null;
  key = JSON.stringify(R.lookRecord(key, { cat: 'tuxedo' }));
  key = JSON.stringify(R.lookRecord(key, { dog: 'spotted' }));
  assert.deepEqual(R.parseLook(key), { v: 1, cat: 'tuxedo', dog: 'spotted' });
  const once = JSON.stringify(R.parseLook(key));
  assert.equal(JSON.stringify(R.parseLook(once)), once, 'нормализация идемпотентна');
});

// ---------- облик: графика ----------

const classes = (svg) => [...svg.matchAll(/class="([^"]+)"/g)].map(([, value]) => value).sort((a, b) => a.localeCompare(b));
const geometry = (svg) => ({ viewBox: /viewBox="([^"]+)"/.exec(svg)[1], place: /<svg[^>]*?( x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+")/.exec(svg)?.[1] ?? '' });

test('облик: у всех обликов те же части, позы, аксессуары, рамка и точка опоры; рисунок без внешних ресурсов', () => {
  for (const [kind, { svg, coats }] of Object.entries(ART)) {
    assert.deepEqual(Object.keys(coats), R.coatsOf(kind).map((coat) => coat.id), `${kind}: палитра у каждого облика`);
    for (const view of ['full', 'portrait']) {
      const base = svg({ id: 'b', view });
      for (const coat of Object.keys(coats)) {
        const shown = svg({ id: 'b', view, coat });
        assert.match(shown, new RegExp(`data-coat="${coat}"`));
        assert.deepEqual(geometry(shown), geometry(base), `${kind} ${coat} ${view}: та же рамка`);
        // Те же группы поз и частей (отметины — только дополнительные пути без классов).
        assert.deepEqual(classes(shown), classes(base), `${kind} ${coat} ${view}: те же части`);
        for (const accessory of R.ACCESSORIES) assert.ok(shown.includes(`data-acc-part="${accessory.id}"`), `${kind} ${coat}: ${accessory.id}`);
        assert.doesNotMatch(shown, /https?:|href=|<image|undefined|NaN/, `${kind} ${coat}`);
        const ids = new Set([...shown.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
        for (const [, ref] of shown.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.has(ref), `${kind} ${coat}: ссылка на чужой id ${ref}`);
      }
    }
    // Место в сцене и коробка — общие (без прыжков при смене облика).
    for (const stage of [0, 3]) {
      const boxes = Object.keys(coats).map((coat) => geometry(svg({ id: 's', box: sceneCatBox(stage), coat })).place);
      assert.equal(new Set(boxes).size, 1, `${kind}: ступень ${stage}`);
    }
    assert.equal(svg({ id: 'x', coat: 'нет-такого' }), svg({ id: 'x' }), `${kind}: неизвестный облик — прежний рисунок`);
  }
  // «Дай лапу» и мячик — у собаки во всех обликах; миска — общая сцена.
  for (const coat of Object.keys(DOG_COATS)) assert.ok(dogSvg({ id: 'd', coat }).includes('dog-paw-up'), coat);
  assert.match(sceneSvg({ id: 's', stage: 2, cat: dogSvg({ id: 'd', box: sceneCatBox(2), coat: 'spotted' }) }), /data-coat="spotted"/);
});

