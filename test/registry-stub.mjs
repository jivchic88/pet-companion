// Локальные заглушки реестра npm и API GitHub для проверок цепочки выпуска (PL12; test/release.test.mjs): один HTTP-сервер
// на 127.0.0.1, всё в памяти. Реестр — `${url}/npm/`: документ пакета, архив версии, публикация `npm publish` (PUT с
// архивом в _attachments). GitHub — `${url}/gh`: выпуск по тегу (описание, файл с digest), ссылка тега → объект тега →
// коммит; файлы выпусков — `${url}/download/…`. Служебный POST `${url}/gh/__release` создаёт выпуск (его зовёт поддельный gh
// из test/fakes/gh.mjs). tamper — подмена байтов архива в реестре (с прежним или пересчитанным integrity) для отрицательных
// проверок. requests — журнал «МЕТОД путь».
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const sri = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const sha = (algo, bytes) => createHash(algo).update(bytes).digest('hex');

export async function startStub() {
  const versions = new Map(); // name → Map(version → { bytes, dist })
  const releases = new Map(); // `${slug}#${tag}` → { body, assets: [{ name, bytes }] }
  const tags = new Map(); // `${slug}#${tag}` → { object, commit }
  const requests = [];
  const puts = [];
  let url = '';

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const read = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const packument = (name) => {
    const map = versions.get(name);
    if (!map?.size) return null;
    const list = [...map.keys()];
    return { _id: name, name, 'dist-tags': { latest: list.at(-1) }, versions: Object.fromEntries(list.map((version) => [version, { name, version, dist: map.get(version).dist }])) };
  };

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://stub');
    requests.push(`${req.method} ${pathname}`);
    let match;
    if ((match = /^\/npm\/((?:@[^/]+%2[fF])?[^/]+)\/-\/(.+\.tgz)$/.exec(pathname)) && req.method === 'GET') {
      const name = decodeURIComponent(match[1]);
      const found = [...(versions.get(name)?.values() ?? [])].find((item) => item.file === match[2]);
      return found ? send(res, 200, found.bytes, 'application/octet-stream') : send(res, 404, { error: 'not found' });
    }
    if ((match = /^\/npm\/([^/]+)$/.exec(pathname))) {
      const name = decodeURIComponent(match[1]);
      if (req.method === 'GET') {
        const doc = packument(name);
        return doc ? send(res, 200, doc) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse((await read(req)).toString('utf8'));
        const [version, manifest] = Object.entries(body.versions)[0];
        if (versions.get(name)?.has(version)) return send(res, 403, { error: `cannot publish over previously published version ${version}` });
        const [file, attachment] = Object.entries(body._attachments)[0];
        const bytes = Buffer.from(attachment.data, 'base64');
        puts.push({ name, version, sha256: sha('sha256', bytes), integrity: sri(bytes), manifestIntegrity: manifest.dist?.integrity, scripts: manifest.scripts ?? {} });
        stub.add(name, version, bytes);
        return send(res, 201, { ok: true });
      }
    }
    if ((match = /^\/gh\/repos\/([^/]+\/[^/]+)\/releases\/tags\/(.+)$/.exec(pathname))) {
      const slug = match[1];
      const tag = decodeURIComponent(match[2]);
      const release = releases.get(`${slug}#${tag}`);
      if (!release) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, {
        tag_name: tag,
        html_url: `${url}/${slug}/releases/${tag}`,
        body: release.body,
        assets: release.assets.map((asset) => ({ name: asset.name, digest: asset.digest === undefined ? `sha256:${sha('sha256', asset.bytes)}` : asset.digest, browser_download_url: `${url}/download/${slug}/${tag}/${asset.name}` })),
      });
    }
    if ((match = /^\/download\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/.exec(pathname))) {
      const asset = releases.get(`${match[1]}#${match[2]}`)?.assets.find((item) => item.name === match[3]);
      return asset ? send(res, 200, asset.bytes, 'application/octet-stream') : send(res, 404, { message: 'Not Found' });
    }
    if ((match = /^\/gh\/repos\/([^/]+\/[^/]+)\/git\/ref\/tags\/(.+)$/.exec(pathname))) {
      const tag = tags.get(`${match[1]}#${decodeURIComponent(match[2])}`);
      return tag ? send(res, 200, { object: { type: 'tag', sha: tag.object } }) : send(res, 404, { message: 'Not Found' });
    }
    if ((match = /^\/gh\/repos\/([^/]+\/[^/]+)\/git\/tags\/([0-9a-f]+)$/.exec(pathname))) {
      const tag = [...tags.entries()].find(([key, value]) => key.startsWith(`${match[1]}#`) && value.object === match[2])?.[1];
      return tag ? send(res, 200, { object: { type: 'commit', sha: tag.commit } }) : send(res, 404, { message: 'Not Found' });
    }
    if (pathname === '/gh/__release' && req.method === 'POST') {
      const { slug, tag, body, name, data } = JSON.parse((await read(req)).toString('utf8'));
      stub.release(slug, tag, { body, assets: [{ name, bytes: Buffer.from(data, 'base64') }] });
      return send(res, 201, { ok: true });
    }
    return send(res, 404, { error: `stub: ${req.method} ${pathname}` });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  const stub = {
    url,
    registry: `${url}/npm/`,
    api: `${url}/gh`,
    requests,
    puts,
    // Версия в реестре; dist — как у npm (integrity, shasum, tarball этого сервера).
    add(name, version, bytes, { integrity } = {}) {
      const file = `${name}-${version}.tgz`;
      if (!versions.has(name)) versions.set(name, new Map());
      versions.get(name).set(version, { file, bytes, dist: { integrity: integrity ?? sri(bytes), shasum: sha('sha1', bytes), tarball: `${url}/npm/${name}/-/${file}` } });
    },
    // Подмена байтов уже добавленной версии: keepIntegrity — реестр называет прежний integrity (повреждение по дороге),
    // иначе пересчитанный (подменён и документ реестра).
    tamper(name, version, bytes, { keepIntegrity = false } = {}) {
      const entry = versions.get(name).get(version);
      entry.bytes = bytes;
      if (!keepIntegrity) entry.dist = { ...entry.dist, integrity: sri(bytes), shasum: sha('sha1', bytes) };
    },
    release(slug, tag, release) {
      releases.set(`${slug}#${tag}`, release);
    },
    tag(slug, tag, { object, commit }) {
      tags.set(`${slug}#${tag}`, { object, commit });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
  return stub;
}
