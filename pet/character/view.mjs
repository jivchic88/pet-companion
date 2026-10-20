// Персонаж в контейнере (минимальный режим веба, U01; README, «Персонаж: минимальный режим»; docs/ARCHITECTURE.md § 19):
// свой элемент <div data-pet-character> с открытым Shadow DOM — рисунок набора (art), облако реплики, область объявлений
// скринридеру; стили — view.css пакета и styles набора по их адресам (<link> в теневом дереве); тема — переменные --pet-*
// контейнера (как у mountPetIn). Экземпляр — character/core.mjs: отображение распознаёт страницу (ввод в поля — тишина,
// видимость вкладки и размер контейнера, prefers-reduced-motion, действия пользователя) и рисует снимок и эффекты; решений
// здесь нет. Всё состояние — в замыкании mountCharacterIn (несколько персонажей на странице независимы, в том числе рядом с
// mountPet и mountPetIn). Тексты — только textContent: разметки от продукта не требуется и не принимается.
//
// Набор отображения персонажа: { character — ID описания; poses — что нарисовано (все позы описания обязательны);
// art({ id }) — строка <svg …>: позу, одиночное движение и режим движения показывают атрибуты data-pose, data-micro,
// data-motion, которые ставит вид; styles? — абсолютные адреса CSS набора }. Проверка — до любых действий.

import { esc, fragment, safe, TEXT_INPUT } from '../web/parts.mjs';
import { createCharacter } from './core.mjs';
import { defineCharacter } from './define.mjs';

const OPTIONS = ['character', 'kit', 'name', 'label', 'onActivate', 'watchTyping'];
const REDUCED = '(prefers-reduced-motion: reduce)';
// Задержка объявления скринридеру: область aria-live сначала очищается, затем получает текст.
const ANNOUNCE_MS = 80;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

const views = new WeakMap();
const isElement = (value) => Boolean(value) && typeof value === 'object' && value.nodeType === 1 && typeof value.append === 'function';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function absoluteUrl(value) {
  if (typeof value !== 'string' && !(typeof URL === 'function' && value instanceof URL)) return false;
  try {
    return Boolean(new URL(String(value)).href);
  } catch {
    return false;
  }
}

// Проблема набора (строка для отказа) или ''.
export function characterKitProblem(kit, def) {
  if (!isObject(kit)) return 'набор отображения персонажа — объект';
  if (kit.character !== def.id) return `набор «${String(kit.character)}»: не для персонажа «${def.id}»`;
  const at = `набор «${def.id}»`;
  if (!Array.isArray(kit.poses) || kit.poses.some((pose, i) => !Object.hasOwn(kit.poses, i) || typeof pose !== 'string')) return `${at}: poses — плотный массив строк`;
  const missing = def.poses.filter((pose) => !kit.poses.includes(pose));
  if (missing.length) return `${at}: не нарисовано (poses): ${missing.join(', ')}`;
  if (typeof kit.art !== 'function') return `${at}: art — функция рисунка`;
  if (kit.styles !== undefined && !(Array.isArray(kit.styles) && kit.styles.every((item, i) => Object.hasOwn(kit.styles, i) && absoluteUrl(item)))) return `${at}: styles — плотный массив абсолютных адресов CSS (строка или URL)`;
  let markup;
  try {
    markup = kit.art({ id: 'probe' });
  } catch (error) {
    return `${at}: art бросил исключение (${error instanceof Error ? error.message : String(error)})`;
  }
  if (typeof markup !== 'string' || !/^\s*<svg[\s>]/.test(markup)) return `${at}: art({ id }) — строка <svg …>`;
  return '';
}

function viewProblem(container, o) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'нет document — mountCharacterIn подключается только в браузере';
  if (!isElement(container)) return 'контейнер — элемент страницы';
  if (!container.isConnected || container.ownerDocument !== document) return 'контейнер не в документе этой страницы — подключите персонажа после вставки контейнера';
  if (!isRecord(o)) return 'настройки — объект { character, kit, … }';
  for (const key of Object.keys(o)) if (!OPTIONS.includes(key)) return `неизвестная настройка: ${key}`;
  if (!Object.hasOwn(o, 'character')) return 'character — описание персонажа (defineCharacter)';
  if (!Object.hasOwn(o, 'kit')) return 'kit — набор отображения персонажа';
  if (o.name !== undefined && typeof o.name !== 'string') return 'name — строка';
  if (o.label !== undefined && typeof o.label !== 'string' && typeof o.label !== 'function') return 'label — строка или функция от снимка';
  if (o.onActivate !== undefined && o.onActivate !== null && typeof o.onActivate !== 'function') return 'onActivate — функция';
  if (o.watchTyping !== undefined && typeof o.watchTyping !== 'boolean') return 'watchTyping — boolean';
  if (views.get(container)?.mounted || [...container.children].some((child) => child.hasAttribute('data-pet-character'))) return 'в контейнере уже есть персонаж — сначала destroy() прежнего вида';
  return '';
}

const isTextField = (element) => Boolean(element && typeof element.matches === 'function' && element.matches(TEXT_INPUT));

// Подключить персонажа в контейнер. Синхронно, не бросает исключений: отказ — view.mounted === false, одно console.error,
// ничего не создано. view.core — экземпляр (null при отказе; после отключения — тот же отключённый). view.destroy() —
// отключить экземпляр и вид; то же делает view.core.destroy().
export function mountCharacterIn(container, options) {
  let core = null;
  let alive = false;
  const view = Object.freeze({
    get mounted() {
      return alive;
    },
    get core() {
      return core;
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (views.get(container) === view) views.delete(container);
      safe(() => teardown())();
    },
  });
  const refuse = (why) => (console.error('Персонаж не подключён:', why), view);
  let why;
  let def = null;
  try {
    why = viewProblem(container, options);
    if (!why) {
      def = defineCharacter(options.character);
      why = characterKitProblem(options.kit, def);
    }
  } catch (error) {
    why = error;
  }
  if (why) return refuse(why);
  const o = options;
  const kit = o.kit;

  // ---------- состояние вида (на экземпляр) ----------
  const abort = new AbortController();
  const timers = {};
  let host = null;
  let shadow = null;
  let box = null;
  let figure = null;
  let say = null;
  let live = null;
  let ro = null;
  let pending = 0; // стили, которые ещё грузятся
  let ready = false;
  let seen = true; // видимость, о которой сказано экземпляру
  let unsub = null;
  let lost = false; // экземпляр отключили напрямую (core.destroy())
  let teardownDone = false;

  const on = (target, type, fn, extra = {}) => target.addEventListener(type, fn, { ...extra, signal: abort.signal });
  function later(key, ms, fn) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(
      safe(() => alive && fn()),
      ms,
    );
  }

  const labelOf = (state) => {
    const own = typeof o.label === 'function' ? safe(() => o.label(state))() : o.label;
    return typeof own === 'string' && own.trim() ? own : state.name.value ? `${state.name.display} — ${state.character.title}` : state.character.title;
  };

  // Персонаж на виду: стили загружены, у своего элемента есть размеры, вкладка видна.
  const showing = () => ready && Boolean(host?.isConnected) && host.clientWidth > 0 && host.clientHeight > 0 && !document.hidden;

  function syncVisible() {
    if (!alive) return;
    const next = showing();
    if (next === seen) return;
    seen = next;
    host.toggleAttribute('data-pet-paused', !next);
    core.setVisible(next);
  }

  function render(state) {
    const art = figure.querySelector('svg');
    if (art) {
      art.dataset.pose = state.pose.shown;
      art.dataset.motion = state.prefs.effectiveMotion;
      if (state.pose.reaction) delete art.dataset.micro;
    }
    box.dataset.pose = state.pose.shown;
    box.dataset.motion = state.prefs.effectiveMotion;
    host.setAttribute('data-pet-motion', state.prefs.effectiveMotion);
    figure.setAttribute('aria-label', labelOf(state));
    const text = state.phrase?.text ?? '';
    say.querySelector('.pet-character-bubble').textContent = text;
    say.hidden = !text;
  }

  function announce(text) {
    live.textContent = '';
    later('announce', ANNOUNCE_MS, () => {
      live.textContent = text;
    });
  }

  function showMicro(kind, ms) {
    const art = figure.querySelector('svg');
    if (!art) return;
    art.dataset.micro = kind;
    later('micro', ms, () => delete art.dataset.micro);
  }

  function onCore({ snapshot, effects, reason }) {
    if (!alive) return;
    if (reason === 'destroyed') {
      // Отключили помимо вида — снять вид целиком.
      lost = true;
      view.destroy();
      return;
    }
    render(snapshot);
    for (const effect of effects) {
      if (effect.type === 'announce') announce(effect.text);
      else if (effect.type === 'micro') showMicro(effect.kind, effect.ms);
      else if (effect.type === 'warning') console.warn('Персонаж:', effect.message);
    }
  }

  function link(href) {
    const element = document.createElement('link');
    element.rel = 'stylesheet';
    element.href = href;
    pending += 1;
    on(
      element,
      'load',
      () => {
        pending -= 1;
        if (pending === 0 && alive) {
          ready = true;
          box.hidden = false;
          syncVisible();
        }
      },
      { once: true },
    );
    on(
      element,
      'error',
      () => {
        if (!alive) return;
        console.error(`Персонаж: стили не загрузились (${href}) — вид отключён.`);
        view.destroy();
      },
      { once: true },
    );
    return element;
  }

  function teardown() {
    if (teardownDone) return;
    teardownDone = true;
    abort.abort();
    for (const key of Object.keys(timers)) clearTimeout(timers[key]);
    safe(() => unsub?.())();
    safe(() => ro?.disconnect())();
    safe(() => host?.remove())();
    if (!lost) safe(() => core.destroy())();
  }

  try {
    core = createCharacter({ character: def, name: o.name ?? '' });
    alive = true;
    views.set(container, view);

    host = document.createElement('div');
    host.setAttribute('data-pet-character', '');
    for (const [key, value] of [
      ['display', 'block'],
      ['position', 'relative'],
      ['box-sizing', 'border-box'],
      ['width', '100%'],
      ['min-width', '0'],
    ])
      host.style.setProperty(key, value);
    shadow = host.attachShadow({ mode: 'open' });
    const styles = [new URL('./view.css', import.meta.url).href, ...(kit.styles ?? []).map((value) => new URL(String(value)).href)];
    shadow.append(...[...new Set(styles)].map(link));

    box = document.createElement('div');
    box.className = 'pet-character';
    box.hidden = true;
    const interactive = typeof o.onActivate === 'function';
    const state = core.getState();
    box.innerHTML = `${interactive ? `<button class="pet-character-figure" type="button" aria-label="${esc(labelOf(state))}"></button>` : `<div class="pet-character-figure" role="img" aria-label="${esc(labelOf(state))}"></div>`}
      <p class="pet-character-say" aria-hidden="true" hidden><span class="pet-character-bubble"></span></p>
      <div class="pet-character-live" aria-live="polite"></div>`;
    figure = box.querySelector('.pet-character-figure');
    say = box.querySelector('.pet-character-say');
    live = box.querySelector('.pet-character-live');
    figure.append(fragment(kit.art({ id: `pet-character-${Math.floor(Math.random() * 1e9).toString(36)}` })));
    const art = figure.querySelector('svg');
    if (art) {
      art.setAttribute('aria-hidden', 'true');
      art.setAttribute('focusable', 'false');
      art.dataset.pose = state.pose.shown;
    }
    shadow.append(box);
    if (interactive) {
      on(
        figure,
        'click',
        safe(() => {
          core.activity();
          o.onActivate(view);
        }),
      );
    }

    // Страница: действия пользователя (пробуждение), ввод в поля (тишина), видимость вкладки, уменьшение движения.
    for (const type of ACTIVITY_EVENTS) on(document, type, () => core.activity(), { passive: true, capture: true });
    if (o.watchTyping !== false) {
      const targetOf = (event) => (typeof event.composedPath === 'function' ? (event.composedPath()[0] ?? event.target) : event.target);
      const deepActive = () => {
        let element = document.activeElement;
        while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
        return element;
      };
      on(document, 'focusin', (event) => {
        if (isTextField(targetOf(event))) core.setContext({ typing: true });
      });
      on(document, 'focusout', () => {
        later('typing', 250, () => {
          if (!isTextField(deepActive())) core.setContext({ typing: false });
        });
      });
      if (isTextField(deepActive())) core.setContext({ typing: true });
    }
    on(document, 'visibilitychange', () => syncVisible());
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null;
    if (media) {
      core.setReducedMotion(media.matches);
      media.addEventListener?.('change', () => core.setReducedMotion(media.matches), { signal: abort.signal });
    }

    container.append(host);
    ro = new ResizeObserver(() => syncVisible());
    ro.observe(host);
    // До загрузки стилей персонаж не на виду (фон для экземпляра); первый снимок — сразу.
    seen = true;
    syncVisible();
    unsub = core.subscribe(onCore, { initial: false });
    render(core.getState());
    core.start();
  } catch (error) {
    view.destroy();
    alive = false;
    refuse(error);
  }
  return view;
}
