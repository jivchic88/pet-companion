// Веб: общий указатель одного отображения (этап PL07; docs/ARCHITECTURE.md § 11.2, Р3). Один жест одновременно на сцену
// экземпляра — поглаживание и касание лапы (pet-play.mjs), миска и мячик (pet-toys.mjs), перенос предмета в редакторе
// (pet-room.mjs): общий захват указателя, его слушатели окна (только пока идёт жест) и поглощение нажатия после жеста. До
// PL07 это было состоянием модуля (одно на копию модуля); теперь — на экземпляр: два контейнера и legacy-подключение
// жестов друг у друга не перехватывают, их нажатий не поглощают.
//
// Конец жеста — отпустили (у мыши и пера — основную кнопку), pointercancel, потеря захвата или причина снаружи: вкладка
// скрыта, окно изменилось или потеряло фокус, прокрутилась область, в которой идёт жест, сцену закрыли или сменили,
// отключение. Второй палец и другие кнопки жест не начинают и не кончают. Нажатие (click) после сдвига или прерванного
// жеста ничего не нажимает: поглощается только внутри своего корня (legacy — документ, как 0.1.4; контейнер — свой
// Shadow DOM), на касании — событиями, без таймера: до самого click или следующего основного нажатия; нажатия с
// клавиатуры (detail 0) не трогаются.
//
// Палец ведёт жест — его touchmove отменяются, пока жест идёт или прерванный ждёт отпускания (контейнеры сцен — watch).
// Иначе браузер считает сдвиг прокруткой: её нет (touch-action: none), но после быстрого отпускания он запускает свою
// инерцию, и Chrome на Android, Linux, Windows и ChromeOS глотает следующее касание — оно только останавливает невидимую
// инерцию (кнопка не нажимается ещё 0,3–0,9 с после броска; PL11.1). События указателя от отмены touchmove не меняются.

// signal — отключение экземпляра (снимает постоянные слушатели); root — корень нажатий и прокрутки (document или
// ShadowRoot); win, doc — окно и документ страницы.
export function createPointer({ signal, root, win = globalThis.window, doc = globalThis.document }) {
  const one = { id: null, el: null, on: null };
  const rest = { mute: false, held: null, armed: false };
  const mine = (event) => one.id !== null && event.pointerId === one.id;
  // Потеря захвата — только своя: запоздалое событие прежнего захвата (тот же указатель снова захвачен той же областью)
  // новый жест не снимает.
  const lost = (event) => mine(event) && !(one.el?.hasPointerCapture?.(event.pointerId) ?? false);

  function onMove(event) {
    if (!mine(event)) return;
    // Основную кнопку мыши или пера отпустили, держа другую (pointerup не приходит), — жест кончился.
    if (event.pointerType !== 'touch' && !(event.buttons & 1)) release('up', event);
    else one.on.move(event);
  }
  const onUp = (event) => mine(event) && release('up', event);
  const onCancel = (event) => mine(event) && release('pointercancel', event);
  // Захват потерян самой областью нажатия, пока указатель нажат (после pointerup жест уже закончен).
  const onLost = (event) => lost(event) && release('lost', event);

  // Начать жест указателем event на el: on = { move(event), end(reason, event) → был ли сдвиг (поглотить нажатие) }.
  function grab(event, el, on) {
    if (one.id !== null || !event.isPrimary || event.button !== 0) return false;
    // Без выделения текста и перетаскивания картинки; у пальца и пера — без совместимых событий мыши: фокус не уходит с
    // кнопки и не переезжает на страницу, если сцену закрыли, пока палец на месте (click касания при этом приходит).
    // Страницу пальцем не прокручивает touch-action области.
    event.preventDefault();
    Object.assign(one, { id: event.pointerId, el, on });
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // указатель уже отпущен — дальше решит pointerup
    }
    el.addEventListener('lostpointercapture', onLost);
    win.addEventListener('pointermove', onMove, true);
    win.addEventListener('pointerup', onUp, true);
    win.addEventListener('pointercancel', onCancel, true);
    return true;
  }

  // Конец жеста: слушатели и захват — всегда. Отпустили после сдвига — нажатие поглощается; прерван, а указатель ещё
  // нажат — сначала ждём его отпускания; pointercancel — браузер сам нажатия не пришлёт.
  function release(reason = 'cancel', event = null) {
    const { id, el, on } = one;
    if (id === null) return;
    win.removeEventListener('pointermove', onMove, true);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('pointercancel', onCancel, true);
    el.removeEventListener('lostpointercapture', onLost);
    try {
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    } catch {
      // захвата уже нет
    }
    Object.assign(one, { id: null, el: null, on: null });
    const moved = on.end(reason, event);
    if (reason === 'up') {
      if (moved) muteRest();
    } else if (reason !== 'pointercancel') muteRest(id);
  }

  // Поглощение нажатия после жеста. held — указатель ещё нажат (ждём его отпускания), иначе — ближайшее нажатие.
  function muteRest(held = null) {
    if (signal.aborted) return;
    rest.held = held;
    rest.mute = held === null;
    if (rest.armed) return;
    rest.armed = true;
    win.addEventListener('pointerup', onRestUp, true);
    win.addEventListener('pointerdown', onRestDown, true);
  }
  function onRestUp(event) {
    if (rest.held === null || event.pointerId !== rest.held) return;
    rest.held = null;
    rest.mute = true;
  }
  function onRestDown(event) {
    if (event.isPrimary) endRest();
  }
  function endRest() {
    rest.held = null;
    rest.mute = false;
    if (!rest.armed) return;
    rest.armed = false;
    win.removeEventListener('pointerup', onRestUp, true);
    win.removeEventListener('pointerdown', onRestDown, true);
  }
  function onClick(event) {
    if (!rest.mute || !(event.detail > 0)) return;
    endRest();
    event.preventDefault();
    event.stopPropagation();
  }

  // Прокрутилась область, в которой идёт жест (вложенная прокрутка уголка, страница под ним): точка под указателем
  // сместилась — жест отменяется, а не продолжается в прежнем масштабе.
  function onScroll(event) {
    if (one.id === null) return;
    const target = event.target;
    const moved = target === doc || target === doc.documentElement || target === doc.scrollingElement || (typeof target?.contains === 'function' && target.contains(one.el));
    if (moved) release('scroll');
  }

  // Сдвиг пальца жеста — не прокрутка и не инерция браузера (вступление выше).
  function onTouchMove(event) {
    if ((one.id !== null || rest.held !== null) && event.cancelable) event.preventDefault();
  }

  root.addEventListener('click', onClick, { capture: true, signal });
  root.addEventListener('scroll', onScroll, { capture: true, passive: true, signal });
  doc.addEventListener('visibilitychange', () => doc.hidden && release('hidden'), { signal });
  win.addEventListener('resize', () => release('resize'), { signal });
  win.addEventListener('blur', () => release('blur'), { signal });

  return Object.freeze({
    grab,
    release,
    gesturing: () => one.id !== null,
    // Постоянный контейнер, в котором начинаются жесты (сцена «Поиграть», редактор): не пассивный touchmove — только на
    // нём, а не на странице, поэтому прокрутке сайта он не мешает. Слушатель есть до касания: браузер решает, ждать ли
    // ответа страницы, по первому touchmove, и поздно добавленный не успел бы. Тот же контейнер повторно — без изменений.
    watch(box) {
      box.addEventListener('touchmove', onTouchMove, { passive: false, signal });
    },
    // Отключение: идущий жест отменён, ожидание нажатия снято (постоянные слушатели снимает signal).
    destroy() {
      release('close');
      endRest();
    },
  });
}
