#!/usr/bin/env node
// Снимки поз штатных питомцев с остановленной анимацией (средство разработки; в пакет не входит, его не запускают
// проверки). Для сверки арта «до» и «после» правки рисунка или CSS: скилл .claude/skills/pet-animator/SKILL.md, раздел 6.
//
//   node scripts/pose-shots.mjs [--pet cat|dog|bunny|all] [--out <папка>] [--viewport 1280x900,390x844]
//                               [--view full|portrait|all] [--pose a,b] [--coat a,b] [--acc a,b] [--scenes 0|1]
//                               [--scene-at 0.5] [--live] [--no-atlas]
//
// Режим «атлас» (основной): пустая страница со стилями пакета (pet.css → dog.css → bunny.css), арт каждой позы рисуется
// напрямую функцией рисунка набора (catWeb, dogWeb, bunnyWeb — art()), не через состояние ядра; data-motion='none'
// выставлен до первого кадра (анимации и переходы выключены правилом pet.css); перебор поз определения × облики ×
// аксессуары набора. Один PNG на сочетание: <pet>-<coat>-<acc>-<pose>[-portrait]@<w>x<h>.png. Сценки (data-scene поверх позы
// покоя calm — как рисует оболочка web/shell.mjs) при data-motion='none' неотличимы от покоя, поэтому снимаются иначе:
// движение normal, обёртка .cat-paused (pet.css: animation-play-state: paused) и каждая анимация рисунка переведена на долю
// --scene-at своей длительности (Web Animations API) — кадр детерминирован; файл <pet>-<coat>-<acc>-scene-<id>…png.
//
// Режим «живой» (--live, дополнительный): настоящий mountPet на стенде test/stand.html (storage 'shots', кролик подключён
// явно, как в test/browser-bunny.mjs), setPreferences({ motion: 'none' }), часы страницы остановлены (page.clock: install,
// pauseAt, дальше только runFor — приветствие дня доигрывает, облако реплики стоит), случайность задана (реплика — всегда
// одна и та же, сценка не выпадает); состояния: уголок закрыт, уголок открыт, «Поиграть» —
// файлы live-<pet>-<состояние>@<w>x<h>.png. Перед снимком — конец конечных анимаций интерфейса (getAnimations) и два кадра.
//
// Детерминизм: фиксированный viewport, deviceScaleFactor 1, emulateMedia({ reducedMotion: 'reduce' }) как второй
// предохранитель (у поз и живого режима; у сценок — no-preference: при reduce pet.css снимает анимации, и перематывать
// нечего), document.fonts.ready; пауз по времени нет. Chrome — как в test/browser.mjs (channel: 'chrome'), сервер стенда —
// его же serve() (стенд, /pet/…). В папке вывода — index.html (контактный лист) для просмотра глазами.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../test/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PETS = ['cat', 'dog', 'bunny'];
const START = new Date('2026-10-11T10:00:00');

function parseArgs(argv) {
  const opts = { pet: 'all', out: path.join(root, '.shots'), viewport: '1280x900,390x844', view: 'full', pose: '', coat: '', acc: '', scenes: '1', sceneAt: '0.5', live: false, atlas: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`${arg}: нет значения`);
      return argv[i];
    };
    if (arg === '--pet') opts.pet = next();
    else if (arg === '--out') opts.out = path.resolve(next());
    else if (arg === '--viewport') opts.viewport = next();
    else if (arg === '--view') opts.view = next();
    else if (arg === '--pose') opts.pose = next();
    else if (arg === '--coat') opts.coat = next();
    else if (arg === '--acc') opts.acc = next();
    else if (arg === '--scenes') opts.scenes = next();
    else if (arg === '--scene-at') opts.sceneAt = next();
    else if (arg === '--live') opts.live = true;
    else if (arg === '--no-atlas') opts.atlas = false;
    else if (arg === '--help' || arg === '-h') return null;
    else throw new Error(`неизвестный аргумент ${arg}`);
  }
  const pets = opts.pet === 'all' ? PETS : opts.pet.split(',');
  for (const pet of pets) if (!PETS.includes(pet)) throw new Error(`--pet: ${pet} (ожидается ${PETS.join(', ')} или all)`);
  const viewports = opts.viewport.split(',').map((item) => {
    const m = /^(\d+)x(\d+)$/.exec(item.trim());
    if (!m) throw new Error(`--viewport: ${item} (ожидается ШxВ, например 1280x900)`);
    return { width: Number(m[1]), height: Number(m[2]) };
  });
  const views = opts.view === 'all' ? ['full', 'portrait'] : [opts.view];
  for (const view of views) if (!['full', 'portrait'].includes(view)) throw new Error(`--view: ${view} (full, portrait или all)`);
  const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null);
  const sceneAt = Number(opts.sceneAt);
  if (!(sceneAt >= 0 && sceneAt <= 1)) throw new Error('--scene-at: доля длительности от 0 до 1');
  return { pets, out: opts.out, viewports, views, pose: list(opts.pose), coat: list(opts.coat), acc: list(opts.acc), scenes: opts.scenes !== '0', sceneAt, live: opts.live, atlas: opts.atlas };
}

const USAGE = `node scripts/pose-shots.mjs [--pet cat|dog|bunny|all] [--out .shots] [--viewport 1280x900,390x844] [--view full|portrait|all]
                            [--pose a,b] [--coat a,b] [--acc a,b] [--scenes 0|1] [--scene-at 0.5] [--live] [--no-atlas]`;

// Страница атласа: стили пакета в порядке каскада, сцена под один рисунок, наборы и определения из модулей стенда.
const ATLAS_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Снимки поз</title><link rel="icon" href="data:," />
<link rel="stylesheet" href="/pet/pet.css" /><link rel="stylesheet" href="/pet/dog.css" /><link rel="stylesheet" href="/pet/bunny.css" />
<style>
  body { margin: 0; background: #fff; }
  #stage { display: inline-block; padding: 8px; }
  #stage .cat-art { display: block; width: 220px; height: 204px; }
  #stage .cat-art[data-view='portrait'] { width: 128px; height: 128px; }
</style></head>
<body><div id="stage"></div>
<script type="module">
  const [{ cat, dog }, { bunny, bunnyWeb }, { catWeb, dogWeb, kitScenes }] = await Promise.all([import('/pet/pets.mjs'), import('/pet/bunny.mjs'), import('/pet/web/kits.mjs')]);
  const defs = { cat, dog, bunny };
  const kits = { cat: catWeb, dog: dogWeb, bunny: bunnyWeb };
  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.shots = {
    // План питомца: позы определения без поз сценок (сценка — data-scene поверх покоя), сценки, которые рисует набор,
    // облики и аксессуары набора; позы определения, которых набор не рисует (у штатных — нет), — в missing.
    plan(pet) {
      const def = defs[pet];
      const kit = kits[pet];
      const scenePoses = def.scenes.map((scene) => scene.pose);
      const poses = def.poses.filter((pose) => !scenePoses.includes(pose));
      return { poses: poses.filter((pose) => kit.poses.includes(pose)), missing: poses.filter((pose) => !kit.poses.includes(pose)), scenes: kitScenes(kit, def), coats: [...kit.coats], accessories: [...kit.accessories] };
    },
    // Рисунок набора с нужными атрибутами до первого кадра. Поза — data-motion='none'; сценка — пауза и перемотка анимаций.
    async draw({ pet, view, coat, accessory, pose, scene, at }) {
      const stage = document.getElementById('stage');
      stage.classList.toggle('cat-paused', Boolean(scene));
      stage.innerHTML = kits[pet].art({ id: 'shot', view, coat, accessory });
      const svg = stage.firstElementChild;
      svg.dataset.pose = pose;
      svg.dataset.motion = scene ? 'normal' : 'none';
      if (scene) svg.dataset.scene = scene;
      await frames();
      if (scene) {
        for (const animation of svg.getAnimations({ subtree: true })) {
          const timing = animation.effect.getComputedTiming();
          animation.pause();
          animation.currentTime = timing.delay + at * (Number.isFinite(timing.duration) ? timing.duration : 0);
        }
        await frames();
      }
      return { pose: svg.dataset.pose, scene: svg.dataset.scene ?? '', animations: svg.getAnimations({ subtree: true }).length };
    },
  };
  await document.fonts.ready;
  window.shotsReady = true;
</script></body></html>`;

// Контекст снимка: фиксированный размер, масштаб 1, светлая тема. reduced — системное «уменьшить движение» как второй
// предохранитель (pet.css снимает все анимации рисунка); для сценок оно выключено — иначе нечего перематывать.
async function context(browser, viewport, { reduced = true } = {}) {
  const motion = reduced ? 'reduce' : 'no-preference';
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: motion, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.qaErrors = [];
  page.on('pageerror', (error) => page.qaErrors.push(error.message));
  page.on('console', (message) => (message.type() === 'error' || message.text().startsWith('Питомец')) && page.qaErrors.push(message.text()));
  await page.emulateMedia({ reducedMotion: motion });
  return { ctx, page };
}

const tag = ({ width, height }) => `${width}x${height}`;

// Страница атласа в контексте.
async function openAtlas(page, base) {
  await page.route(`${base}pose-shots`, (route) => route.fulfill({ body: ATLAS_PAGE, contentType: 'text/html; charset=utf-8' }));
  await page.goto(`${base}pose-shots`);
  await page.waitForFunction(() => window.shotsReady === true);
}

// Снимки одного набора сочетаний на открытой странице атласа; scene — '' (поза) или ID сценки.
async function shoot(page, opts, viewport, { pet, plan, shots }) {
  const files = [];
  const coats = plan.coats.filter((coat) => !opts.coat || opts.coat.includes(coat));
  const accessories = plan.accessories.filter((acc) => !opts.acc || opts.acc.includes(acc));
  for (const view of opts.views) {
    for (const coat of coats) {
      for (const accessory of accessories) {
        for (const { pose, scene } of shots) {
          const drawn = await page.evaluate((o) => window.shots.draw(o), { pet, view, coat, accessory, pose, scene, at: opts.sceneAt });
          if (drawn.pose !== pose || drawn.scene !== scene) throw new Error(`${pet}: рисунок не принял позу ${pose}${scene ? ` / сценку ${scene}` : ''}`);
          if (scene && drawn.animations === 0) throw new Error(`${pet}: сценка ${scene} без анимаций — кадр был бы покоем`);
          const name = `${pet}-${coat}-${accessory}-${scene ? `scene-${scene}` : pose}${view === 'portrait' ? '-portrait' : ''}@${tag(viewport)}.png`;
          await page.locator('#stage').screenshot({ path: path.join(opts.out, name), animations: 'allow', caret: 'hide' });
          files.push({ pet, name, view, coat, accessory, pose, scene, viewport: tag(viewport) });
        }
      }
    }
  }
  if (page.qaErrors.length) throw new Error(`ошибки страницы атласа: ${page.qaErrors.join(' | ')}`);
  return files;
}

// Атлас: позы × облики × аксессуары (и сценки) для каждого питомца и размера окна. Возвращает список файлов.
async function atlas(browser, base, opts) {
  const files = [];
  for (const viewport of opts.viewports) {
    const plans = new Map();
    const still = await context(browser, viewport);
    try {
      await openAtlas(still.page, base);
      for (const pet of opts.pets) {
        const plan = await still.page.evaluate((id) => window.shots.plan(id), pet);
        plans.set(pet, plan);
        if (plan.missing.length) console.warn(`${pet}: набор не рисует позы ${plan.missing.join(', ')} — пропуск`);
        const poses = plan.poses.filter((pose) => !opts.pose || opts.pose.includes(pose));
        files.push(...(await shoot(still.page, opts, viewport, { pet, plan, shots: poses.map((pose) => ({ pose, scene: '' })) })));
      }
    } finally {
      await still.ctx.close();
    }
    if (!opts.scenes) continue;
    const moving = await context(browser, viewport, { reduced: false });
    try {
      await openAtlas(moving.page, base);
      for (const pet of opts.pets) {
        const plan = plans.get(pet);
        const scenes = plan.scenes.filter((scene) => !opts.pose || opts.pose.includes(scene));
        files.push(...(await shoot(moving.page, opts, viewport, { pet, plan, shots: scenes.map((scene) => ({ pose: 'calm', scene })) })));
      }
    } finally {
      await moving.ctx.close();
    }
  }
  return files;
}

// Ожидание условия страницы опросом из Node: часы страницы остановлены, поэтому waitForFunction (опрос через
// requestAnimationFrame или setTimeout страницы) здесь не годится. Опрос ограничен сроком, без пауз «на всякий случай».
async function until(page, fn, label, limit = 10_000) {
  const started = Date.now();
  while (!(await page.evaluate(fn))) {
    if (Date.now() - started > limit) throw new Error(`не дождались: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// Живой режим: mountPet на стенде, движение «Без анимации», часы остановлены, случайность задана; три состояния.
async function live(browser, base, opts) {
  const files = [];
  for (const viewport of opts.viewports) {
    const phone = viewport.width <= 860;
    for (const pet of opts.pets) {
      const { ctx, page } = await context(browser, viewport);
      try {
        // После install часы идут в реальном времени, пока их не остановить: pauseAt — дальше Date, таймеры и
        // requestAnimationFrame страницы движутся только по runFor (анимации CSS — по-прежнему в реальном времени).
        await ctx.clock.install({ time: START });
        await ctx.clock.pauseAt(new Date(START.getTime() + 60_000));
        await ctx.addInitScript(() => {
          Math.random = () => 0.5;
        });
        await page.goto(`${base}?manual`);
        await until(page, () => Boolean(window.stand), 'стенд');
        await page.evaluate(
          async ([kind, href]) => {
            const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
            const loaded = new Promise((resolve, reject) => {
              link.onload = resolve;
              link.onerror = reject;
            });
            document.head.append(link);
            await loaded;
            const [{ bunny, bunnyWeb }, { cat, dog }, { calm }] = await Promise.all([import('/pet/bunny.mjs'), import('/pet/pets.mjs'), import('/pet/behaviors.mjs')]);
            window.stand.mount({ storage: 'shots', pets: [cat, dog, bunny], behaviors: [calm], kits: [bunnyWeb] });
            const core = window.stand.pet.core;
            const chosen = core.setPet(kind);
            const prefs = core.setPreferences({ motion: 'none' });
            if (!chosen.ok || !prefs.ok) throw new Error(`setPet / setPreferences: ${JSON.stringify([chosen, prefs])}`);
          },
          [pet, `${base}pet/bunny.css`],
        );
        // Приветствие дня (0,9 с и 1,7 с) — по часам страницы; облако реплики (3,2 с) ещё на месте, дальше часы стоят.
        await page.clock.runFor(3000);
        // Конечные анимации интерфейса (открытие окна) идут в реальном времени — дождаться их конца; шрифты загружены.
        const settle = () =>
          page.evaluate(async () => {
            await Promise.all(
              document
                .getAnimations()
                .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
                .map((animation) => animation.finished.catch(() => {})),
            );
            await document.fonts.ready;
          });
        const shot = async (state) => {
          // Отложенные вызовы оболочки после действия (фокус, подсказка) — одним шагом часов, одинаковым в каждом запуске.
          await page.clock.runFor(100);
          await settle();
          const name = `live-${pet}-${state}@${tag(viewport)}.png`;
          await page.screenshot({ path: path.join(opts.out, name), animations: 'allow', caret: 'hide' });
          files.push({ pet, name, state, viewport: tag(viewport) });
        };
        await shot('closed');
        await page.locator(phone ? '.cat-face' : '#cat-dock .cat-dock-btn').click();
        await until(page, () => Boolean(document.getElementById('cat-sheet')?.open), 'уголок открыт');
        await shot('corner');
        await page.locator('[data-cat-play]').click();
        await until(page, () => document.getElementById('cat-sheet')?.dataset.view === 'play', '«Поиграть»');
        await shot('play');
        if (page.qaErrors.length) throw new Error(`${pet} ${tag(viewport)}: ошибки страницы: ${page.qaErrors.join(' | ')}`);
      } finally {
        await ctx.close();
      }
    }
  }
  return files;
}

// Контактный лист: все снимки папки по питомцам — для просмотра глазами и сравнения двух папок рядом.
function indexHtml(files) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const groups = new Map();
  for (const file of files) {
    const key = `${file.pet} · ${file.viewport}${file.state ? ' · живой' : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const sections = [...groups]
    .map(([title, list]) => `<h2>${esc(title)} — ${list.length}</h2><div class="grid">${list.map((f) => `<figure><img src="${esc(f.name)}" alt="" loading="lazy" /><figcaption>${esc(f.name)}</figcaption></figure>`).join('')}</div>`)
    .join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Снимки поз</title>
<style>body{margin:16px;font:14px/1.4 system-ui,sans-serif;background:#f6f5f1;color:#1f2328}h2{margin:24px 0 8px}.grid{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;padding:4px;background:#fff;border:1px solid #e2dfd6;border-radius:8px}img{display:block;max-width:240px;max-height:240px}figcaption{font-size:11px;color:#5b6168;max-width:240px;word-break:break-all}</style></head>
<body><h1>Снимки поз — ${files.length}</h1>${sections}</body></html>
`;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exit(2);
  }
  if (!opts) {
    console.log(USAGE);
    return;
  }
  await mkdir(opts.out, { recursive: true });
  const server = await serve();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    const files = [];
    if (opts.atlas) files.push(...(await atlas(browser, server.base, opts)));
    if (opts.live) files.push(...(await live(browser, server.base, opts)));
    await writeFile(path.join(opts.out, 'index.html'), indexHtml(files));
    const counts = Object.fromEntries(opts.pets.map((pet) => [pet, files.filter((file) => file.pet === pet).length]));
    console.log(`${files.length} снимков → ${opts.out}${Object.entries(counts).map(([pet, n]) => `\n  ${pet}: ${n}`).join('')}\n  index.html — контактный лист`);
  } finally {
    await browser?.close();
    await server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.stack ?? String(error));
    process.exit(1);
  });
}
