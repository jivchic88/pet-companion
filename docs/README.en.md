# pet-companion — a pet for your website (English quick guide)

A calm cat or dog that lives next to a web page and reacts to the site's confirmed activity: a learning app, a habit tracker, a to-do list — anything where the user finishes something and the site confirms it. Plain browser ES modules + CSS, inline SVG art, no runtime dependencies, no network, no build step. React and React Native entries are included.

This page is a short English summary. The full reference (every option, event, CSS class and storage detail) is the Russian [README.md](../README.md). **The pet's own interface texts are in Russian** (the corner, phrases, buttons); other languages are not supported yet. Live demo: <https://jivchic88.github.io/pet-companion/>. License — [MIT](../LICENSE).

## What you get

- **Web (`pet-companion`, `pet-companion/web`)** — `mountPet` puts the pet into your header and a floating corner; `mountPetIn` renders it inside any container you own. Ready.
- **React (`pet-companion/react`)** — `<PetCompanion>` and `usePetState`, works with server rendering and hydration (React 18.3 / 19). Ready.
- **Character mode (`pet-companion/character`, `/character-web`, `/character-react`)** — since 0.3.0: only a character with its art and reactions to your events, without the room, feeding, toys or learning stages. Bring your own character definition and SVG kit (a robot, a mascot). Ready.
- **Core without UI (`pet-companion/core`, `/pets`, `/behaviors`)** — the state machine alone: commands, snapshot, subscription, storage adapters. Runs in Node.
- **React Native (`pet-companion/native`, `/native-sqlite`)** — `PetView`, `PetProvider`, `PetCorner`, `PetPlay`, `PetRoom` on `react-native-svg`, storage on `expo-sqlite`. **Preliminary:** checked in Node, iOS Simulator and an Android emulator, not on real phones.

The pet never decides what counts as an activity. Your site keeps the score ("marks") and tells the pet when something was saved; the pet turns that into stages (0, 3, 9, 18, 30 marks), the treat of the day, celebrations and small scenes. Scores and grades are never passed to the pet.

## Install

Three ways, the same files of the same version:

- **npm:** `npm install pet-companion` (bundler, or `node_modules` served by your server).
- **Release archive** for a site without npm: `pet-companion-<version>.tgz` from the GitHub Releases page, or `npm pack pet-companion@<version>` — the same archive that npm publishes.
- **Copy the folder** `node_modules/pet-companion/pet/` to your site as is (for example `/vendor/pet/`). Never edit copied files; update by replacing the folder.

## Quick start (no bundler)

1. Copy the `pet/` folder to your site. Modules import each other by relative paths, so any location works.
2. Add the stylesheets and call `mountPet` once the elements for the pet exist (a `<script type="module">` at the end of `<body>` is enough).
3. Tell the pet about confirmed activities with `pet.notify('saved', …)`.

Open the page over http(s), not `file://` — browsers do not load ES modules from disk.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My site</title>
    <link rel="stylesheet" href="./pet/pet-base.css" />
    <link rel="stylesheet" href="./pet/pet.css" />
    <link rel="stylesheet" href="./pet/dog.css" />
  </head>
  <body>
    <header id="head" style="position: relative"><span id="title">My site</span></header>
    <main><button id="done" type="button">Lesson done</button></main>
    <script type="module">
      import { mountPet } from './pet/pet.mjs';

      let marks = 0; // marks for activities — your site counts them
      let today = 0; // marks earned today
      const head = document.getElementById('head');
      const pet = mountPet({
        storage: 'mysite', // namespace for localStorage / IndexedDB keys
        places: {
          logo: (el) => head.append(el), // desktop: in the header (required)
          top: (el) => head.prepend(el), // phone: in the header (required)
          float: (el) => document.body.append(el), // desktop: bottom-right corner (optional)
        },
        progress: () => ({ marks, today, limit: 3 }),
      });
      if (!pet.mounted) console.info('Pet not mounted — the reason is logged above');

      // An activity was saved and counted: update your score first, then notify.
      document.getElementById('done').addEventListener('click', () => {
        marks += 1;
        today += 1;
        pet.notify('saved', { key: `lesson-${marks}`, counted: true, first: today === 1 });
      });
    </script>
  </body>
</html>
```

`mountPet` never throws: on refusal it returns an unmounted instance (`pet.mounted === false`) and explains why in the console. Full working file: [example.html](../example.html) (Russian labels).

## With a bundler (Vite, webpack, esbuild…)

```js
import { mountPet, localDay } from 'pet-companion';
import 'pet-companion/pet-base.css'; // only if your site has no button classes of its own
import 'pet-companion/pet.css';
import 'pet-companion/dog.css';
```

Styles are declared as `sideEffects`, so bundlers keep them. Only the public entries listed in `package.json` `exports` are supported; deep paths inside `pet/` are not. TypeScript types ship with the package (`pet/pet.d.mts` and one `.d.mts` per entry).

Without a bundler but with `node_modules` served by the server — an import map:

```html
<script type="importmap">
  { "imports": { "pet-companion": "./node_modules/pet-companion/pet/pet.mjs" } }
</script>
```

## What your site passes, and when

| Call | When |
| --- | --- |
| `progress()` → `{ marks, today, limit }` | asked by the pet whenever it needs the score: total marks, marks earned today (local date), the daily limit used only for the caption |
| `pet.notify('saved', { key, counted, hard, first })` | after your site saved and counted an activity: `key` — stable id (the same key never celebrates twice), `counted` — it earned a mark, `hard` — a difficult one (support instead of joy), `first` — first activity of the day (hints at the bowl). `detail = null` — just re-read the numbers |
| `pet.notify('failed')` | saving failed: neutral waiting, no reward |
| `pet.update()` | numbers or the next step changed without an event (sync from another device) |
| `pet.update({ focus, timer, dictation, dialog })` | page state: the user is on an activity screen, a timer, dictation or an important dialog is running — the pet stays quiet |
| `pet.open('corner' \| 'play')`, `pet.close()`, `pet.destroy()` | open the corner or the play scene, close it, unmount completely |

Options worth knowing: `storage` (namespace), `places` (`logo` and `top` are required; `sidebar`, `float`, `bar`, `restore` optional), `step()` (your "next step" card inside the corner), `classes` (use your own button classes), `pets` / `behaviors` / `kits` (your own pets since 0.2.0), `texts` (site-specific captions). Everything is described in the Russian README, section «Интерфейс».

## React

```jsx
import { useState } from 'react';
import { PetCompanion, usePetState } from 'pet-companion/react';

export function Corner({ progress }) {
  const [core, setCore] = useState(null);
  const pet = usePetState(core);
  return (
    <>
      <PetCompanion namespace="mysite" className="pet" progress={progress} onCore={setCore} />
      {pet ? <p>{pet.name.display}: {pet.treat === 'ready' ? 'treat time' : 'nearby'}</p> : <p>The pet appears after the page loads.</p>}
    </>
  );
}
```

Server rendering and hydration are safe: the container is empty on the server, the pet mounts in an effect. Full example with SSR — `examples/react/`.

## Character mode (since 0.3.0)

For a product that needs only a character with reactions — no room, feeding or stages:

```js
import { mountCharacterIn } from 'pet-companion/character-web';
import { robot } from './robot.mjs'; // defineCharacter(...) from 'pet-companion/character'
import { robotWeb } from './robot-web.mjs'; // { character, poses, art({ id }) → '<svg …>', styles }

const view = mountCharacterIn(document.getElementById('hero'), { character: robot, kit: robotWeb, name: 'Beep' });
view.core?.react('done', { key: `task-${taskId}`, text: 'Task 3 — done!' });
```

React: `<Character>` and `useCharacterState` from `pet-companion/character-react`. The core (`createCharacter`) also runs in Node without a DOM.

## React Native (preliminary)

`npm install pet-companion react-native-svg expo-sqlite`. The core comes from `pet-companion/core`, storage from `pet-companion/native-sqlite` (`createSqliteStorage`, `createSqliteScenes`), the screen parts from `pet-companion/native` (`PetView`, `PetProvider`, `PetCorner`, `PetPlay`, `PetRoom`, `catNative`, `dogNative`, `useNativeLifecycle`, `usePetState`). A complete Expo SDK 58 app lives in `examples/expo/`. Verified in the iOS Simulator with real touch input and in an Android emulator; real devices are not covered yet.

## Files for a site without a bundler

`pet-companion/manifest.json` lists, for every entry, the exact files the server must serve (`module`, `files`, `styles`, `peers`). Copy only those files, keep the folder structure, and the page imports the entry by path. A ready copy script is in the Russian README, section «Файлы пакета без сборщика».

## Storage and privacy

Everything is stored in the browser under your `storage` namespace: `localStorage` keys such as `<storage>:cat:v1` and an IndexedDB database `<storage>:scene`. No network requests, no cookies, no tracking. Stored formats are versioned and read by newer versions; see «Хранение» and «Версии и обновление» in the Russian README.

## Versions

Current version is in `package.json`; history — [CHANGELOG.md](../CHANGELOG.md). Every release is published to npm and GitHub Releases from the same tagged commit; archive fingerprints and the release chain are in [docs/RELEASES.md](RELEASES.md). Semantic versioning: while the version is `0.x`, patch releases bring fixes and compatible additions, minor releases may change behaviour (noted in the changelog); `1.0.0` comes once the interface is declared stable.

## More

- [README.md](../README.md) — full reference (Russian).
- [docs/KIT.md](KIT.md) — practical kit: compatibility matrix, API, quick starts, extension, diagnostics, update and rollback (Russian).
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — architecture and the core contract (Russian).
- [CONTRIBUTING.md](../CONTRIBUTING.md) — repository layout, checks (`npm test`, `npm run test:browser`, `npm run test:package`, `npm run test:consumers`), release process (Russian).
- [examples/](../examples/) — container and import-map pages, core in Node, commands, CSP, Vite, React with SSR, manifest copy, character mode, Expo, a third-party pet extension.
