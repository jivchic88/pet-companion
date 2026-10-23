// Веб, legacy-подключение mountPet: поверхность «места рядом со страницей» (этап PL07; до PL07 — часть pet/pet.mjs).
// Модель мест 0.1.4 без изменений: компьютер — logo, sidebar, float; телефон — top, bar; «Показать …» после «Скрыть» —
// places.restore или лапкой в top; элементы #cat-dock, #cat-side, #cat-float, #cat-bar и кнопка .cat-face ставит сайт.
// Место и вид — ключ place (память ядра, команда setPlace), правила раскладки и пороги окна — pet-place.mjs
// (PLACE_MEDIA); перенос между местами — pet-move.mjs; отметки на <html> (data-pet-at, data-pet-view, data-pet-call,
// data-cat-motion, cat-on, cat-open, cat-paused) и блокировка прокрутки страницы, пока открыт диалог, — как 0.1.4.
// Состояние (места, раскладка, медиазапросы, перенос, появление) — на экземпляр; контейнерный режим (web/view.mjs) этой
// поверхности не использует. ctx — контекст общей оболочки (web/shell.mjs).

import * as P from '../../pet-place.mjs';
import { createMover } from '../../pet-move.mjs';
import { CALL, esc, FOLD_ICON, fragment, managed, PAW_ICON, safe, shown } from '../parts.mjs';

export function legacySurface(ctx) {
  const { ui, O, C } = ctx;
  const L = {
    dock: null,
    side: null,
    face: null,
    float: null, // компьютер: внизу экрана
    bar: null, // телефон: в нижней панели
    fold: null, // телефон: «Свернуть» рядом с питомцем в верхней панели
    restore: null,
    place: P.defaultPlace(), // место и вид у телефона и компьютера (ключ place — память ядра, снимок place)
    layout: null, // что показано сейчас (P.petLayout): место, вид, временная замена
    placeLater: false, // изменение другой вкладки пришло во время переноса — применить после него
    media: [], // медиазапросы мест (P.PLACE_MEDIA)
    layoutTimer: 0, // раскладка после пачки изменений медиазапросов
    arrive: null, // место, где идёт появление, и его слушатель конца анимации
    lostEntry: false, // вход с фокусом спрятан медиазапросом (onFocusOut)
    sheetY: 0,
    mover: null,
  };
  const html = () => document.documentElement;

  // ---------- место и вид (ключ place) — память ядра, правила раскладки — здесь ----------

  // Сохранённое (с несохранёнными правками) — снимок ядра; показ — нормализованное (непонятное — по умолчанию).
  const placeRaw = () => ctx.snap().place;
  const readPlace = () => P.normalizePlace(placeRaw());

  // Правка места или вида — проверенная (P.placePatch) команда ядра (операция ключа place через его подключение); true —
  // записано или записывать нечего.
  function storePlace(patch) {
    const result = ui.core.setPlace(P.placePatch(patch));
    return result.ok && result.save.status !== 'failed';
  }

  // Не записалось — поля устройства в несохранённых ядра.
  const placeFailed = () => ctx.snap().save.place.unsaved.some((path) => path.startsWith(`${L.layout?.device}.`));

  // ---------- места рядом со страницей ----------

  // Кнопки, открывающие диалог: питомец или кнопка вызова; видна одна — html[data-pet-at] или html[data-pet-call].
  function openers() {
    return [...[L.dock, L.side, L.float, L.bar].flatMap((box) => [...(box?.querySelectorAll('[aria-controls="cat-sheet"]') ?? [])]), L.face].filter(Boolean);
  }

  const foldLabel = () => `Свернуть ${ctx.defOf().forms.acc}`;
  const foldHtml = () => `<button class="cat-fold" type="button" data-cat-fold aria-label="${foldLabel()}" title="Свернуть">${FOLD_ICON}</button>`;
  // Тянуть мышью — только если сайт задал рамки мест (options.zone).
  const opener = () => `aria-haspopup="dialog" aria-expanded="false" aria-controls="cat-sheet"${O.zone ? ' data-pet-drag' : ''}`;

  // Вид места: показанного — по раскладке, остальных — портрет (их не видно).
  const hostView = (host) => (L.layout?.host === host ? L.layout.view : 'compact');
  const artFor = (place, view = 'full') => ctx.art({ id: `${ui.kind}-${place}`, view: view === 'full' ? 'full' : 'portrait' });

  // Боковая панель: целиком (имя, ступень и реплика рядом, «Свернуть» при наведении) или портретом с именем; по зову —
  // кнопка.
  function renderDock() {
    if (!L.dock) return;
    const view = hostView('sidebar');
    const s = ctx.surface();
    L.dock.hidden = s === 'none';
    L.dock.dataset.view = s === 'call' ? 'call' : view;
    L.dock.innerHTML =
      s === 'call'
        ? ctx.callHtml()
        : s === 'none'
          ? ''
          : `<button class="cat-dock-btn" type="button" ${opener()}>
      <span class="cat-dock-art">${managed(artFor('dock', view))}</span>
      <span class="cat-dock-mini" aria-hidden="true"></span>
      <span class="cat-dot" hidden></span>
    </button>
    <p class="cat-dock-say" aria-hidden="true"><span class="cat-dock-name"><strong data-cat-name>${esc(ctx.name())}</strong><span data-cat-stage></span></span><span class="cat-bubble"></span></p>${view === 'full' ? foldHtml() : ''}`;
  }

  // Внизу экрана (компьютер) и нижняя панель (телефон): кнопка-питомец и «Свернуть» у целого.
  const hostHtml = (host, view) =>
    `<button class="cat-host-btn" type="button" ${opener()}><span class="cat-host-art">${managed(artFor(host, view))}</span><span class="cat-dot" hidden></span></button>${view === 'full' ? foldHtml() : ''}`;

  function renderFloat() {
    if (!L.float) return;
    const view = hostView('float');
    L.float.dataset.view = view;
    L.float.innerHTML = ctx.surface() !== 'pet' ? '' : `<p class="cat-float-say" aria-hidden="true"><span class="cat-bubble"></span></p>${hostHtml('float', view)}<span class="cat-dock-mini" aria-hidden="true"></span>`;
  }

  function renderBar() {
    if (!L.bar) return;
    const view = hostView('bar');
    L.bar.dataset.view = view;
    L.bar.innerHTML = ctx.surface() !== 'pet' ? '' : hostHtml('bar', view);
  }

  // У логотипа: портрет без лишней высоты; по зову — кнопка; спрятан — маленькая кнопка «Показать …» (на любой высоте).
  function renderSide() {
    if (!L.side) return;
    const s = ctx.surface();
    L.side.classList.toggle('is-hidden-cat', s === 'none');
    L.side.classList.toggle('is-call', s === 'call');
    L.side.innerHTML =
      s === 'none'
        ? `<button class="cat-side-return" type="button" data-cat-return aria-label="${ctx.returnLabel()}" title="${ctx.returnLabel()}">${PAW_ICON}</button>`
        : s === 'call'
          ? ctx.callHtml()
          : `<button class="cat-side-face" type="button" ${opener()}>${managed(ctx.art({ id: `${ui.kind}-side`, view: 'portrait' }))}<span class="cat-dot" hidden></span></button>
      <span class="cat-side-say" aria-hidden="true"></span>`;
  }

  // Верх телефона: кнопка-питомец (портрет или целиком) или лапка вызова; место ставит сайт (places.top).
  function renderFace() {
    if (!O.places?.top) return;
    if (ui.settings.hidden) {
      L.face?.remove();
      L.fold?.remove();
      L.face = null;
      html().classList.remove('cat-on');
      return;
    }
    if (!L.face) {
      L.face = document.createElement('button');
      L.face.type = 'button';
      L.face.className = 'cat-face';
      for (const [key, value] of [
        ['aria-haspopup', 'dialog'],
        ['aria-expanded', 'false'],
        ['aria-controls', 'cat-sheet'],
      ])
        L.face.setAttribute(key, value);
      L.face.innerHTML = '<span class="cat-dot" hidden></span>';
      const face = L.face;
      face.addEventListener(
        'click',
        safe(() => ctx.openSheet(face, face.hasAttribute('data-cat-call') ? 'call' : 'pet')),
      );
      L.mover.watch(face);
      O.places.top(face);
    }
    // По зову — та же кнопка с лапкой (не переносится).
    const call = ctx.surface() === 'call';
    L.face.toggleAttribute('data-pet-drag', !call && Boolean(O.zone));
    L.face.toggleAttribute('data-cat-call', call);
    if (call) L.face.title = CALL;
    else L.face.removeAttribute('title');
    // «Свернуть» — сразу за питомцем (видна, только когда он целиком наверху).
    if (L.fold && L.fold.previousElementSibling !== L.face) L.face.after(L.fold);
    L.fold?.setAttribute('aria-label', foldLabel());
    // Портрет или целиком, в облике показанного напарника; кнопка та же (фокус и состояние не теряются).
    const view = call ? 'call' : hostView('top');
    if (L.face.dataset.kind !== ui.kind || L.face.dataset.coat !== ctx.coat() || L.face.dataset.view !== view) {
      L.face.querySelector('svg')?.remove();
      L.face.insertAdjacentHTML('afterbegin', call ? PAW_ICON : managed(artFor('face', view)));
      L.face.dataset.kind = ui.kind;
      L.face.dataset.coat = ctx.coat();
      L.face.dataset.view = view;
    }
    html().classList.add('cat-on');
  }

  // «Показать …» на телефоне: ссылкой в разметке сайта или лапкой в шапке (подпись — aria-label и title).
  function renderReturn() {
    if (!L.restore) return;
    L.restore.hidden = !ui.settings.hidden;
    const button = L.restore.querySelector('button');
    if (O.places.restore) button.textContent = ctx.returnLabel();
    else button.setAttribute('aria-label', (button.title = ctx.returnLabel()));
  }

  // ---------- место и вид на странице ----------

  // Места, которых сайт не задал, не помещаются (у логотипа и наверху телефона — запасные места).
  function env() {
    const e = Object.fromEntries(L.media.map(([key, list]) => [key, list.matches]));
    if (!L.dock) e.tall = e.roomy = false;
    if (!L.float) e.gutterFull = e.gutterCompact = false;
    if (!L.bar) e.barFull = e.barCompact = false;
    return e;
  }
  const layoutNow = () => P.petLayout(L.place, env());

  // Место и вид — атрибутами страницы (pet.css показывает одно место); по зову — data-pet-call; спрятан — нигде.
  function markLayout() {
    const root = html();
    const on = L.layout && ctx.surface() === 'pet';
    if (on) {
      root.dataset.petAt = L.layout.host;
      root.dataset.petView = L.layout.view;
    } else {
      delete root.dataset.petAt;
      delete root.dataset.petView;
    }
    root.toggleAttribute('data-pet-call', ctx.surface() === 'call');
    if (L.fold) L.fold.hidden = !on || L.layout.host !== 'top' || L.layout.view !== 'full';
  }

  // Место и вид по сохранённому и окну: перерисовываются только сменившиеся места, фокус — на питомца на новом месте.
  // explicit — действие владельца (появление и «устроился»), иначе — тихо. Во время переноса — после него.
  function applyLayout({ explicit = false } = {}) {
    if (!ui.mounted) return;
    if (L.mover.moving()) {
      L.placeLater = true;
      return;
    }
    // Вход с фокусом спрятал медиазапрос pet.css — браузер мог снять фокус ещё до раскладки (onFocusOut).
    const lost = L.lostEntry && [null, document.body].includes(document.activeElement);
    L.lostEntry = false;
    const was = L.layout;
    L.layout = layoutNow();
    markLayout();
    const focused = focusedControl();
    const changed = !was || was.host !== L.layout.host || was.view !== L.layout.view;
    if (changed && ctx.surface() === 'pet') {
      // Другое место legacy-раскладки — сценка отменяется (места в ядро не переходят: узкий вход stopScene); целиком или
      // портрет — объявление отображения (setDisplay({ full })), его смену ядро учитывает само.
      ui.core.stopScene();
      ctx.syncDisplay();
      if (L.dock && L.dock.dataset.view !== hostView('sidebar')) renderDock();
      if (L.float && L.float.dataset.view !== hostView('float')) renderFloat();
      if (L.bar && L.bar.dataset.view !== hostView('bar')) renderBar();
      renderFace();
      // Точка «новое» и подписи новых кнопок мест — по снимку.
      ctx.showProgress();
      // Идущая реакция продолжается и на перерисованном месте: реплика и маленькая вещь.
      saying(ctx.snap().phrase);
      ctx.showMini();
      ctx.paint();
      if (explicit) settle();
    }
    // Кнопки вызова не перерисовываются — одну показывает pet.css.
    if (lost) fallbackFocus()?.focus({ preventScroll: true });
    else keepFocus(focused);
    syncPlaceBox();
  }

  const hostBox = (host) => ({ sidebar: L.dock, logo: L.side, float: L.float, top: L.face, bar: L.bar })[host];

  // Питомец на новом месте или раскрылся по действию владельца — ядру (arrive): без анимации — ничего, иначе эффект arrive
  // (появление — здесь, startArrive) и декоративный отклик «устроился» (в тишине и поверх другой реакции не играет).
  function settle() {
    endArrive();
    ui.core.arrive();
  }

  // Эффект ядра arrive: появление на показанном месте (класс снимается концом анимации или следующим появлением).
  function startArrive() {
    endArrive();
    const box = L.layout && hostBox(L.layout.host);
    if (!box) return;
    const done = (event) => event.animationName === 'pet-arrive' && endArrive();
    L.arrive = { box, done };
    box.classList.add('is-arriving');
    for (const type of ['animationend', 'animationcancel']) box.addEventListener(type, done);
  }

  function endArrive() {
    if (!L.arrive) return;
    const { box, done } = L.arrive;
    box.classList.remove('is-arriving');
    for (const type of ['animationend', 'animationcancel']) box.removeEventListener(type, done);
    L.arrive = null;
  }

  // Медиазапросы меняются пачкой при одном изменении окна — раскладка один раз, после всех.
  function onMediaChange() {
    clearTimeout(L.layoutTimer);
    L.layoutTimer = setTimeout(
      safe(() => applyLayout()),
      0,
    );
  }

  function chooseDevice() {
    return L.layout?.device ?? (env().phone ? 'phone' : 'desktop');
  }

  // Выбрали место (в уголке или переносом): сохраняется сразу, питомец там. Не помещается — временно рядом.
  function choosePlace(id) {
    const device = chooseDevice();
    if (!P.placeIds(device).includes(id)) return;
    const saved = storePlace({ [device]: { place: id } });
    L.place = readPlace();
    ui.core.activity();
    applyLayout({ explicit: true });
    ctx.announce(`Место: ${P.placeTitle(device, id).toLowerCase()}.${L.layout.moved ? ` Сейчас там нет места — питомец временно ${P.placeTitle(device, L.layout.at).toLowerCase()}.` : ''}${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
  }

  // Вид: «Показать целиком», «Свернуть» или выбор в «Настройках». Питомец не уходит с места, где новый вид помещается
  // (P.viewPatch).
  function chooseView(view) {
    if (!P.VIEWS.some((item) => item.id === view)) return;
    const saved = storePlace(P.viewPatch(L.place, env(), view, placeRaw()));
    L.place = readPlace();
    ui.core.activity();
    applyLayout({ explicit: true });
    const title = P.VIEWS.find((item) => item.id === view).title.toLowerCase();
    ctx.announce(`Вид: ${title}.${L.layout.squeezed ? ' Сейчас здесь помещается только портрет.' : ''}${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
  }

  const toggleView = () => chooseView(L.layout?.wantsFull ? 'compact' : 'full');

  // «Свернуть» у питомца: кнопка исчезает — фокус на питомце.
  function fold() {
    chooseView('compact');
    fallbackFocus()?.focus({ preventScroll: true });
  }

  // ---------- перенос ----------

  // Места переноса — другие доступные сейчас; рамки задаёт сайт (options.zone), без них переноса нет.
  const sameLayout = () => {
    const next = layoutNow();
    return next.host === L.layout?.host && next.view === L.layout?.view;
  };

  function otherPlaces() {
    const layout = L.layout;
    if (!layout || ctx.surface() !== 'pet' || !O.zone) return [];
    const can = P.placeAbility(layout.device, env());
    return P.PLACES[layout.device].filter((item) => can[item.id].compact && item.id !== layout.at);
  }

  function zoneList() {
    return otherPlaces()
      .map((item) => ({ id: item.id, title: item.title, rect: O.zone?.(L.layout.device, item.id) }))
      .filter((zone) => zone.rect);
  }

  const moveLabel = () => `Перетащите ${ctx.defOf().forms.acc}${L.layout?.device === 'phone' ? ' пальцем вверх или вниз' : ' на одно из мест'} — или нажмите место.`;

  // «Переместить» в уголке: уголок закрывается, на странице — места; питомца можно тянуть пальцем.
  function startMove() {
    ctx.closeSheet({ restore: false });
    const source = openers().find(shown);
    if (!source) return;
    L.mover.startMode(source);
    // Режим «Переместить» — перенос: сценки нет (ядро отменяет её по setDisplay({ moving })).
    ctx.syncDisplay();
    ctx.announce(`${moveLabel()} Esc — отмена.`);
  }

  // Перенос закончился: отпустили над местом — оно выбрано; иначе ничего не меняется. Изменение другой вкладки во время
  // переноса применяется теперь (после отмены — её значение, после переноса — новее наше). Фокус не остаётся на
  // исчезнувшем.
  function onMoveEnd({ reason, place }) {
    if (!ui.mounted) return;
    ctx.syncDisplay();
    if (L.placeLater || !place) {
      L.placeLater = false;
      L.place = readPlace();
      applyLayout();
    }
    if (place) choosePlace(place);
    const active = document.activeElement;
    if (reason !== 'outside' && (!active || active === document.body || !shown(active))) fallbackFocus()?.focus({ preventScroll: true });
  }

  // ---------- место и вид в уголке ----------

  // «Место питомца»: места этого устройства, «Показать целиком» / «Свернуть», «Переместить» и пояснение.
  function placeHtml() {
    const layout = L.layout;
    return `<fieldset class="cat-place" data-cat-place-box data-device="${layout.device}">
      <legend>Место питомца</legend>
      <div class="cat-place-list">${P.PLACES[layout.device]
        .map((item) => `<label class="cat-place-option"><input type="radio" name="cat-place" value="${item.id}"${item.id === layout.place ? ' checked' : ''} /><span>${item.title}</span><span class="cat-place-mark" aria-hidden="true">✓</span></label>`)
        .join('')}</div>
      <div class="cat-place-actions">
        <button class="${C.alt}" type="button" data-cat-view-toggle>${viewToggleLabel()}</button>
        <button class="${C.alt}" type="button" data-cat-move${otherPlaces().length ? '' : ' disabled'}>Переместить</button>
      </div>
      <p class="${C.muted} cat-note" data-cat-place-note>${esc(placeNoteText())}</p>
    </fieldset>`;
  }

  const viewToggleLabel = () => (L.layout.wantsFull ? 'Свернуть' : 'Показать целиком');

  function placeNoteText() {
    const layout = L.layout;
    const call = ui.presence === 'on-call';
    const how = call
      ? 'Место и вид — для режима «Всегда рядом».'
      : !otherPlaces().length
        ? 'Другого места на этом экране сейчас нет.'
        : layout.device === 'phone'
          ? '«Переместить» — перетащите пальцем или нажмите место.'
          : 'Питомца можно перетащить мышью.';
    const keep = placeFailed()
      ? 'Не сохранилось в этом браузере: действует на этой странице до перезагрузки.'
      : ctx.offline()
        ? ctx.OFFLINE
        : 'У телефона и компьютера место и вид свои; хранятся в этом браузере.';
    return [call ? '' : P.placeNote(layout), how, keep].filter(Boolean).join(' ');
  }

  // Вид рядом со страницей — в «Настройках»: «Автоматически» возвращает прежнее поведение.
  function viewHtml() {
    const layout = L.layout;
    return `<fieldset class="cat-motion cat-view" data-cat-view-box>
      <legend>Вид рядом со страницей</legend>
      ${P.VIEWS.map((item) => `<label><input type="radio" name="cat-view" value="${item.id}"${layout.want === item.id ? ' checked' : ''} /> ${item.title}</label>`).join('')}
      <p class="${C.muted} cat-note">${layout.device === 'phone' ? 'Для телефона. «Автоматически» — портрет, как раньше.' : 'Для компьютера. «Автоматически» — целиком в боковой панели на высоком экране и внизу экрана, у логотипа — портрет.'}</p>
    </fieldset>`;
  }

  // Открытый уголок — по показанному месту и виду: переключатели на месте (фокус не теряется). Окно перешло границу
  // телефона — блоки заново, фокус — на выбранное место или вид.
  function syncPlaceBox() {
    const box = ui.sheet?.open ? ui.sheet.querySelector('[data-cat-place-box]') : null;
    if (!box) return;
    const layout = L.layout;
    if (box.dataset.device !== layout.device) {
      const focus = document.activeElement?.name;
      box.outerHTML = placeHtml();
      ui.sheet.querySelector('[data-cat-view-box]').outerHTML = viewHtml();
      if (focus === 'cat-place' || focus === 'cat-view') ui.sheet.querySelector(`input[name="${focus}"]:checked`)?.focus({ preventScroll: true });
      return;
    }
    for (const input of ui.sheet.querySelectorAll('input[name="cat-place"]')) input.checked = input.value === layout.place;
    for (const input of ui.sheet.querySelectorAll('input[name="cat-view"]')) input.checked = input.value === layout.want;
    const toggle = box.querySelector('[data-cat-view-toggle]');
    if (toggle.textContent !== viewToggleLabel()) toggle.textContent = viewToggleLabel();
    box.querySelector('[data-cat-move]').disabled = !otherPlaces().length;
    const note = box.querySelector('[data-cat-place-note]');
    const text = placeNoteText();
    if (note.textContent !== text) note.textContent = text;
  }

  // ---------- фокус ----------

  // Спрятан — видимая «Показать …» (у логотипа, лапка в шапке телефона), иначе куда скажет сайт (options.home).
  function fallbackFocus() {
    if (ui.shownHidden) return [L.side?.querySelector('[data-cat-return]'), L.restore?.querySelector('button')].find(shown) ?? O.home?.() ?? null;
    return openers().find(shown) ?? null;
  }

  // Кнопка питомца с фокусом: место, портрет, «Показать …» (после перерисовки её может не стать).
  function focusedControl() {
    const element = document.activeElement;
    return element && [L.dock, L.side, L.face, L.fold, L.float, L.bar, L.restore].some((box) => box?.contains(element)) ? element : null;
  }

  // Кнопка с фокусом исчезла — фокус на ту, что встала на её место; внутри открытого диалога сайта (страница под ним
  // недоступна) — куда скажет сайт (options.home(panel)). Фокус в других местах не трогается.
  function keepFocus(element) {
    if (!element || (element.isConnected && shown(element))) return;
    const panel = element.isConnected ? element.closest('dialog[open]') : null;
    (panel ? O.home?.(panel) : fallbackFocus())?.focus({ preventScroll: true });
  }

  // ---------- реплика ----------
  // Компьютер — рядом с питомцем в боковой панели и внизу экрана; телефон — без текста в панелях (реплики — в уголке).
  // Узкое облако не растёт за край: не помещается фраза с длинным именем — её короткий вариант (phrase.short).
  function saying(phrase) {
    for (const box of [L.dock?.querySelector('.cat-dock-say'), L.float?.querySelector('.cat-float-say')]) {
      if (!box) continue;
      if (!phrase) {
        box.classList.remove('is-saying');
        continue;
      }
      const bubble = box.querySelector('.cat-bubble');
      bubble.textContent = phrase.text;
      if (phrase.short && bubble.offsetTop + bubble.offsetHeight > box.clientHeight) bubble.textContent = phrase.short;
      box.classList.add('is-saying');
    }
    const side = L.side?.querySelector('.cat-side-say');
    if (phrase && side) {
      side.textContent = phrase.text;
      L.side.classList.add('is-saying');
    } else L.side?.classList.remove('is-saying');
  }

  // Рисунки мест — по показанному напарнику, облику и виду места: заменяется только отличающийся (фокус не теряется).
  function syncHostArts() {
    // У рисунка кота 0.1.4 атрибута data-kind нет — это кот.
    const stale = (svg, view) => !svg || svg.dataset.coat !== ctx.coat() || (svg.dataset.kind ?? 'cat') !== ui.kind || svg.dataset.view !== (view === 'full' ? 'full' : 'portrait');
    for (const [slot, place, host] of [
      [L.dock?.querySelector('.cat-dock-art'), 'dock', 'sidebar'],
      [L.float?.querySelector('.cat-host-art'), 'float', 'float'],
      [L.bar?.querySelector('.cat-host-art'), 'bar', 'bar'],
    ]) {
      if (slot && stale(slot.firstElementChild, hostView(host))) slot.innerHTML = managed(artFor(place, hostView(host)));
    }
    const side = L.side?.querySelector('.cat-side-face > svg');
    if (side && stale(side, 'compact')) side.replaceWith(fragment(managed(artFor('side', 'portrait'))));
    for (const button of [L.dock, L.float, L.bar].flatMap((box) => [...(box?.querySelectorAll('[data-cat-fold]') ?? [])])) button.setAttribute('aria-label', foldLabel());
  }

  // Элемент места: создаёт модуль, ставит сайт (options.places[place]); места без функции нет. Элемент — в L до вызова
  // сайта: бросит исключение после вставки — откат его уберёт.
  function host(key, place, cls) {
    if (!O.places[place]) return;
    const box = (L[key] = document.createElement('div'));
    box.className = `cat-${cls}`;
    box.id = `cat-${cls}`;
    O.places[place](box);
  }

  return {
    // Места сайта, «Свернуть», перенос, «Показать …» (порядок Tab — как на экране: сайт ставит места в своей разметке).
    mount() {
      L.place = readPlace();
      L.media = Object.entries(P.PLACE_MEDIA).map(([key, query]) => [key, window.matchMedia(query)]);
      for (const [, list] of L.media) ctx.on(list, 'change', safe(onMediaChange));
      L.mover = createMover(
        {
          zones: zoneList,
          same: sameLayout,
          ghost: () => (ctx.syncDisplay(), ctx.art({ id: `${ui.kind}-ghost`, view: 'portrait' })),
          label: moveLabel,
          cancel: C.alt,
          end: safe(onMoveEnd),
        },
        ui.abort.signal,
      );
      host('dock', 'sidebar', 'dock');
      host('side', 'logo', 'side');
      host('float', 'float', 'float');
      host('bar', 'bar', 'bar');
      for (const box of [L.dock, L.side, L.float, L.bar]) {
        ctx.on(
          box,
          'click',
          safe((event) => {
            const button = event.target.closest('.cat-dock-btn, .cat-side-face, .cat-host-btn');
            if (event.target.closest('[data-cat-return]')) ctx.showCat();
            else if (event.target.closest('[data-cat-fold]')) fold();
            else if (event.target.closest('[data-cat-call]')) ctx.openSheet(event.target.closest('[data-cat-call]'), 'call');
            else if (button) ctx.openSheet(button);
          }),
        );
        if (box) L.mover.watch(box);
      }
      if (O.places?.top) {
        L.fold = document.createElement('button');
        L.fold.type = 'button';
        L.fold.className = 'cat-fold cat-fold-top';
        L.fold.dataset.catFold = '';
        L.fold.title = 'Свернуть';
        L.fold.hidden = true;
        L.fold.innerHTML = FOLD_ICON;
        L.fold.addEventListener('click', safe(fold));
      }
      // «Показать …», когда питомец спрятан, на телефоне (у логотипа на телефоне места нет) — в разметке сайта (restore),
      // без неё — лапкой в шапке (top): вернуть питомца можно всегда (logo и top обязательны — mountPet проверяет).
      L.restore = document.createElement('div');
      L.restore.className = O.places.restore ? 'cat-sections-return' : 'cat-sections-return cat-top-return';
      L.restore.innerHTML = O.places.restore ? `<button class="${C.link}" type="button"></button>` : `<button class="cat-side-return" type="button">${PAW_ICON}</button>`;
      L.restore.querySelector('button').addEventListener('click', safe(ctx.showCat));
      (O.places.restore ?? O.places.top)(L.restore);
    },
    root: () => document,
    attach: (sheet) => document.body.append(sheet),
    attachLive: (live) => document.body.append(live),
    render() {
      L.layout = layoutNow();
      markLayout();
      ctx.syncDisplay();
      renderDock();
      renderSide();
      renderFace();
      renderFloat();
      renderBar();
      renderReturn();
    },
    display: () => ({ full: L.layout?.view === 'full', moving: L.mover.moving() }),
    openers,
    fallback: fallbackFocus,
    focused: focusedControl,
    keep: keepFocus,
    saying,
    minis: () => [L.dock, L.float].map((box) => box?.querySelector('.cat-dock-mini')),
    stage(title) {
      const stage = L.dock?.querySelector('[data-cat-stage]');
      if (stage) stage.textContent = title;
    },
    markMotion(move) {
      if (html().dataset.catMotion !== move) html().dataset.catMotion = move;
    },
    markPaused: (hidden) => html().classList.toggle('cat-paused', hidden),
    // Диалог модальный: страница под ним не прокручивается (html.cat-open), прокрутка — вернуть при закрытии.
    opened() {
      L.sheetY = window.scrollY;
      html().classList.add('cat-open');
    },
    closed({ restore }) {
      html().classList.remove('cat-open');
      if (restore && window.scrollY !== L.sheetY) window.scrollTo(0, L.sheetY);
    },
    changed: () => {},
    canOpen: () => true,
    visible: () => true,
    roots: () => [L.dock, L.side, L.float, L.bar, L.face, ui.sheet],
    active: () => document.activeElement,
    placeHtml,
    viewHtml,
    syncPlaceBox,
    change(field) {
      if (field.name === 'cat-place' && field.checked) choosePlace(field.value);
      else if (field.name === 'cat-view' && field.checked) chooseView(field.value);
      else return false;
      return true;
    },
    click(target) {
      if (target.closest('[data-cat-view-toggle]')) toggleView();
      else if (target.closest('[data-cat-move]')) startMove();
    },
    cancelMove: (reason) => L.mover?.cancel(reason),
    relayout: () => applyLayout(),
    placeChanged() {
      L.place = readPlace();
      applyLayout();
    },
    coatChanged() {
      syncHostArts();
      if (L.face) renderFace();
    },
    kindChanged() {
      if (ui.settings.hidden) {
        // Спрятан: меняется только подпись «Показать …» — кнопки те же, фокус на месте.
        const back = L.side?.querySelector('[data-cat-return]');
        back?.setAttribute('aria-label', ctx.returnLabel());
        back?.setAttribute('title', ctx.returnLabel());
        renderReturn();
      } else {
        syncHostArts();
        const label = L.dock?.querySelector('[data-cat-name]');
        if (label) label.textContent = ctx.name();
        renderFace();
        renderReturn();
      }
    },
    named() {
      const label = L.dock?.querySelector('[data-cat-name]');
      if (label) label.textContent = ctx.name();
    },
    // «Показать …» в открытом диалоге сайта: тот при закрытии возвращает фокус на свою кнопку — питомец получает его после.
    focusAfterShow(focusCat) {
      const panel = L.restore?.closest('dialog[open]');
      if (panel) {
        panel.addEventListener('close', () => setTimeout(focusCat, 0), { once: true, signal: ui.abort.signal });
        panel.close();
      } else focusCat();
    },
    focusIn() {
      L.lostEntry = false;
    },
    // Фокус ушёл в никуда со спрятанного входа — вернёт applyLayout.
    focusOut({ target, relatedTarget }) {
      if (!relatedTarget && openers().includes(target) && !shown(target)) L.lostEntry = true;
    },
    arrive: startArrive,
    destroy() {
      for (const step of [
        () => L.mover?.stop(),
        () => clearTimeout(L.layoutTimer),
        endArrive,
        () => [L.dock, L.side, L.float, L.bar, L.face, L.fold, L.restore, ui.sheet, ui.live].forEach((element) => element?.remove()),
        () => {
          const root = html();
          root.classList.remove('cat-on', 'cat-open', 'cat-paused');
          for (const key of ['catMotion', 'petAt', 'petView', 'petMove']) delete root.dataset[key];
          root.removeAttribute('data-pet-call');
        },
      ])
        safe(step)();
    },
  };
}
