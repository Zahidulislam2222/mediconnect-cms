'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { readSettings } = require('../migration-settings.cjs');
const { migrateArticles, readMedia, validPublication } = require('../sync-articles.js');

function environment(root, origin = 'https://cms.example.test') {
  return {
    CMS_SYNC_STRAPI_URL: origin, CMS_SYNC_ARTICLES_PATH: '/api/articles',
    CMS_SYNC_AWS_REGION: 'us-east-1', CMS_SYNC_DYNAMODB_TABLE: 'test-knowledge',
    CMS_SYNC_S3_BUCKET: 'test-media', CMS_SYNC_MEDIA_PUBLIC_BASE_URL: 'https://media.example.test/',
    CMS_SYNC_PUBLIC_ROOT: root, CMS_SYNC_MEDIA_URL_PREFIX: '/uploads/', CMS_SYNC_OBJECT_PREFIX: 'articles/',
    CMS_SYNC_PAGE_SIZE: '2', CMS_SYNC_MAX_PAGES: '5', CMS_SYNC_HTTP_TIMEOUT_MS: '3000',
    CMS_SYNC_MAX_HTTP_BYTES: '1048576', CMS_SYNC_MAX_MEDIA_BYTES: '1024',
    CMS_SYNC_MAX_PLAN_BYTES: '1048576', CMS_SYNC_MAX_ARTICLE_BYTES: '10240', CMS_SYNC_MAX_ATTEMPTS: '1',
  };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediconnect-cms-migration-'));
  fs.mkdirSync(path.join(root, 'uploads'));
  fs.writeFileSync(path.join(root, 'uploads', 'test.jpg'), Buffer.from('test-image'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, settings: readSettings(environment(root)) };
}
function article(id = 1, extra = {}) {
  return { id, title: 'Test article', content: [], publishedAt: '2026-01-01T00:00:00.000Z', ...extra };
}
function page(rows, number = 1, total = rows.length, pageSize = 2) {
  return { data: rows, meta: { pagination: { page: number, pageSize, pageCount: Math.ceil(total / pageSize), total } } };
}
function adapters(settings, pages) {
  const calls = { pages: [], uploads: [], writes: [] };
  return { calls, fetchPage: async number => { calls.pages.push(number); return pages[number - 1]; },
    readMedia: raw => readMedia(settings, raw),
    upload: async media => { calls.uploads.push(media); },
    write: async item => { calls.writes.push(item); } };
}
function child(arguments_, env) {
  return new Promise((resolve, reject) => {
    // Deliberately do not inherit real provider credentials, profiles or NODE_OPTIONS.
    const process_ = spawn(process.execPath, arguments_, { env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), ...env,
    } });
    let stdout = '', stderr = '';
    process_.stdout.on('data', data => { stdout += data; });
    process_.stderr.on('data', data => { stderr += data; });
    process_.on('error', reject);
    process_.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('import does not load dotenv, Axios or cloud clients and needs no configuration', async () => {
  const entry = require.resolve('../sync-articles.js');
  const script = `const Module=require('node:module');const original=Module._load;Module._load=function(name,...args){if(name==='dotenv'||name==='axios'||name.startsWith('@aws-sdk/'))throw Error('Unexpected provider initialization');return original.call(this,name,...args)};require(${JSON.stringify(entry)});console.log('IMPORT_SAFE');`;
  const result = await child(['-e', script], {});
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'IMPORT_SAFE');
});

for (const region of ['us-east-1', 'eu-central-1']) {
  test(`regional settings are explicit and overrideable: ${region}`, t => {
    const { root } = fixture(t);
    const settings = readSettings({ ...environment(root), CMS_SYNC_AWS_REGION: region,
      CMS_SYNC_STRAPI_URL: 'https://other.example.test', CMS_SYNC_HTTP_TIMEOUT_MS: '1234' });
    assert.equal(settings.region, region); assert.equal(settings.timeoutMs, 1234);
    assert.equal(settings.strapiUrl, 'https://other.example.test/');
    assert(Object.isFrozen(settings));
  });
}

for (const [key, value] of [
  ['CMS_SYNC_STRAPI_URL', 'http://remote.example.test'], ['CMS_SYNC_STRAPI_URL', 'https://test-key@cms.example.test'],
  ['CMS_SYNC_STRAPI_URL', 'https://cms.example.test/?token=test-key'], ['CMS_SYNC_STRAPI_TOKEN', 'test-key\r\nInjected: value'],
  ['CMS_SYNC_PAGE_SIZE', '0'], ['CMS_SYNC_MAX_PAGES', '1.5'], ['CMS_SYNC_ARTICLES_PATH', '//outside'],
  ['CMS_SYNC_MEDIA_URL_PREFIX', '/uploads/../'], ['CMS_SYNC_OBJECT_PREFIX', '../articles/'],
  ['CMS_SYNC_MEDIA_PUBLIC_BASE_URL', 'http://media.example.test/'], ['CMS_SYNC_S3_ENDPOINT', 'http://remote.example.test'],
]) {
  test(`invalid configuration fails before I/O: ${key} ${value.replace(/[\r\n]/g, '')}`, t => {
    const { root } = fixture(t);
    assert.throws(() => readSettings({ ...environment(root), [key]: value }));
  });
}

test('all pages are processed once, v4/v5 records retain real publication metadata', async t => {
  const { settings } = fixture(t);
  const third = article(3); const { id, ...attributes } = third;
  const io = adapters(settings, [page([article(1), article(2)], 1, 3), page([{ id, attributes }], 2, 3)]);
  const result = await migrateArticles(settings, io, '--execute');
  assert.deepEqual(io.calls.pages, [1, 2]); assert.equal(result.completed, 3);
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(io.calls.writes.map(item => item.topic), ['ARTICLE#1', 'ARTICLE#2', 'ARTICLE#3']);
  for (const item of io.calls.writes) {
    assert.equal(item.publishedAt, third.publishedAt); assert.equal(item.status, 'PUBLISHED');
    assert.equal(item.author, undefined); assert.equal(item.coverImage, undefined);
  }
});

test('empty source produces an explicit empty plan without writes', async t => {
  const { settings } = fixture(t); const io = adapters(settings, [page([])]);
  assert.equal((await migrateArticles(settings, io, '--plan')).planned, 0);
  assert.equal(io.calls.writes.length, 0);
});

for (const name of ['wrong page', 'missing page', 'inconsistent total', 'duplicate id', 'truncated page', 'page limit']) {
  test(`pagination failure blocks every cloud write: ${name}`, async t => {
    const { settings } = fixture(t);
    const pages = [page([article(1), article(2)], 1, 3), page([article(3)], 2, 3)];
    if (name === 'wrong page') pages[1].meta.pagination.page = 1;
    if (name === 'missing page') pages[1] = undefined;
    if (name === 'inconsistent total') pages[1].meta.pagination.total = 4;
    if (name === 'duplicate id') pages[1].data = [article(1)];
    if (name === 'truncated page') pages[0].data.pop();
    if (name === 'page limit') pages[0].meta.pagination.pageCount = 999;
    const io = adapters(settings, pages);
    await assert.rejects(migrateArticles(settings, io, '--execute'));
    assert.equal(io.calls.writes.length, 0); assert.equal(io.calls.uploads.length, 0);
  });
}

test('explicit draft records are skipped because public consumers do not filter status', async t => {
  const { settings } = fixture(t); const io = adapters(settings, [page([article(1, { publishedAt: null })])]);
  const result = await migrateArticles(settings, io, '--execute');
  assert.equal(result.skippedDrafts, 1); assert.equal(result.completed, 0); assert.equal(io.calls.writes.length, 0);
});
for (const value of [undefined, '', 'not-a-date', '2026-02-30T00:00:00.000Z', 123]) {
  test(`missing/invalid publication cannot become published: ${String(value)}`, async t => {
    const { settings } = fixture(t); const io = adapters(settings, [page([article(1, { publishedAt: value })])]);
    await assert.rejects(migrateArticles(settings, io, '--execute'));
    assert.equal(io.calls.writes.length, 0);
  });
}
test('valid Strapi timestamps with and without fractions retain validity', () => {
  assert(validPublication('2026-01-01T00:00:00Z')); assert(validPublication('2026-01-01T00:00:00.12Z'));
});

for (const raw of ['../../private.txt', '/uploads/../../private.txt', '/uploads/%2e%2e/private.txt',
  '/uploads/%252e%252e/private.txt', 'https://outside.example.test/image.jpg', '//outside/image.jpg',
  '/uploads/..\\private.txt', '/uploads/test.jpg?token=test-key', '/uploads/test.jpg%00', '/uploads/missing.jpg']) {
  test(`unsafe/missing media fails before writes: ${raw}`, async t => {
    const { settings } = fixture(t); const io = adapters(settings, [page([article(1, { coverImage: [{ url: raw }] })])]);
    await assert.rejects(migrateArticles(settings, io, '--execute'));
    assert.equal(io.calls.uploads.length, 0); assert.equal(io.calls.writes.length, 0);
  });
}
test('directory symlink escape is rejected', t => {
  const { settings, root } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mediconnect-cms-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'test.jpg'), 'test-outside');
  fs.symlinkSync(outside, path.join(root, 'uploads', 'linked'), 'junction');
  assert.throws(() => readMedia(settings, '/uploads/linked/test.jpg'));
});
test('directories and oversized files are not uploaded', t => {
  const { settings, root } = fixture(t);
  fs.mkdirSync(path.join(root, 'uploads', 'directory.jpg'));
  fs.writeFileSync(path.join(root, 'uploads', 'large.jpg'), Buffer.alloc(settings.maxMediaBytes + 1));
  assert.throws(() => readMedia(settings, '/uploads/directory.jpg'));
  assert.throws(() => readMedia(settings, '/uploads/large.jpg'));
});
test('media key is derived from contents; source filename cannot collide or choose an object key', async t => {
  const { settings } = fixture(t);
  const io = adapters(settings, [page([article(1, { coverImage: { data: [{ attributes: {
    url: '/uploads/test.jpg', name: '../../not-an-object-key', ext: '.exe',
  } }] } })])]);
  const result = await migrateArticles(settings, io, '--execute');
  assert.equal(result.uploaded, 1); assert.equal(result.completed, 1);
  assert.match(io.calls.uploads[0].key, /^articles\/[a-f0-9]{64}\.jpg$/);
  assert.equal(io.calls.writes[0].coverImage, 'https://media.example.test/' + io.calls.uploads[0].key);
});
test('plan validates media but makes no cloud writes', async t => {
  const { settings } = fixture(t);
  const io = adapters(settings, [page([article(1, { coverImage: [{ url: '/uploads/test.jpg' }] })])]);
  assert.equal((await migrateArticles(settings, io, '--plan')).status, 'PLAN_READY');
  assert.equal(io.calls.uploads.length, 0); assert.equal(io.calls.writes.length, 0);
});
test('configured plan and item limits reject before any cloud mutation', async t => {
  const { settings } = fixture(t);
  for (const limits of [{ maxPlanBytes: 1 }, { maxArticleBytes: 1 }]) {
    const bounded = { ...settings, ...limits };
    const io = adapters(bounded, [page([article()])]);
    await assert.rejects(migrateArticles(bounded, io, '--execute'));
    assert.equal(io.calls.writes.length, 0); assert.equal(io.calls.uploads.length, 0);
  }
});
test('environment ownership, provider values and example documentation remain centralized', () => {
  const source = fs.readFileSync(require.resolve('../sync-articles.js'), 'utf8');
  const settings = fs.readFileSync(require.resolve('../migration-settings.cjs'), 'utf8');
  const example = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
  assert(!/process\s*\.\s*env/.test(source));
  assert(!/https?:\/\/|\b(?:us-east-1|eu-central-1)\b/.test(source));
  assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}/.test(source));
  const names = new Set(settings.match(/CMS_SYNC_[A-Z0-9_]+/g));
  for (const name of names) assert(new RegExp('^' + name + '=', 'm').test(example), name + ' missing documentation');
  for (const [, name] of example.matchAll(/^(CMS_SYNC_[A-Z0-9_]+)=/gm)) assert(names.has(name), name + ' lacks settings owner');
});
for (const stage of ['SOURCE_HTTP', 'MEDIA_UPLOAD', 'DATABASE_WRITE']) {
  test(`${stage} rejects with truthful completed count`, async t => {
    const { settings } = fixture(t);
    const io = adapters(settings, [page([article(1), article(2, { coverImage: [{ url: '/uploads/test.jpg' }] })])]);
    if (stage === 'SOURCE_HTTP') io.fetchPage = async () => { throw new Error('test-provider-error'); };
    if (stage === 'MEDIA_UPLOAD') io.upload = async () => { throw new Error('test-provider-error'); };
    if (stage === 'DATABASE_WRITE') io.write = async item => {
      if (item.topic === 'ARTICLE#2') throw new Error('test-provider-error');
      io.calls.writes.push(item);
    };
    await assert.rejects(migrateArticles(settings, io, '--execute'), error => {
      assert.equal(error.stage, stage); assert.equal(error.summary.status, 'FAILED');
      assert.equal(error.summary.completed, stage === 'SOURCE_HTTP' ? 0 : 1); return true;
    });
  });
}

test('actual CLI plan uses only the loopback fixture and execute reports actual transport failures', async t => {
  const { root } = fixture(t); const requests = [];
  let failure = '';
  let expectedPath = '/api/articles';
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const signingRegion = /Credential=[^/]+\/\d+\/([^/]+)/.exec(request.headers.authorization || '')?.[1];
      requests.push({ method: request.method, url: request.url, signingRegion });
      if (request.method === 'GET') {
        if (failure === 'redirect') {
          response.writeHead(302, { Location: '/redirected' }); response.end(); return;
        }
        const url = new URL(request.url, 'http://127.0.0.1');
        assert.equal(url.pathname, expectedPath); assert.equal(url.searchParams.get('status'), 'published');
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(page([article(1, { coverImage: [{ url: '/uploads/test.jpg' }] })])));
      } else if (request.method === 'PUT') {
        assert.match(request.url, /^\/test-media\/articles\/[a-f0-9]{64}\.jpg/);
        assert.equal(request.headers['x-amz-acl'], undefined);
        assert.equal(request.headers['content-type'], 'image/jpeg');
        assert.equal(Buffer.concat(chunks).toString(), 'test-image');
        response.statusCode = failure === 'media' ? 500 : 200;
        response.setHeader('ETag', '"test-etag"'); response.end();
      }
      else {
        const item = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(item.TableName, 'test-knowledge');
        assert.equal(item.Item.topic.S, 'ARTICLE#1');
        assert.equal(item.Item.status.S, 'PUBLISHED');
        response.statusCode = failure === 'database' ? 500 : 200;
        response.setHeader('Content-Type', 'application/x-amz-json-1.0');
        response.end(JSON.stringify(failure === 'database' ? { __type: 'InternalServerError', message: 'test-private-marker' } : {}));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...environment(root, origin), CMS_SYNC_S3_ENDPOINT: origin, CMS_SYNC_DYNAMODB_ENDPOINT: origin,
    AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-key', AWS_EC2_METADATA_DISABLED: 'true' };
  const entry = require.resolve('../sync-articles.js');
  const absent = await child([entry], env); assert.equal(absent.code, 1); assert.equal(requests.length, 0);
  const planned = await child([entry, '--plan'], env);
  assert.equal(planned.code, 0, planned.stderr); assert.equal(JSON.parse(planned.stdout).status, 'PLAN_READY');
  assert.deepEqual(requests.map(request => request.method), ['GET']); requests.length = 0;
  expectedPath = '/mounted/custom/articles';
  const mounted = await child([entry, '--plan'], { ...env,
    CMS_SYNC_STRAPI_URL: origin + '/mounted', CMS_SYNC_ARTICLES_PATH: '/custom/articles' });
  assert.equal(mounted.code, 0, mounted.stderr); assert.equal(JSON.parse(mounted.stdout).status, 'PLAN_READY');
  expectedPath = '/api/articles';
  for (const region of ['us-east-1', 'eu-central-1']) {
    requests.length = 0;
    const executed = await child([entry, '--execute'], { ...env, CMS_SYNC_AWS_REGION: region });
    assert.equal(executed.code, 0, executed.stderr); assert.equal(JSON.parse(executed.stdout).completed, 1);
    assert.deepEqual(requests.map(request => request.method), ['GET', 'PUT', 'POST']);
    assert.deepEqual(requests.slice(1).map(request => request.signingRegion), [region, region]);
  }
  for (const [kind, stage, methods] of [
    ['database', 'DATABASE_WRITE', ['GET', 'PUT', 'POST']],
    ['media', 'MEDIA_UPLOAD', ['GET', 'PUT']],
    ['redirect', 'SOURCE_HTTP', ['GET']],
  ]) {
    failure = kind; requests.length = 0;
    const failed = await child([entry, '--execute'], env);
    assert.equal(failed.code, 1); assert.equal(failed.stdout, '');
    assert.equal(JSON.parse(failed.stderr).stage, stage);
    assert(!failed.stderr.includes('test-private-marker'));
    assert.deepEqual(requests.map(request => request.method), methods);
  }
});
