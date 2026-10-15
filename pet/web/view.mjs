// Веб: контейнерный режим mountPetIn (этап PL07; docs/ARCHITECTURE.md § 11.2). Питомец живёт в одном контейнере сайта:
// свой элемент <div data-pet-view> внутри контейнера и открытый Shadow DOM на нём — id, классы и стили изолированы в обе
// стороны (стили пакета и наборов — <link> в теневом дереве; тема --pet-* наследуется от контейнера). Мест, шапки и
// панелей сайта нет; вид «целиком» или «портрет» — по размеру своего элемента (ResizeObserver), а не по окну. Диалог
// (уголок, «Поиграть», «Обустроить уголок») — <dialog> в своём теневом дереве (showModal); блокировку прокрутки решает
// сайт по onOpenChange(open); отметок на <html>, глобальных стилей и элементов в <body> нет. Legacy-реестр одного питомца
// не используется: контейнеров на странице может быть сколько угодно, вместе с legacy mountPet.
//
// Каждый контейнер — свой экземпляр ядра и отображения (web/shell.mjs); общий namespace — общий координатор хранения
// (своё подключение у каждого ядра) и общий день сценки, разный — независимы. Настройки, определения и наборы проверяются
// до любых действий (DOM, хранение, ядро): отказ — mounted: false, одно console.error, ничего не создано. Частичный запуск
// откатывает только своё. Колбэки сайта (progress, home, onOpenChange) перехватываются: их исключения — журнал, наружу
// не выходят и соседей не трогают.

import { exposed } from '../core/facade.mjs';
import { catalogOf, catalogProblem } from './catalog.mjs';
import { kitStyles } from './kits.mjs';
import { esc, managed, PAW_ICON, safe, shown } from './parts.mjs';
import { createWebScenes } from './scenes.mjs';
import { createShell } from './shell.mjs';
import { createWebStorage } from './storage.mjs';

// Наименьший размер своего элемента для вида «целиком» (CSS px); меньше — портрет; ноль, скрыт, вне документа — ничего
// (питомец не на виду: ядро — как вкладка в фоне, диалог закрыт, жестов нет).
export const FULL_MIN = Object.freeze({ width: 160, height: 148 });
const VIEW_OPTIONS = ['namespace', 'progress', 'pets', 'behaviors', 'kits', 'home', 'onOpenChange', 'watchTyping'];
const VIEWS = ['corner', 'play', 'room'];

// Контейнеры, занятые живым видом этой копии модуля (другие копии — по отметке data-pet-view своего элемента).
const views = new WeakMap();
let busy = 0;

// Стили вида — файлы пакета рядом с этим модулем (адрес установленного пакета, не страницы и не cwd) и стили наборов.
const packageStyles = () => ['../pet-base.css', '../pet.css', '../dog.css', './view.css'].map((file) => new URL(file, import.meta.url).href);

const isElement = (value) => Boolean(value) && typeof value === 'object' && value.nodeType === 1 && typeof value.append === 'function';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

// Проблема подключения (строка для отказа) или '': контейнер и настройки — до любых действий.
function viewProblem(container, o) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'нет document — mountPetIn подключается только в браузере';
  if (!isElement(container)) return 'контейнер — элемент страницы';
  if (!container.isConnected || container.ownerDocument !== document) return 'контейнер не в документе этой страницы — подключите питомца после вставки контейнера';
  if (o !== undefined && !isRecord(o)) return 'настройки — объект';
  const options = o ?? {};
  for (const key of Object.keys(options)) if (!VIEW_OPTIONS.includes(key)) return `неизвестная настройка: ${key}`;
  if (!(options.namespace === undefined || (typeof options.namespace === 'string' && options.namespace))) return 'namespace — непустая строка';
  for (const key of ['progress', 'home', 'onOpenChange']) if (options[key] != null && typeof options[key] !== 'function') return `${key} — не функция`;
  if (options.watchTyping !== undefined && typeof options.watchTyping !== 'boolean') return 'watchTyping — boolean';
  const problem = catalogProblem(options);
  if (problem) return problem;
  if (busy) return 'подключение уже идёт (mountPetIn из функции сайта)';
  if (views.get(container)?.mounted || [...container.children].some((child) => child.hasAttribute('data-pet-view'))) return 'в контейнере уже есть питомец — сначала destroy() прежнего вида';
  return '';
}

// Поверхность контейнера для общей оболочки: свой элемент с Shadow DOM, место питомца, размеры, фокус, onOpenChange.
function containerSurface(container, options, own) {
  return (ctx) => {
    const { ui } = ctx;
    // ready — обязательные стили (пакета и наборов) загружены; seen — видимость, о которой уже сказано оболочке и ядру.
    const V = { host: null, shadow: null, box: null, ro: null, mode: 'none', key: '', styles: 0, ready: false, seen: false };
    const home = () => safe(() => options.home?.() ?? null)();
    // Питомец на виду: стили загружены (до этого место скрыто) и у своего элемента есть размеры. Не на виду — для ядра
    // как фон (реакции и сценки не начинаются, день сценки не резервируется), диалог показать негде.
    const showing = () => V.ready && V.mode !== 'none';
    own.shows = () => Boolean(V.host?.isConnected) && showing();

    // Вид по размеру своего элемента: целиком, портрет или ничего (ноль, скрыт, вне документа).
    function modeNow() {
      if (!V.host?.isConnected) return 'none';
      const width = V.host.clientWidth;
      const height = V.host.clientHeight;
      if (!(width > 0 && height > 0)) return 'none';
      return width >= FULL_MIN.width && height >= FULL_MIN.height ? 'full' : 'portrait';
    }

    // Кнопки, открывающие диалог (питомец или лапка вызова) — только в своём месте.
    const openers = () => [...(V.box?.querySelectorAll('[aria-controls="cat-sheet"]') ?? [])];

    // Спрятан — своя «Показать …»; иначе видимый вход питомца; нет его — куда скажет сайт (options.home).
    function fallback() {
      const own = ui.shownHidden ? V.box?.querySelector('[data-cat-return]') : openers().find(shown);
      return own && shown(own) ? own : home();
    }

    // Место питомца в контейнере по снимку: питомец (целиком или портрет), лапка вызова или «Показать …». Перерисовка —
    // только когда сменилось показанное (облик, напарник, вид, присутствие) — любым путём: кнопкой, командой, задачей ядра,
    // правкой соседа или другой вкладки. Новая кнопка сразу с доступным именем, aria-expanded и точкой «новое» (общий показ
    // входов оболочки), кнопка с фокусом — снова с фокусом.
    function renderBox() {
      if (!V.box) return;
      const s = ctx.surface();
      const view = V.mode === 'full' ? 'full' : 'portrait';
      const key = `${s}|${view}|${ui.kind}|${ctx.coat()}`;
      V.box.dataset.surface = s;
      V.box.dataset.view = V.mode;
      if (key === V.key) return;
      V.key = key;
      const had = V.box.contains(V.shadow.activeElement);
      V.box.innerHTML =
        s === 'none'
          ? `<button class="cat-view-return" type="button" data-cat-return aria-label="${esc(ctx.returnLabel())}" title="${esc(ctx.returnLabel())}">${PAW_ICON}</button>`
          : s === 'call'
            ? ctx.callHtml()
            : `<button class="cat-view-btn" type="button" aria-haspopup="dialog" aria-expanded="${ui.sheetOpen}" aria-controls="cat-sheet">${managed(ctx.art({ id: `${ui.kind}-view`, view }))}<span class="cat-dot" hidden></span></button>
      <span class="cat-dock-mini" aria-hidden="true"></span>
      <p class="cat-view-say" aria-hidden="true"><span class="cat-bubble"></span></p>`;
      ctx.labelOpeners();
      if (had) V.box.querySelector('button')?.focus({ preventScroll: true });
    }

    // Размер или готовность стилей изменились: вид, объявление ядру (целиком или портрет — сценки), видимость. Видимость
    // сверяется и при том же виде (стили загрузились, размер прежний). Не на виду — как фон: реакции и сценки не
    // начинаются, жесты отпущены, диалог закрыт — показать его некуда.
    function measure() {
      if (!own.alive()) return;
      const next = modeNow();
      if (next !== V.mode) {
        V.mode = next;
        if (next === 'none') {
          ui.pointer?.release('resize');
          if (ui.sheetOpen) ctx.closeSheet({ restore: false });
        }
        ctx.renderAll();
      }
      if (showing() === V.seen) return;
      V.seen = showing();
      own.visibility();
    }

    // Стили теневого дерева: файлы пакета и наборов. Пока не загрузились, место питомца скрыто (не мигает без стилей) и
    // питомец не на виду: ни реакций, ни сценок, ни диалога; отменённое за это время после загрузки не доигрывается.
    // Ошибка загрузки любого — вид отключается (mounted: false) и одно console.error: показывать питомца без стилей
    // нельзя. Синхронный mountPetIn этого не ждёт: результат подключения — о ядре и разметке, стили — позже.
    function link(href) {
      const element = document.createElement('link');
      element.rel = 'stylesheet';
      element.href = href;
      V.styles += 1;
      element.addEventListener(
        'load',
        () => {
          V.styles -= 1;
          if (V.styles === 0 && own.alive()) {
            V.ready = true;
            V.box.hidden = false;
            measure();
          }
        },
        { once: true, signal: ui.abort.signal },
      );
      element.addEventListener(
        'error',
        () => {
          if (!own.alive()) return;
          console.error(`Питомец: стили не загрузились (${href}) — вид отключён.`);
          own.fail();
        },
        { once: true, signal: ui.abort.signal },
      );
      return element;
    }

    return {
      mount() {
        V.host = document.createElement('div');
        V.host.setAttribute('data-pet-view', '');
        // Размер своего элемента — сразу (CSSOM; до загрузки стилей): ширина контейнера, высота контейнера, если задана,
        // иначе по пропорции рисунка (не выше 360 px). Тот же размер — в view.css.
        for (const [key, value] of [
          ['display', 'block'],
          ['position', 'relative'],
          ['box-sizing', 'border-box'],
          ['width', '100%'],
          ['height', '100%'],
          ['aspect-ratio', '220 / 204'],
          ['max-height', '360px'],
          ['min-width', '0'],
        ])
          V.host.style.setProperty(key, value);
        V.shadow = V.host.attachShadow({ mode: 'open' });
        const styles = [...packageStyles(), ...[...ui.kits.values()].flatMap(kitStyles)];
        V.shadow.append(...[...new Set(styles)].map(link));
        V.box = document.createElement('div');
        V.box.className = 'pet-view';
        V.box.hidden = true;
        V.shadow.append(V.box);
        ctx.on(
          V.box,
          'click',
          safe((event) => {
            if (event.target.closest('[data-cat-return]')) ctx.showCat();
            else if (event.target.closest('[data-cat-call]')) ctx.openSheet(event.target.closest('[data-cat-call]'), 'call');
            else if (event.target.closest('.cat-view-btn')) ctx.openSheet(event.target.closest('.cat-view-btn'));
          }),
        );
        container.append(V.host);
        V.mode = modeNow();
        V.ro = new ResizeObserver(() => measure());
        V.ro.observe(V.host);
      },
      root: () => V.shadow,
      attach: (sheet) => V.shadow.append(sheet),
      attachLive: (live) => V.shadow.append(live),
      render() {
        renderBox();
        ctx.syncDisplay();
      },
      display: () => ({ full: V.mode === 'full', moving: false }),
      openers,
      fallback,
      focused: () => {
        const element = V.shadow?.activeElement;
        return element && V.box?.contains(element) ? element : null;
      },
      keep(element) {
        if (!element || (element.isConnected && shown(element))) return;
        fallback()?.focus({ preventScroll: true });
      },
      // Облако реплики — только у целого питомца (портрет мал для текста; реплики — в уголке).
      saying(phrase) {
        const box = V.box?.querySelector('.cat-view-say');
        if (!box) return;
        if (!phrase || V.mode !== 'full') {
          box.classList.remove('is-saying');
          return;
        }
        const bubble = box.querySelector('.cat-bubble');
        bubble.textContent = phrase.text;
        if (phrase.short && bubble.offsetTop + bubble.offsetHeight > box.clientHeight) bubble.textContent = phrase.short;
        box.classList.add('is-saying');
      },
      minis: () => [V.box?.querySelector('.cat-dock-mini')],
      markMotion(move) {
        if (V.host && V.host.getAttribute('data-cat-motion') !== move) V.host.setAttribute('data-cat-motion', move);
      },
      markPaused: (hidden) => V.host?.toggleAttribute('data-cat-paused', hidden),
      // Прокрутку страницы не блокирует и не возвращает — это решение сайта (onOpenChange).
      opened: () => {},
      closed: () => {},
      changed(open) {
        own.openChange(open);
      },
      canOpen: () => own.alive() && own.shows(),
      visible: showing,
      roots: () => [V.box, ui.sheet],
      active: () => V.shadow?.activeElement ?? null,
      placeHtml: () => '',
      viewHtml: () => '',
      syncPlaceBox: () => {},
      change: () => false,
      click: () => {},
      cancelMove: () => {},
      relayout: () => measure(),
      placeChanged: () => {},
      coatChanged: renderBox,
      kindChanged: renderBox,
      named: () => {},
      focusAfterShow: (focusCat) => focusCat(),
      arrive: () => {},
      destroy({ wasOpen }) {
        const inside = Boolean(V.host) && document.activeElement === V.host;
        for (const step of [
          () => V.ro?.disconnect(),
          () => V.host?.remove(),
          () => wasOpen && own.openChange(false),
          // Фокус был внутри этого вида — не в никуда: туда, куда скажет сайт. Чужой фокус не трогается.
          () => inside && [null, document.body].includes(document.activeElement) && home()?.focus({ preventScroll: true }),
        ])
          safe(step)();
        V.ro = null;
      },
    };
  };
}

// Подключить питомца в контейнер (README, «Питомец в контейнере»). Синхронно, не бросает исключений: отказ — view.mounted === false,
// console.error, ничего не создано и не записано. view.core — публичный экземпляр ядра этого вида (null при отказе; после
// отключения — тот же отключённый). view.open(view), view.close() — открыть вид диалога (как кнопкой: фокус вернётся на
// питомца) и закрыть; результат — команды ядра. view.destroy() — отключить ядро и вид (повторно — ничего); то же —
// view.core.destroy().
export function mountPetIn(container, options) {
  let shell = null;
  let core = null;
  let alive = false;
  let open = false;
  const destroyed = () => ({ ok: false, error: { code: 'destroyed', message: 'Питомец не подключён.' } });
  const live = () => alive && shell !== null && shell.ui.mounted;
  const own = {
    alive: () => live(),
    // Сайту — только настоящие переходы диалога; его исключение — журнал.
    openChange(next) {
      if (next === open) return;
      open = next;
      safe(() => options?.onOpenChange?.(next))();
    },
    visibility: () => shell?.onVisibility(),
    fail: () => view.destroy(),
    shows: () => false,
  };
  const view = Object.freeze({
    get mounted() {
      return live();
    },
    get core() {
      return core;
    },
    // Открыть вид: уголок, сразу «Поиграть» («Закрыть» — к странице, как вызов) или «Обустроить уголок»; диалог уже
    // открыт — смена вида. Фокус при закрытии — на питомца в контейнере (иначе options.home()).
    open(which = 'corner') {
      if (!live()) return destroyed();
      if (!VIEWS.includes(which) || shell.ui.sheetOpen) return core.open(which);
      if (!own.shows()) return { ok: false, error: { code: 'unsupported', message: 'Питомец не на виду (стили ещё загружаются, контейнер скрыт, без размеров или вне документа) — диалог показать негде.' } };
      const source = which === 'play' ? 'call' : 'pet';
      return shell.openSheet(shell.openers().find(shown) ?? null, source, which) ?? core.open(which, { source });
    },
    close() {
      if (!live()) return destroyed();
      return shell.closeSheet({ restore: true }) ?? core.close();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (views.get(container) === view) views.delete(container);
      safe(() => shell?.destroy())();
    },
  });
  const refuse = (why) => (console.error('Питомец не подключён:', why), view);
  let why;
  try {
    why = viewProblem(container, options);
  } catch (error) {
    why = error;
  }
  if (why) return refuse(why);
  const o = options ?? {};
  const namespace = o.namespace ?? 'pet';
  alive = true;
  views.set(container, view);
  busy += 1;
  try {
    shell = createShell({
      options: { progress: o.progress ?? undefined },
      namespace,
      catalog: catalogOf(o),
      storage: createWebStorage({ namespace }),
      scenes: createWebScenes({ namespace }),
      watchTyping: o.watchTyping !== false,
      surface: containerSurface(container, o, own),
      lost: () => view.destroy(),
    });
    shell.start();
    core = exposed(shell.ui.core);
  } catch (error) {
    view.destroy();
    refuse(error);
  } finally {
    busy -= 1;
  }
  return view;
}
