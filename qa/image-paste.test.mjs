import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const source = readFileSync(new URL('../app/' + name + '.ts', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: 9, module: 1}}).outputText,
    {exports, require: () => load('image-files'), Request, Response, Headers, URL, Uint8Array, crypto});
  return modules[name] = exports;
}
const files = load('image-files'), api = load('data/images');
const id = '94b9e240-e976-4f1b-9c47-cce6763c3f22';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=', 'base64');
function bucket() {
  const rows = new Map(); let puts = 0;
  return {rows, count: () => puts,
    async head(key) { return rows.get(key) || null; },
    async put(key, bytes, options) {
      assert.equal(options.onlyIf.etagDoesNotMatch, '*');
      if (rows.has(key)) return null;
      puts++;
      const object = {...options, size: bytes.length, httpEtag: '"qa"', bytes: Uint8Array.from(bytes)};
      rows.set(key, object); return object;
    },
    async get(key) { const object = rows.get(key); return object ? {...object, body: new Response(object.bytes).body} : null; },
  };
}
function request({user = 'owner', type = 'image/png', bytes = png, origin = 'https://site.test', uploadId = id, length} = {}) {
  const headers = {'content-type': type, 'x-image-id': uploadId, origin};
  if (user) headers['oai-authenticated-user-id'] = user;
  if (length) headers['content-length'] = String(length);
  return new Request('https://site.test/api/images', {method: 'POST', headers, body: bytes});
}
test('clipboard files take precedence without duplicating items/files', () => {
  const file = {type: 'image/png', name: 'screenshot.png'};
  assert.deepEqual(Array.from(files.clipboardImages({items: [{kind: 'file', type: file.type, getAsFile: () => file}], files: [file]})), [file]);
  assert.deepEqual(Array.from(files.clipboardImages({items: [], files: [file, {type: 'text/plain'}]})), [file]);
  assert.equal(files.clipboardImages({items: [{kind: 'string', type: 'text/plain'}], files: []}).length, 0);
});
test('only native image UUID routes are accepted', () => {
  assert.equal(files.nativeImagePath('/api/images/' + id), true);
  for (const path of ['/api/images/../secret', '/api/images/' + id + '?x=1', '//evil.test/' + id, '/api/images/not-id'])
    assert.equal(files.nativeImagePath(path), false);
});
test('upload is idempotent and read is owner-scoped with private cache', async () => {
  const store = bucket();
  const response = await api.uploadImage(request(), store);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.path, '/api/images/' + id);
  assert.equal((await api.uploadImage(request(), store)).status, 200);
  assert.equal(store.count(), 1);
  const read = await api.readImage(new Request('https://site.test/api/images/' + id, {headers: {'oai-authenticated-user-id': 'owner'}}), store, id);
  assert.equal(read.status, 200); assert.equal(read.headers.get('content-type'), 'image/png');
  assert.match(read.headers.get('cache-control'), /^private/);
  assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);
  assert.equal((await api.readImage(new Request('https://site.test/api/images/' + id, {headers: {'oai-authenticated-user-id': 'another-user'}}), store, id)).status, 404);
  assert.equal((await api.readImage(new Request('https://site.test/api/images/' + id), store, id)).status, 401);
});
test('no overwrite under a reused upload ID', async () => {
  const store = bucket(); await api.uploadImage(request(), store);
  const changed = Buffer.concat([png, Buffer.from('different')]);
  assert.equal((await api.uploadImage(request({bytes: changed}), store)).status, 409);
  assert.equal(store.count(), 1);
});
test('reject unsigned, cross-origin, SVG, spoofed and oversized uploads', async () => {
  const store = bucket();
  for (const [options, status] of [
    [{user: ''}, 401], [{origin: 'https://evil.test'}, 403],
    [{type: 'image/svg+xml'}, 415], [{bytes: Buffer.from('<html>not an image</html>')}, 415],
    [{type: 'image/jpeg'}, 415], [{length: files.MAX_IMAGE_BYTES + 1}, 413],
    [{bytes: Buffer.alloc(files.MAX_IMAGE_BYTES + 1)}, 413],
    [{bytes: Buffer.alloc(0)}, 400], [{uploadId: '../secret'}, 400],
  ]) assert.equal((await api.uploadImage(request(options), store)).status, status, JSON.stringify(options).slice(0, 100));
  assert.equal(store.count(), 0);
});
test('same ID concurrent retries store one immutable object', async () => {
  const store = bucket();
  const responses = await Promise.all([api.uploadImage(request(), store), api.uploadImage(request(), store)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(store.count(), 1);
});
test('PNG JPEG GIF WebP magic detection excludes active content', () => {
  for (const [bytes, type] of [[png, 'image/png'], [Buffer.from([255,216,255,224]), 'image/jpeg'], [Buffer.from('GIF89a'), 'image/gif'], [Buffer.from('RIFF0000WEBP'), 'image/webp']])
    assert.equal(files.rasterImageType(bytes), type);
  assert.equal(files.rasterImageType(Buffer.from('<svg/>')), null);
});
