'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const entry = path.resolve(__dirname, '../../migrate-assets.js');
function child(args, env = {}) {
  return new Promise((resolve, reject) => {
    const process_ = spawn(process.execPath, args, { env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), ...env,
    } });
    let stdout = '', stderr = '';
    process_.stdout.on('data', data => { stdout += data; });
    process_.stderr.on('data', data => { stderr += data; });
    process_.on('error', reject);
    process_.on('close', code => resolve({ code, stdout, stderr }));
  });
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-asset-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'b.txt'), 'test-b');
  fs.writeFileSync(path.join(directory, 'a.jpg'), 'test-a');
  fs.writeFileSync(path.join(directory, '.gitkeep'), '');
  const env = {
    CMS_ASSET_SOURCE_DIRECTORY: directory, CMS_ASSET_AWS_REGION: 'us-east-1',
    CMS_ASSET_S3_BUCKET: 'test-assets', CMS_ASSET_KEY_PREFIX: '',
    CMS_ASSET_MAX_FILES: '5', CMS_ASSET_MAX_FILE_BYTES: '20', CMS_ASSET_MAX_TOTAL_BYTES: '50',
    CMS_ASSET_TIMEOUT_MS: '3000', CMS_ASSET_MAX_ATTEMPTS: '1',
  };
  return { directory, env };
}
function configured(env) { return require('../asset-settings.cjs').readAssetSettings(env); }

test('import is inert without settings or provider initialization', async () => {
  const script = `const Module=require('node:module');const old=Module._load;Module._load=function(name,...args){if(name.startsWith('@aws-sdk/')||name==='dotenv')throw Error('EAGER_PROVIDER');return old.call(this,name,...args)};require(${JSON.stringify(entry)});console.log('IMPORTED');`;
  const result = await child(['-e', script]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'IMPORTED');
});

test('missing or unknown CLI mode fails without loading credentials', async () => {
  for (const args of [[], ['--unknown'], ['--plan', '--execute']]) {
    const result = await child([entry, ...args]);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stderr).stage, 'MODE');
    assert.equal(result.stdout, '');
  }
});

for (const region of ['us-east-1', 'eu-central-1']) {
  test(`local-only CLI plan keeps original filenames in ${region}`, async t => {
    const { env } = fixture(t);
    const result = await child([entry, '--plan'], { ...env, CMS_ASSET_AWS_REGION: region });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { status: 'PLAN_READY', planned: 2, bytes: 12, uploaded: 0 });
    assert(!result.stdout.includes('a.jpg'));
    const plan = require('../../migrate-assets.js').planAssets(configured(env));
    assert.deepEqual(plan.map(item => item.key), ['a.jpg', 'b.txt']);
    assert.deepEqual(plan.map(item => item.body.toString()), ['test-a', 'test-b']);
  });
}

for (const [key, value] of [
  ['CMS_ASSET_AWS_REGION', ''], ['CMS_ASSET_S3_BUCKET', 'bad/bucket'],
  ['CMS_ASSET_KEY_PREFIX', '../'], ['CMS_ASSET_KEY_PREFIX', undefined],
  ['CMS_ASSET_MAX_FILES', '0'], ['CMS_ASSET_MAX_FILE_BYTES', '1.5'],
  ['CMS_ASSET_TIMEOUT_MS', 'Infinity'], ['CMS_ASSET_MAX_ATTEMPTS', '-1'],
  ['CMS_ASSET_S3_ENDPOINT', 'http://remote.example.test'],
  ['CMS_ASSET_S3_ENDPOINT', 'https://test-key@storage.example.test/'],
]) test(`invalid asset setting fails closed: ${key} ${value}`, t => {
  const { env } = fixture(t);
  assert.throws(() => configured({ ...env, [key]: value }));
});

for (const kind of ['directory', 'empty', 'oversized', 'count', 'total', 'missing', 'unsafe-name']) {
  test(`preflight ${kind} failure prevents every upload`, async t => {
    const { env, directory } = fixture(t);
    if (kind === 'directory') fs.mkdirSync(path.join(directory, 'nested'));
    if (kind === 'empty') fs.writeFileSync(path.join(directory, 'empty.txt'), '');
    if (kind === 'oversized') env.CMS_ASSET_MAX_FILE_BYTES = '5';
    if (kind === 'count') env.CMS_ASSET_MAX_FILES = '1';
    if (kind === 'total') env.CMS_ASSET_MAX_TOTAL_BYTES = '10';
    if (kind === 'missing') env.CMS_ASSET_SOURCE_DIRECTORY = path.join(directory, 'absent');
    if (kind === 'unsafe-name') fs.writeFileSync(path.join(directory, 'unsafe%file.txt'), 'test');
    let uploads = 0;
    await assert.rejects(() => require('../../migrate-assets.js').migrateAssets(configured(env), '--execute', {
      upload: async () => { uploads++; }, close() {},
    }));
    assert.equal(uploads, 0);
  });
}

test('a rejected upload is a truthful partial failure and closes the adapter', async t => {
  const { env } = fixture(t); let calls = 0, closed = false;
  await assert.rejects(() => require('../../migrate-assets.js').migrateAssets(configured(env), '--execute', {
    upload: async () => { if (++calls === 2) throw Error('test-private-provider-detail'); },
    close: () => { closed = true; },
  }), error => {
    assert.deepEqual(error.summary, { status: 'FAILED', planned: 2, bytes: 12, uploaded: 1, stage: 'UPLOAD' });
    assert(!error.message.includes('test-private-provider-detail')); return true;
  });
  assert.equal(closed, true);
});

test('plan never initializes provider modules', async t => {
  const { env } = fixture(t);
  const script = `const Module=require('node:module');const old=Module._load;Module._load=function(name,...args){if(name.startsWith('@aws-sdk/'))throw Error('EAGER_PROVIDER');return old.call(this,name,...args)};require(${JSON.stringify(entry)}).main(['--plan']).then(code=>process.exitCode=code);`;
  const result = await child(['-e', script], env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).uploaded, 0);
});

test('symlinked directories and an empty source fail preflight', t => {
  const { env, directory } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-asset-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(directory, 'linked'), 'junction');
  assert.throws(() => require('../../migrate-assets.js').planAssets(configured(env)));
  assert.throws(() => require('../../migrate-assets.js').planAssets(configured({ ...env,
    CMS_ASSET_SOURCE_DIRECTORY: path.join(directory, 'linked') })));
  assert.throws(() => require('../../migrate-assets.js').planAssets(configured({ ...env,
    CMS_ASSET_SOURCE_DIRECTORY: outside })));
});

test('file growth during a bounded read fails before uploading', async t => {
  const { env, directory } = fixture(t);
  const originalRead = fs.readSync; let changed = false, uploads = 0;
  t.mock.method(fs, 'readSync', (...args) => {
    const count = originalRead(...args);
    if (!changed) { changed = true; fs.appendFileSync(path.join(directory, 'a.jpg'), 'changed'); }
    return count;
  });
  await assert.rejects(() => require('../../migrate-assets.js').migrateAssets(configured(env), '--execute', {
    upload: async () => { uploads++; }, close() {},
  }));
  assert.equal(uploads, 0);
});

test('asset configuration stays documented and out of the uploader', () => {
  const source = fs.readFileSync(entry, 'utf8');
  const settings = fs.readFileSync(path.resolve(__dirname, '../asset-settings.cjs'), 'utf8');
  const example = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
  for (const name of new Set(settings.match(/CMS_ASSET_[A-Z0-9_]+/g))) {
    assert(new RegExp('^' + name + '=', 'm').test(example), name + ' must be documented');
  }
  assert(!/process\.env|https?:\/\/|mediconnect-media-assets|us-east-1|public-read|AWS_ACCESS_SECRET/.test(source));
  assert(!/-----BEGIN .*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/.test(source + settings + example));
});

for (const conflict of [false, true]) test(`real CLI uses conditional private S3 writes; conflict=${conflict}`, async t => {
  const { env } = fixture(t); const calls = [];
  const server = http.createServer((request, response) => {
    const chunks = []; request.on('data', data => chunks.push(data));
    request.on('end', () => {
      calls.push({ url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
      response.writeHead(conflict ? 412 : 200, { 'content-type': 'application/xml' });
      response.end(conflict ? '<Error><Code>PreconditionFailed</Code><Message>test-private-provider-detail</Message></Error>' : '');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const result = await child([entry, '--execute'], { ...env, CMS_ASSET_KEY_PREFIX: 'uploads/',
    CMS_ASSET_S3_ENDPOINT: endpoint, AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret',
    AWS_EC2_METADATA_DISABLED: 'true',
  });
  assert.equal(result.code, conflict ? 1 : 0, result.stderr);
  assert.equal(calls.length, conflict ? 1 : 2);
  for (const call of calls) {
    assert.equal(call.headers['if-none-match'], '*');
    assert.equal(call.headers['x-amz-acl'], undefined);
    assert(call.url.startsWith('/test-assets/uploads/'));
    assert(call.body.startsWith('test-'));
  }
  assert.equal(calls[0].headers['content-type'], 'image/jpeg');
  if (!conflict) assert.equal(calls[1].headers['content-type'], 'text/plain');
  assert(!result.stderr.includes('test-private-provider-detail'));
  assert(!result.stderr.includes('test-secret'));
  assert.equal(JSON.parse(conflict ? result.stderr : result.stdout).status, conflict ? 'FAILED' : 'COMPLETE');
});
