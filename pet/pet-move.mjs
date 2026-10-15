// Перенос питомца между местами legacy-подключения mountPet: мышью — сразу с места после сдвига на несколько пикселей
// (иначе обычное нажатие), пальцем — в режиме «Переместить». Видны только доступные места; отпустили над местом —
// end({ reason: 'drop', place }), иначе — end({ reason }) без изменений. Нажатие после переноса (и отменённого) ничего не
// открывает. Здесь только DOM и временное состояние; что сохранить — решает legacy-отображение. Состояние — на экземпляр
// (createMover, PL07): контейнерный режим мест не имеет и переноса не использует; поглощение нажатия после переноса не
// трогает нажатий внутри контейнеров питомца ([data-pet-view]) — их жесты у своих отображений.

const SLOP = { mouse: 6, touch: 4 };
const PAD = 12; // запас попадания вокруг места

// hooks = { zones() → [{ id, title, rect }], same() → раскладка та же, ghost() → разметка, label() → подсказка режима,
// cancel — класс кнопки «Отмена», end(result) }; signal снимает слушатели при отключении.
export function createMover(hooks, signal) {
  const st = { hooks, mode: false, source: null, drag: null, layer: null, zones: [], ghost: null, mute: false, held: null };
  const root = () => document.documentElement;
  const moving = () => st.mode || Boolean(st.drag?.started);
  // Нажатие внутри контейнера питомца (свой Shadow DOM, PL07) — не часть переноса legacy.
  const foreign = (event) => Boolean(event.target?.closest?.('[data-pet-view]'));

  // Сбой при замере вёрстки — мест нет (режим не начинается, перенос кончится «вне мест»).
  function zonesNow() {
    try {
      return st.hooks.zones();
    } catch {
      return [];
    }
  }

  function cancelMove(reason = 'cancel') {
    if (moving() || st.drag) finish(reason);
  }

  function interrupt(reason) {
    if (moving()) finish(reason);
  }

  // Окно изменилось (поворот, панель браузера на телефоне): в режиме места встают по новым границам; если
  // питомцу пора в другое место или вид, набор мест другой или питомца уже тянут — перенос отменяется.
  function onResize() {
    if (!moving()) return;
    const zones = zonesNow();
    if (!st.layer || st.drag?.started || !st.hooks.same() || zones.map((zone) => zone.id).join() !== st.zones.map((zone) => zone.id).join()) {
      finish('resize');
      return;
    }
    st.zones = zones;
    for (const zone of zones) place(st.layer.querySelector(`[data-place="${zone.id}"]`), zone.rect);
  }

  // Рамка места — через CSSOM (без атрибута style в разметке).
  function place(button, rect) {
    Object.assign(button.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  function onDown(event) {
    const source = event.target.closest('[data-pet-drag]');
    if (!source || st.drag || event.button !== 0 || !event.isPrimary) return;
    const touch = event.pointerType === 'touch';
    // Палец — только в режиме и только за самого питомца: обычное касание и прокрутка как раньше.
    if ((touch || st.mode) && !(st.mode && source === st.source)) return;
    st.source = source;
    st.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch, started: false, target: null };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
  }

  function begin() {
    const d = st.drag;
    d.started = true;
    if (!st.layer) showLayer(false, zonesNow());
    try {
      st.source.setPointerCapture(d.id);
    } catch {
      // указатель уже отпущен — дальше решит pointerup
    }
    st.source.addEventListener('lostpointercapture', onLost);
    st.source.dataset.petDragging = '';
    root().dataset.petMove = st.mode ? 'mode' : 'drag';
    st.ghost = document.createElement('div');
    st.ghost.className = 'pet-ghost';
    st.ghost.setAttribute('aria-hidden', 'true');
    st.ghost.innerHTML = st.hooks.ghost();
    document.body.append(st.ghost);
  }

  function onMove(event) {
    const d = st.drag;
    if (!d || event.pointerId !== d.id) return;
    if (!d.started) {
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < (d.touch ? SLOP.touch : SLOP.mouse)) return;
      // Пока не сдвинули, место могли перерисовать (изменилось окно) — тянуть уже нечего.
      if (!st.source?.isConnected) {
        stopDrag();
        return;
      }
      begin();
    }
    event.preventDefault();
    // Портрет — под указателем мыши, над пальцем (палец его не закрывает).
    st.ghost.style.transform = `translate(${Math.round(event.clientX - 32)}px, ${Math.round(event.clientY - (d.touch ? 80 : 32))}px)`;
    const target = zoneAt(event.clientX, event.clientY);
    if (target === d.target) return;
    d.target = target;
    for (const zone of st.layer.querySelectorAll('.pet-zone')) zone.classList.toggle('is-target', zone.dataset.place === target?.id);
  }

  function onUp(event) {
    const d = st.drag;
    if (!d || event.pointerId !== d.id) return;
    if (!d.started) {
      stopDrag();
      return;
    }
    d.released = true;
    muteRest();
    const target = zoneAt(event.clientX, event.clientY);
    finish(target ? 'drop' : 'outside', target);
  }

  function onCancel(event) {
    if (!st.drag || event.pointerId !== st.drag.id) return;
    if (st.drag.started) finish('pointercancel');
    else stopDrag();
  }

  // Конец жеста: click после отпускания — часть переноса и не срабатывает. Отменён, а указатель ещё нажат (held), —
  // сначала ждём его отпускания. На касании click приходит после распознавания касания, поэтому ждём событиями, без
  // таймера: до самого click или следующего основного нажатия. Нажатия с клавиатуры (detail 0) не трогаются.
  function muteRest(held = null) {
    st.held = held;
    st.mute = held === null;
    window.addEventListener('pointerup', onRestUp, { capture: true, signal });
    window.addEventListener('pointerdown', onRestDown, { capture: true, signal });
  }

  function onRestUp(event) {
    if (st.held === null || event.pointerId !== st.held) return;
    st.held = null;
    st.mute = true;
  }

  function onRestDown(event) {
    if (event.isPrimary) endRest();
  }

  function endRest() {
    st.held = null;
    st.mute = false;
    window.removeEventListener('pointerup', onRestUp, true);
    window.removeEventListener('pointerdown', onRestDown, true);
  }

  // Захват потерян самим питомцем (не его частью: у касания неявный захват на детали рисунка, его потеря при
  // setPointerCapture всплывает сюда же).
  function onLost(event) {
    if (event.target === st.source && st.drag?.started) finish('lost');
  }

  function onKey(event) {
    if (event.key !== 'Escape' || !moving()) return;
    event.preventDefault();
    event.stopPropagation();
    finish('escape');
  }

  function onClick(event) {
    if (st.mute && event.detail > 0 && !foreign(event)) {
      endRest();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // В режиме касание самого питомца — передумали: режим закрывается, уголок не открывается.
    if (st.mode && st.source?.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      finish('tap');
    }
  }

  // Касание вне мест, питомца и подсказки в режиме — передумали; само касание работает как обычно.
  function onOutside(event) {
    if (!st.mode || st.drag) return;
    if (st.layer?.contains(event.target) || st.source?.contains(event.target)) return;
    finish('outside');
  }

  function zoneAt(x, y) {
    return st.zones.find(({ rect: r }) => x >= r.left - PAD && x <= r.left + r.width + PAD && y >= r.top - PAD && y <= r.top + r.height + PAD) ?? null;
  }

  function showLayer(banner, zones) {
    st.layer = document.createElement('div');
    st.layer.className = 'pet-zones';
    st.layer.innerHTML = zones.map((zone) => `<button class="pet-zone" type="button" data-place="${zone.id}" aria-label="Сюда: ${zone.title}"><span>${zone.title}</span></button>`).join('');
    for (const zone of zones) place(st.layer.querySelector(`[data-place="${zone.id}"]`), zone.rect);
    if (banner) {
      st.layer.insertAdjacentHTML(
        'beforeend',
        `<div class="pet-move-bar" role="group" aria-label="Перенос"><p>${st.hooks.label()}</p><button class="${st.hooks.cancel}" type="button" data-pet-cancel>Отмена</button></div>`,
      );
    }
    st.layer.addEventListener('click', (event) => {
      if (event.target.closest('[data-pet-cancel]')) finish('cancel');
      const zone = event.target.closest('.pet-zone');
      if (zone) finish('drop', zones.find((item) => item.id === zone.dataset.place));
    });
    document.body.append(st.layer);
    st.zones = zones;
  }

  function stopDrag() {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    if (st.drag && !st.drag.started && !st.mode) st.source = null;
    st.drag = null;
  }

  // Конец переноса или режима: временное состояние очищается всегда, затем — итог для отображения.
  function finish(reason, zone = null) {
    const source = st.source;
    const drag = st.drag;
    if (drag) {
      source?.removeEventListener('lostpointercapture', onLost);
      try {
        if (drag.started && source?.hasPointerCapture(drag.id)) source.releasePointerCapture(drag.id);
      } catch {
        // захвата уже нет
      }
      if (drag.started && !drag.released) muteRest(drag.id);
    }
    stopDrag();
    st.ghost?.remove();
    st.layer?.remove();
    st.ghost = null;
    st.layer = null;
    st.zones = [];
    st.mode = false;
    st.source = null;
    if (source) {
      delete source.dataset.petDragging;
      delete source.dataset.petMoveSource;
    }
    delete root().dataset.petMove;
    st.hooks?.end({ reason, place: reason === 'drop' && zone ? zone.id : '', source });
  }

  const on = (target, type, fn, capture = false) => target.addEventListener(type, fn, { capture, signal });
  on(document, 'click', onClick, true);
  on(document, 'pointerdown', onOutside, true);
  on(window, 'keydown', onKey, true);
  on(window, 'blur', () => interrupt('blur'));
  on(window, 'resize', onResize);
  on(document, 'visibilitychange', () => document.hidden && interrupt('hidden'));

  return Object.freeze({
    moving,
    cancel: cancelMove,
    // Нажатие на питомца (кнопку с data-pet-drag) внутри box — возможное начало переноса.
    watch(box) {
      box.addEventListener('pointerdown', onDown, { signal });
    },
    // Явный режим «Переместить»: места на экране, питомца можно тянуть пальцем или нажать место.
    startMode(source) {
      if (!source || !st.hooks) return;
      cancelMove('restart');
      const zones = zonesNow();
      if (!zones.length) return;
      st.mode = true;
      st.source = source;
      source.dataset.petMoveSource = '';
      root().dataset.petMove = 'mode';
      showLayer(true, zones);
      const zone = st.layer.querySelector('.pet-zone') ?? st.layer.querySelector('[data-pet-cancel]');
      zone?.focus({ preventScroll: true });
    },
    // Отключение: перенос отменён, ожидание нажатия снято (слушатели снимает signal).
    stop() {
      if (!st.hooks) return;
      cancelMove('close');
      endRest();
      st.hooks = null;
    },
  });
}
