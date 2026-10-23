---
name: pet-animator
description: Вызывать первым делом, до разведки репозитория, при любой задаче про арт, позы и анимацию питомцев pet-companion (кот, собака, кролик). Карта файлов, словарь поз, конвенции CSS и QA-рецепт для расширения библиотеки без поломки текущей реализации — новая поза, новый питомец, облик, аксессуар, сценка, анимация, движения, переменные --pet-*, data-pose / data-scene, скриншоты поз, QA анимаций, сверка арта «до и после», правка pet.css / dog.css / bunny.css / *-art.mjs / pet/native/*.mjs. Также когда просят «добавь позу sleepy коту», «нарисуй собаке новый платок», «сделай сценку», «проверь, что анимации не сломались», «сними позы», «new pose», «new pet», «coat», «accessory», «scene», «pose screenshots», «animation QA», «CSS variables» в этом репозитории.
---

# pet-animator — расширение библиотеки pet-companion

Скилл для Claude Code в этом репозитории: сокращает путь к нужным файлам и фиксирует проверяемый рецепт. Он не заменяет `CONTRIBUTING.md` («Правила изменений», «Новый питомец или модель») и `docs/ARCHITECTURE.md` § 7 — при расхождении верить коду и документам, а скилл поправить. Все сведения ниже сверены с кодом 0.4.0 (2026-10-23).

## 1. Карта файлов

Один питомец живёт в семи местах. Кролик (0.4.0) — свежий образец «как добавлять питомца»: `git show --stat 7d37a13`.

| Что | Кот | Собака | Кролик |
| --- | --- | --- | --- |
| Определение (формат 1: позы, облики, аксессуары, сценки, области игры, комната) | `pet/defs/cat.mjs` | `pet/defs/dog.mjs` | `pet/defs/bunny.mjs` |
| Публичный вход | `pet/pets.mjs` (`cat`, `dog`, `corner`) | то же | `pet/bunny.mjs` (`bunny`, `bunnyWeb`), типы `pet/bunny.d.mts` |
| Веб-рисунок (SVG строками, 220×204) | `pet/cat-art.mjs` (`catSvg`; там же сцена уголка `sceneSvg`, миска, клубок) | `pet/dog-art.mjs` (`dogSvg`, канат, мячик) | `pet/bunny-art.mjs` (`bunnySvg`, морковка, сено) |
| Веб-набор (`PetWebKit`: `art`, `item`, `mini`, списки) | `pet/web/kits.mjs` → `catWeb` | `pet/web/kits.mjs` → `dogWeb` | `pet/web/bunny.mjs` → `bunnyWeb` (со `styles`) |
| CSS поз, движений, сценок | `pet/pet.css` (общая оболочка + кот) | `pet/dog.css` | `pet/bunny.css` |
| Нативный набор (`react-native-svg`, таблица суставов) | `pet/native/cat.mjs` → `catNative` | `pet/native/dog.mjs` → `dogNative` | `pet/native/bunny.mjs` → `bunnyNative` |
| Реплики | `pet/defs/calm.mjs` → `byPet.cat` | `byPet.dog` | `byPet.bunny` |
| Проверки Node | `test/cat.test.mjs`, `test/look.test.mjs`, `test/kits.test.mjs`, `test/core-pl06.test.mjs` | `test/look.test.mjs`, `test/kits.test.mjs`, `test/core-pl06.test.mjs` | `test/bunny.test.mjs` |
| Проверки Chrome | `test/browser.mjs` (`desktop`, `phone`), `test/browser-play.mjs` | те же | `test/browser-bunny.mjs` |
| Проверки натива | `test/native-view.test.mjs` (все позы × облики × аксессуары разметкой) | то же | то же, `test/native-example.test.mjs` |
| Документация | README «Питомцы и модели поведения», «Стили» | те же | README «Кролик»; `docs/KIT.md` матрица |

Общие для всех: словарь поз — `pet/core/define.mjs` (`REQUIRED_POSES`, `PAW_POSE`, `OPTIONAL_POSES`, `resolvePose`); атрибуты рисунка ставит `paint()` в `pet/web/shell.mjs`; отметки на `<html>` — `pet/web/legacy/places.mjs`; проверка веб-набора — `kitProblem` (`pet/web/kits.mjs`), нативного — `nativeKitProblem` (`pet/native/kits.mjs`); состав архива — явные списки в `test/package.mjs`; перечень — `manifest.json` (`npm run manifest`). Сторонний питомец без правки пакета — `examples/extension/` (веб) и `examples/expo/extension.mjs` (натив).

## 2. Словарь поз

Словарь формата 1 закрыт (`pet/core/define.mjs`). Имя вне словаря допустимо в `poses` только как поза своей сценки: реакции ядра берут позы только из словаря, поэтому «новая поза для реакции» — это новая версия формата, а не правка `format: 1`. `poseFallback` — замена недостающей позы словаря другой позой из `poses` (по цепочке, без циклов; `calm` — только сама). У штатных определений `poseFallback` нет: веб-наборы рисуют все 18 поз; нативные рисуют 17 и заменяют `settle` → `content` (`substitutes`).

| Поза | Когда показывает ядро (модель `calm`) | Класс | Нарисована |
| --- | --- | --- | --- |
| `calm` | покой | обязательная, только сама | веб и натив у всех трёх |
| `attentive` | тишина (ввод, таймер, диктовка, диалог) или экран занятия — `basePose` | обязательная | веб и натив |
| `rest` | дремота после паузы | обязательная | веб и натив |
| `content` | довольный покой (после поглаживания, лакомства) | обязательная | веб и натив |
| `wait` | `notify('failed')` — нейтральное ожидание 1 с без реплики | обязательная | веб и натив |
| `joy` | занятие дало знак (`notify('saved', { counted })`) | обязательная | веб и натив |
| `support` | трудное занятие (`hard`) | обязательная | веб и натив |
| `unlock` | открыта ступень, новая вещь | обязательная | веб и натив |
| `greet` | приветствие дня, выбор напарника (`meet`), готовое имя (`named`) | обязательная | веб и натив |
| `pet` | поглаживание (`pet`, `calmPet`), удержание жестом | обязательная | веб и натив |
| `paw` | лапа в «Поиграть» (`paw`, `calmPaw`); «Дай лапу» вне игры — только `ask: true` (собака) | условная: только при `actions.paw` | веб и натив у всех трёх |
| `feed` → `fed` | лакомство: ест 2,8 с, затем доволен 2,2 с | обязательные | веб и натив |
| `sniff` | миска в «Поиграть» (`toward` — куда смотрит) | обязательная, играет только при виде `play` | веб и натив |
| `watch` | следит за мячиком | обязательная (при `play`) | веб и натив |
| `ball` | мячик катится | обязательная (при `play`) | веб и натив |
| `yawn` | зевок, 18 % в спокойном покое, не чаще раза в 6 мин | декоративная, необязательная | веб и натив |
| `settle` | «устроился» после переноса места | декоративная, необязательная | веб; натив — замена `content` |

**Сценки** — не позы реакций, а `data-scene` поверх позы покоя (`shell.mjs` `paint()`: `data-pose` остаётся `calm`/`attentive`/…, `data-scene` — ID сценки; CSS-кадры начинаются и кончаются в покое). Свои позы сценок (`stretch`, `curl`, `fetch`, `hop`, `wash`) в `poses` определения есть, но в `data-pose` веб их не ставит; правило `bunny.css` на `data-pose='hop'` в вебе не срабатывает. Натив рисует сценки ключевыми позами с фазами (`kit.scenes`).

| Питомец | Сценка | Поза | `needs` | Длительность, мс |
| --- | --- | --- | --- | --- |
| кот | `stretch` потягивается | `stretch` | `any` | 3600 (без движения 2400) |
| кот | `curl` сворачивается клубком | `curl` | `full` | 4600 (предел `SCENE_MS_MAX`) |
| собака | `fetch` приносит мячик | `fetch` | `any` | 4200 |
| кролик | `hop` прыгает на месте | `hop` | `any` | 3200 |
| кролик | `wash` умывает мордочку | `wash` | `full` | 4200 |

Облики и аксессуары (аксессуар открывается ступенью): кот — `smoke`, `ginger`, `tuxedo`; собака — `caramel`, `spotted`, `blacktan`; кролик — `fawn`, `snow`, `spot`; аксессуары кота и собаки — `scarf` (0), `plaid` (1), `badge` (4); кролика — `scarf` (0), `bow` (1), `clover` (4).

## 3. Конвенции CSS

**Переменные темы** — 12 штук, заданы на `:root` в `pet/pet.css` (светлая, и тёмная под `prefers-color-scheme: dark`); контейнер переносит их в `--pet-v-*` (`pet/web/view.css`, проверка `package-shape.test.mjs` сверяет пары). Сайт переопределяет любую после `pet.css`; внутри модуля новую переменную темы добавлять только парой «светлая + тёмная + перенос в `view.css`».

| Переменная | Назначение |
| --- | --- |
| `--pet-bg`, `--pet-surface`, `--pet-surface-2` | фон страницы под питомцем, поверхности окна и карточек |
| `--pet-ink`, `--pet-ink-2` | основной и приглушённый текст |
| `--pet-line` | рамки и разделители |
| `--pet-accent`, `--pet-accent-ink`, `--pet-accent-soft` | акцент кнопок, текст на акценте, мягкая подложка |
| `--pet-warn`, `--pet-warn-soft` | предупреждение «не всё сохранилось» |
| `--pet-radius` | скругление окна и кнопок |

Комната уголка — `--cat-wall-top`, `--cat-wall`, `--cat-floor` и соседние (README «Стили»). Переменные поз — внутренние, не интерфейс.

**Атрибуты и классы рисунка** (`<svg class="cat-art" …>`, ставит набор и `paint()`):

| Атрибут / класс | Значения | Кто ставит |
| --- | --- | --- |
| `data-kind` | `dog`, `bunny`, сторонний ID; у кота атрибута нет (кот — умолчание `pet.css`) | набор (`art`) |
| `data-view` | `full`, `portrait` | набор |
| `data-coat`, `data-acc` | ID облика и надетого аксессуара (`tryOn` — примерка) | набор, затем `paint()` |
| `data-pose` | поза словаря после `drawnPose` | `paint()` |
| `data-scene` | ID сценки поверх позы покоя, только где читается (`needs`) | `paint()` |
| `data-motion` | `normal`, `calm`, `none` (`effectiveMotion`: системное «уменьшить движение» даёт `none`) | `paint()` |
| `data-micro` | одиночное движение: `ear`, `tail`, `look`, `blink`, `tilt`, `nose` | оболочка по таймеру |
| `data-toward` | `left`, `right` — к предмету в «Поиграть» | `paint()` |
| `data-breathe`, `data-again` | дыхание в покое (только `normal`), повтор той же реакции | `paint()`, оболочка |
| `[data-acc-part='…']` | части аксессуара внутри рисунка; видна только надетая (`pet.css` прячет все `.cat-acc`) | рисунок |
| `.cat-paused` на предке | вкладка скрыта или питомец спрятан: `animation-play-state: paused` | оболочка |
| на `<html>`: `data-cat-motion`, `data-pet-at`, `data-pet-view`, `data-pet-move`, `data-pet-call`, `data-cat-fold`, класс `cat-open` | режим движения, место, вид, перенос, «по зову», свёрнут, открыт уголок | `places.mjs` |

Остановка движения в `pet.css` (строки у «Без анимации»): `.cat-art[data-motion='none']` и потомки — `animation: none; transition: none` (`!important`); `.cat-paused .cat-art` — пауза; `@media (prefers-reduced-motion: reduce)` — то же, что `none`. Настройка в вебе — `core.setPreferences({ motion })`, значения `MOTIONS` в `pet/core/formats/legacy.mjs`: `normal`, `calm`, `none`.

**Имена по питомцу** — чтобы файлы не пересекались:

| | Кот (`pet.css`) | Собака (`dog.css`) | Кролик (`bunny.css`) | Новый питомец `fox` |
| --- | --- | --- | --- | --- |
| Область правил | `.cat-art` без `data-kind` | каждое правило — `.cat-art[data-kind='dog']` | `.cat-art[data-kind='bunny']` | `.cat-art[data-kind='fox']` — без исключений |
| Классы частей | `cat-head`, `cat-lid-up`, `cat-t1`… | `dog-*` плюс общие `cat-*` | `bunny-*` | `fox-*` |
| Keyframes | `cat-*` | `dog-*` | `bunny-*` | `fox-*` |
| Переменные суставов | `--cat-*`, `--head-*`, `--ear-*`, `--lid-*`, `--to`, `--t1..3` (без префикса — кот был первым) | `--dg-*` | `--bn-*` | `--fx-*` |
| Что меняют правила | transform, opacity, display, анимации | то же | то же (`test/bunny.test.mjs` это проверяет) | то же |

Новый питомец получает свой CSS-файл; страница `mountPet` подключает его после `dog.css`, контейнер — через `styles` набора. В `pet.css` общие механизмы (движение, пауза, тема, оболочка) не трогаем; образцы аксессуаров (`.cat-swatch-<acc>`) — в файле питомца. ID аксессуара один на всех питомцев — у кота, собаки и кролика `scarf` общий, рисунок свой.

## 4. Чек-лист аниматора

Во всех сценариях: сначала снимки «до» (раздел 6), в конце — `npm test`, `npm run test:browser`, `npm run test:package`, снимки «после», строка в CHANGELOG «Не выпущено».

### А. Поза существующему питомцу

Поза словаря у штатных уже нарисована — «добавить позу» значит либо перерисовать существующую, либо добавить сценку со своей позой (сценарий В). Для перерисовки:

1. Снимки «до»: `node scripts/pose-shots.mjs --pet cat --pose joy --out .shots/before`.
2. Веб: правила `.cat-art[data-pose='joy'] …` в CSS питомца (у кота — `pet.css`, без `data-kind`; у собаки и кролика — с `data-kind`). Новая часть рисунка — класс в `*-art.mjs` (всем обликам одинаково: `test/look.test.mjs` сверяет части, рамку и опору у всех обликов).
3. Натив: та же поза в таблице `POSES` файла `pet/native/<pet>.mjs` (суставы = переменные CSS).
4. Не трогать: имена поз, `poses` определения, `kitNeeds`, `pet.d.mts`.
5. Проверки: `npm test` (`look`, `cat`/`bunny`, `native-view`), `npm run test:browser`; снимки «после», сравнить.
6. Документация: CHANGELOG; README только если меняется описание «Что умеет».

### Б. Облик или аксессуар

1. Снимки «до» для питомца целиком (`--pet dog`).
2. Определение: `coats` (`{ id, title }`; первый — по умолчанию) или `accessories` (`{ id, title, stage, short? }`) в `pet/defs/<pet>.mjs`. Ступень аксессуара — 0…4; подарок ступени — `items.gifts`.
3. Веб-рисунок: палитра в `COATS` (`coatOf` возвращает умолчание для неизвестного ID) или новая группа `[data-acc-part='<id>']` в `*-art.mjs`; набор — списки `coats` / `accessories`; CSS — `.cat-art[data-kind='…'][data-acc='<id>'] [data-acc-part='<id>'] { display: inline }` и образец `.cat-swatch-<id>` (цвет кружка выбора).
4. Натив: `COATS` и рисунок аксессуара в `pet/native/<pet>.mjs`, списки набора.
5. Хранение: `look:v1` хранит ID облика, `ext:v1` / `companion:v1` — аксессуар; неизвестное значение читается как умолчание — новые ID прежние данные не ломают, переименовывать существующие нельзя.
6. Проверки: `npm test` (`look.test.mjs`, `define.test.mjs`, `kits.test.mjs` — штатный набор против определения; `native-view` — облики различимы), `test:browser` (выбор облика в уголке). Снимки «после» — новый облик появится в атласе сам.
7. Документация: README «Что умеет» питомца, CHANGELOG.

### В. Сценка

1. Снимки «до» сценок питомца: `node scripts/pose-shots.mjs --pet cat --pose stretch,curl`.
2. Определение: `scenes` — `{ id, pose, needs: 'any' | 'full', ms ≤ 4600, still < ms, text }`; поза сценки — в `poses` (локальный ID, не из словаря).
3. Веб: набор — поза в `poses`, ID в `scenes`; CSS — `.cat-art[data-kind='…'][data-scene='<id>'] …` с keyframes `<pet>-<id>-*`, кадры 0 % и 100 % не задаются (сценка начинается и кончается в покое), длительность — `ms` определения, у `data-motion='calm'` — мягче, у `portrait` — только если `needs: 'any'`.
4. Натив: `scenes` набора и фазы ключевых поз (образец — `hop` и `wash` в `pet/native/bunny.mjs`).
5. Реплика сценки — группа `scene` в `byPet.<pet>` (`pet/defs/calm.mjs`), по желанию со `stage`.
6. Проверки: `npm test` (`core-pl06.test.mjs` — таблицы сценок, `kits.test.mjs`, `bunny.test.mjs` — правило на каждую сценку), `test:browser` (объявленные сценки `getState().display.scenes`). `docs/ARCHITECTURE.md` § 7.1.1 — таблица ожидаемых сценок, если меняется состав.
7. Снимки «после»: `--pose <id>` — файл `…-scene-<id>@….png`, кадр на доле `--scene-at` (по умолчанию 0,5).

### Г. Новый питомец (веб + натив)

Штатный — по образцу кролика, целиком в одном изменении; сторонний — `examples/extension/`, пакет не меняется.

1. Определение `pet/defs/<pet>.mjs` (`definePet`): ID без точки — только штатный, его надо добавить в `BUILTIN_KINDS` (`pet/core/formats/legacy.mjs`; прежние версии такой ID отклоняют — minor); данные — в `ext:v1`, `fallback: 'cat' | 'dog'`.
2. Вход `pet/<pet>.mjs` + `pet/<pet>.d.mts` (определение и веб-набор со `styles`); `exports` в `package.json` — `./<pet>` и `./<pet>.css`; `PAGE_STYLES` в `scripts/manifest.mjs`; `npm run manifest`.
3. Веб: `pet/<pet>-art.mjs` (220×204, земля y ≈ 188, портретный `viewBox`, `data-kind`), `pet/web/<pet>.mjs` (набор: все обязательные позы по роли, лапа при `actions.paw`, облики, аксессуары, свои вещи `item`/`mini`), `pet/<pet>.css` по разделу 3.
4. Натив: `pet/native/<pet>.mjs` (`Figure`, `room: true`, `items`/`Item`, `play: true`, `scenes`), экспорт во входе `pet/native.mjs` и типах `pet/native.d.mts`.
5. Реплики: `byPet.<pet>` в `pet/defs/calm.mjs` (все группы, без деталей других видов).
6. Явные списки: `test/package.mjs` (`RUNTIME`, `NATIVE`, `PEER_FILES['react-native-svg']`, `NATIVE_LOCAL`), `test/package-shape.test.mjs` (список `exports`, граф натива), `manifest.json`.
7. Проверки: `test/<pet>.test.mjs` (по `test/bunny.test.mjs`: определение, набор, рисунок, CSS-правила, области игры, комната, реплики), `test/browser-<pet>.mjs` (подключить в `petModuleQa` `test/browser.mjs`), `native-view.test.mjs`; затем `npm test`, `test:browser`, `test:package`.
8. Документация: README (раздел питомца, «Стили», «Состав пакета»), `docs/KIT.md` матрица, CONTRIBUTING таблица «Устройство», CHANGELOG.
9. Снимки: добавить ID в `PETS` скрипта `scripts/pose-shots.mjs` и в страницу атласа (импорт входа и набора), прогнать атлас и живой режим.

## 5. Правила «не сломать»

- Имена поз, сценок, обликов, аксессуаров, классов `cat-*`/`dog-*`/`bunny-*`, keyframes и переменных `--pet-*` не переименовывать и не удалять: это публичный интерфейс (CONTRIBUTING «Правила изменений») и ключи хранения.
- Новая поза словаря невозможна без новой версии формата; у стороннего питомца недостающая поза — только через `poseFallback` на существующую; штатные наборы обязаны рисовать всё, что требует `kitNeeds` / `nativeKitNeeds` (иначе `mountPet` и `PetView` откажут).
- Публичный интерфейс (входы, `exports`, типы, `mountPet`/`mountPetIn`/`PetView` и их настройки, CSS-классы и переменные, отметки на `<html>`, ключи хранения) не меняется без minor-версии и строки в CHANGELOG (`docs/ARCHITECTURE.md` § 15; README «Версии и обновление»).
- Данные хранилища: новые поля и ID только с чтением прежних; неизвестный облик или аксессуар — умолчание, не ошибка; запись функцией ключа, не нормализованным показом.
- Расширения — только через публичные входы, как `examples/extension/`; в `pet/core/**` нет имён штатных питомцев вне `formats/legacy.mjs`.
- Любое изменение CSS или рисунка штатного питомца — снимки «до» и «после» (раздел 6) и глаза: байт-в-байт равные файлы вне затронутых поз — доказательство, что остальное не задето.
- В `pet/` нет внешних ресурсов, `@import` и `url()` (кроме `data:`); новый файл в `pet/` — в явный список `test/package.mjs` и в перечень (`npm run manifest`), иначе `npm test` падает. Скрипты и снимки в пакет не входят (`files` в `package.json`, `.shots/` в `.gitignore`).
- Поведение меняется вместе с проверкой, которая его фиксирует; исполняемый код в определениях (формат 1 — только данные) не допускается.

## 6. QA-рецепт: снимки остановленных анимаций

Скрипт `scripts/pose-shots.mjs` (Node 22+, системный Google Chrome; сервер и Chrome — как у `test/browser.mjs`):

```sh
node scripts/pose-shots.mjs                       # все питомцы, 1280×900 и 390×844, вывод в .shots/
node scripts/pose-shots.mjs --pet bunny --acc scarf --out .shots/before
node scripts/pose-shots.mjs --pet cat --pose joy,stretch --view all
node scripts/pose-shots.mjs --live                # ещё и живой режим: стенд, уголок закрыт / открыт / «Поиграть»
```

Ключи: `--pet cat|dog|bunny|all`, `--out`, `--viewport ШxВ[,ШxВ]`, `--view full|portrait|all`, `--pose`, `--coat`, `--acc` (списки через запятую; `--pose` фильтрует и сценки), `--scenes 0` (без сценок), `--scene-at 0…1` (кадр сценки), `--live`, `--no-atlas`.

- **Атлас** (основной режим): пустая страница со стилями пакета, рисунок — функция `art()` набора напрямую, `data-motion='none'` до первого кадра, `reducedMotion: 'reduce'` как второй предохранитель. Файл на сочетание: `<pet>-<coat>-<acc>-<pose>[-portrait]@<w>x<h>.png`. Сценки — `…-scene-<id>…`: при `none` они неотличимы от покоя, поэтому снимаются с движением `normal`, обёрткой `.cat-paused` и перемоткой каждой анимации на долю `--scene-at` (Web Animations API). Повторный запуск даёт байт-в-байт те же файлы (проверено 2026-10-23: 1062 из 1062).
- **Живой режим** (`--live`): настоящий `mountPet` на `test/stand.html` (`storage: 'shots'`, кролик подключён явно), `setPreferences({ motion: 'none' })`, часы страницы остановлены (`clock.install` + `pauseAt`, приветствие доигрывает `runFor`), `Math.random` задан; перед снимком — конец конечных анимаций интерфейса. Файлы `live-<pet>-closed|corner|play@<w>x<h>.png`. Показывает уголок и «Поиграть» целиком, но не все позы — для них атлас.
- **Результаты**: `.shots/` в корне (в `.gitignore`), `index.html` — контактный лист. Ошибка страницы или рисунок, не принявший позу, — код 1.

Сравнение «до» и «после» — без пиксельных библиотек:

```sh
node scripts/pose-shots.mjs --pet cat --out .shots/before     # на исходном коде (или после git stash)
# … правка …
node scripts/pose-shots.mjs --pet cat --out .shots/after
for f in .shots/before/*.png; do cmp -s "$f" ".shots/after/$(basename "$f")" || echo "изменился: $(basename "$f")"; done
```

Список изменившихся файлов должен совпадать с ожиданием (только затронутые позы и сценки); их открыть парами (инструмент Read показывает PNG, либо два `index.html` рядом). Обязательные случаи при изменении арта штатного питомца: все позы × все облики × аксессуар ступени 0 (`--acc scarf`) в обоих размерах окна (умолчание `--viewport`), плюс сценки питомца; при правке аксессуара — все аксессуары.

## 7. Как работать с этим скиллом

1. Прочитать скилл; при задаче про питомца открыть его строку в карте файлов (раздел 1) и нужный сценарий чек-листа (раздел 4). CONTRIBUTING и ARCHITECTURE § 7 читать по ссылкам из чек-листа — скилл сокращает путь, а не заменяет их.
2. Снимки «до» для затронутого питомца (`--out .shots/before`).
3. Изменения по сценарию: определение → рисунок → набор → CSS → натив → реплики → проверки.
4. `npm test`, `npm run test:browser`, `npm run test:package` (новый файл — ещё `npm run manifest`).
5. Снимки «после» (`--out .shots/after`), сравнение, просмотр изменившихся глазами.
6. Документация: README (если меняется «Что умеет» или подключение), CHANGELOG «Не выпущено» (раздел создаётся над последней версией), `docs/ARCHITECTURE.md` при отступлении от контракта.
7. Один коммит на русском в стиле истории репозитория: первая строка — что сделано, через точку с запятой — части. Не пушить без просьбы.
