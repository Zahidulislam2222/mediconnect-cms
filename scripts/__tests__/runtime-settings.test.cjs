const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { Readable } = require('node:stream');
const ts = require('typescript');
const { loadRuntimeSettings } = require('../../local-tests/runtime-build/src/config/runtime-settings.js');
const output = '../../local-tests/runtime-build/config/';
const defaults = require('../../src/config/runtime-defaults.json');
const settings = (values = {}, root = process.cwd()) => loadRuntimeSettings(k => values[k], root);
const fake = {
  APP_KEYS: 'test-key-one,test-key-two', ADMIN_JWT_SECRET: 'test-key',
  API_TOKEN_SALT: 'test-key', TRANSFER_TOKEN_SALT: 'test-key', ENCRYPTION_KEY: 'test-key',
  JWT_SECRET: 'test-key', CMS_UPLOAD_PROVIDER: 'aws-s3', AWS_REGION: 'us-east-1', AWS_BUCKET: 'synthetic-bucket',
};

test('new local-media installs do not read or require AWS configuration', () => {
  const values = { ...fake, CMS_UPLOAD_PROVIDER: undefined };
  const env = name => {
    assert.ok(!name.startsWith('AWS_'), `Local media unexpectedly reads ${name}`);
    return values[name];
  };
  assert.equal(loadRuntimeSettings(env).upload.provider, 'local');
  const config = require(output + 'plugins.js').default({ env }).upload.config;
  assert.equal(config.provider, 'local');
  assert.equal(config.providerOptions?.s3Options, undefined);
});

test('local media rejects private visibility and unknown providers', () => {
  assert.throws(() => settings({ ...fake, CMS_UPLOAD_PROVIDER: 'local', CMS_UPLOAD_VISIBILITY: 'private' }));
  assert.throws(() => settings({ ...fake, CMS_UPLOAD_PROVIDER: 'unknown-provider' }));
});

test('installed local provider persists buffer and streamed media across provider reloads', async () => {
  const privateTests = path.join(__dirname, '../../local-tests');
  fs.mkdirSync(privateTests, { recursive: true });
  const root = fs.mkdtempSync(path.join(privateTests, 'local-media-'));
  fs.mkdirSync(path.join(root, 'uploads'));
  const previous = global.strapi;
  global.strapi = { dirs: { static: { public: root } } };
  try {
    const values = { ...fake, CMS_UPLOAD_PROVIDER: 'local' };
    const config = require(output + 'plugins.js').default({ env: name => values[name] }).upload.config;
    const installed = require('@strapi/provider-upload-local');
    assert.equal(config.provider, 'local');
    const provider = installed.init(config.providerOptions);
    const content = Buffer.from('synthetic public editorial media');
    const buffered = { hash: 'synthetic-buffer', ext: '.txt', buffer: content };
    const streamed = { hash: 'synthetic-stream', ext: '.txt', stream: Readable.from([content]) };
    await provider.upload(buffered);
    await provider.uploadStream(streamed);
    for (const file of [buffered, streamed]) {
      assert.equal(file.url, `/uploads/${file.hash}.txt`);
      assert.deepEqual(fs.readFileSync(path.join(root, file.url)), content);
    }
    const restarted = installed.init(config.providerOptions);
    assert.deepEqual(fs.readFileSync(path.join(root, streamed.url)), content);
    await restarted.delete(buffered);
    assert.equal(fs.existsSync(path.join(root, buffered.url)), false);
    assert.deepEqual(fs.readFileSync(path.join(root, streamed.url)), content);
  } finally {
    global.strapi = previous;
  }
});

test('default SQLite path is preserved; overrides have one settings owner', () => {
  const value = settings(fake);
  assert.equal(value.databaseFilename, path.resolve(process.cwd(), '.tmp/data.db'));
  assert.equal(value.port, defaults.port);
  const alternate = settings({ ...fake, PORT: '43210', DATABASE_FILENAME: './isolated/test.db', CMS_REST_DEFAULT_LIMIT: '3', CMS_REST_MAX_LIMIT: '8' });
  assert.equal(alternate.port, 43210);
  assert.equal(alternate.databaseFilename, path.resolve('isolated/test.db'));
  assert.equal(alternate.restDefaultLimit, 3);
  assert.equal(alternate.restMaxLimit, 8);
});

test('numeric flags and secrets reject invalid values without exposing them', () => {
  for (const patch of [{ PORT: '0' }, { PORT: '65536' }, { CMS_UPLOAD_TIMEOUT_MS: 'NaN' }, { FLAG_NPS: 'maybe' }, { CMS_REST_DEFAULT_LIMIT: '101' }, { APP_KEYS: '' }, { ADMIN_JWT_SECRET: '' }]) {
    assert.throws(() => settings({ ...fake, ...patch }));
  }
  assert.throws(() => settings({ ...fake, CMS_UPLOAD_ENDPOINT: 'https://test-key:private@storage.test' }), e => !e.message.includes('private'));
});

test('standard chain and explicit legacy credentials remain distinct', () => {
  assert.equal(settings(fake).upload.credentials, undefined);
  assert.equal(settings({ ...fake, AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_ACCESS_SECRET: '', AWS_SESSION_TOKEN: '' }).upload.credentials, undefined);
  assert.equal(settings({ ...fake, AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret', AWS_SESSION_TOKEN: 'test-session' }).upload.credentials.sessionToken, 'test-session');
  assert.equal(settings({ ...fake, AWS_ACCESS_KEY_ID: 'test-key', AWS_ACCESS_SECRET: 'test-legacy' }).upload.credentials.secretAccessKey, 'test-legacy');
  for (const values of [{ AWS_ACCESS_KEY_ID: 'test-key' }, { AWS_ACCESS_SECRET: 'test-key' }, { AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-current', AWS_ACCESS_SECRET: 'test-other' }]) {
    assert.throws(() => settings({ ...fake, ...values }));
  }
});

test('all real config modules consume the typed settings', () => {
  const env = k => ({ ...fake, PORT: '4567', DATABASE_FILENAME: './isolated.db', FLAG_NPS: 'false' })[k];
  const server = require(output + 'server.js').default({ env });
  const database = require(output + 'database.js').default({ env });
  const admin = require(output + 'admin.js').default({ env });
  const api = require(output + 'api.js').default({ env });
  const middlewares = require(output + 'middlewares.js').default({ env });
  assert.equal(server.port, 4567);
  assert.equal(database.connection.connection.filename, path.resolve('isolated.db'));
  assert.equal(admin.flags.nps, false);
  assert.equal(api.rest.maxLimit, defaults.restMaxLimit);
  assert.ok(middlewares.some(m => m.name === 'strapi::security'));
});

test('public CMS origin and proxy trust are explicit, validated and configured together', () => {
  const plain = require(output + 'server.js').default({ env: k => fake[k] });
  assert.equal(plain.url, undefined);
  assert.equal(plain.proxy?.koa, false);
  for (const origin of ['https://cms.example.test', 'http://127.0.0.1:4567']) {
    const values = { ...fake, CMS_PUBLIC_URL: origin, CMS_TRUST_PROXY: 'true' };
    const server = require(output + 'server.js').default({ env: k => values[k] });
    assert.equal(server.url, origin);
    assert.equal(server.proxy.koa, true);
  }
  for (const origin of ['http://cms.example.test', 'https://cms.example.test/admin',
    'https://test-key:private@cms.example.test', 'https://cms.example.test?private',
    'https://cms.example.test#private', 'https://cms.example.test\n', 'https://cms.example.test ',
    'https://cms.exa\tmple.test', 'https://cms.example.test?', 'https://cms.example.test#',
    'https://cms.example.test/hidden/..', 'https://cms.example.test/%2e',
    'https://cms.example.test\\hidden\\..', 'https://cms.example.test\u007f']) {
    assert.throws(() => settings({ ...fake, CMS_PUBLIC_URL: origin }),
      error => !error.message.includes('private'));
  }
  assert.throws(() => settings({ ...fake, CMS_TRUST_PROXY: 'true' }));
  assert.throws(() => settings({ ...fake, CMS_TRUST_PROXY: 'yes' }));
});

for (const region of ['us-east-1', 'eu-central-1']) for (const stream of [false, true]) test(`installed S3 provider sends synthetic ${stream ? 'stream' : 'buffer'} with no canned ACL (${region})`, async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on('data', c => parts.push(c));
    req.on('end', () => { calls.push({ headers: req.headers, body: Buffer.concat(parts).toString() }); res.setHeader('ETag', 'synthetic-etag'); res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const values = { ...fake, AWS_REGION: region, AWS_ACCESS_KEY_ID: 'test-key', [stream ? 'AWS_ACCESS_SECRET' : 'AWS_SECRET_ACCESS_KEY']: 'test-secret', AWS_SESSION_TOKEN: 'test-session', CMS_UPLOAD_ENDPOINT: `http://127.0.0.1:${server.address().port}`, CMS_UPLOAD_FORCE_PATH_STYLE: 'true' };
    const config = require(output + 'plugins.js').default({ env: k => values[k] }).upload.config;
    const provider = require('@strapi/provider-upload-aws-s3').init(config.providerOptions);
    const file = { hash: 'synthetic', ext: '.txt', mime: 'text/plain', buffer: Buffer.from('synthetic body') };
    if (stream) {
      file.stream = Readable.from(['synthetic body']);
      await provider.uploadStream(file, config.actionOptions.uploadStream);
    } else await provider.upload(file, config.actionOptions.upload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['x-amz-acl'], undefined);
    assert.equal(calls[0].headers['x-amz-security-token'], 'test-session');
    assert.ok(calls[0].headers.authorization.includes(`/${region}/s3/`));
    assert.ok(calls[0].body.includes('synthetic body'));
    assert.equal(provider.isPrivate(), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('private URL mode signs without provider requests and forbids CDN bypass', async () => {
  const values = { ...fake, AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret', CMS_UPLOAD_VISIBILITY: 'private' };
  assert.throws(() => settings({ ...values, CMS_UPLOAD_PUBLIC_ORIGIN: 'https://media.example.test' }));
  const config = require(output + 'plugins.js').default({ env: k => values[k] }).upload.config;
  const provider = require('@strapi/provider-upload-aws-s3').init(config.providerOptions);
  assert.equal(provider.isPrivate(), true);
  const result = await provider.getSignedUrl({ hash: 'synthetic', ext: '.txt', url: 'https://synthetic-bucket.s3.us-east-1.amazonaws.com/synthetic.txt' }, {});
  assert.ok(new URL(result.url).searchParams.has('X-Amz-Signature'));
  assert.equal(new URL(result.url).searchParams.get('X-Amz-Expires'), String(defaults.uploadSignedUrlSeconds));
});

test('runtime source configuration and secret regression', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/config/runtime-settings.ts'), 'utf8');
  const example = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
  for (const [, name] of source.matchAll(/(?:read|text|integer|bool|secret)\('([A-Z0-9_]+)'/g)) assert.ok(example.includes(`${name}=`), name);
  for (const filename of ['plugins.ts', 'database.ts', 'server.ts', 'api.ts', 'admin.ts', 'middlewares.ts']) {
    const content = fs.readFileSync(path.join(__dirname, '../../config', filename), 'utf8');
    assert.ok(!content.includes('300000') && !content.includes("'.tmp'"));
    const tree = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
    const inspect = node => {
      const directProcessEnv = ts.isPropertyAccessExpression(node) && node.expression.getText(tree) === 'process' && node.name.text === 'env';
      const directEnvCall = ts.isCallExpression(node) && node.expression.getText(tree) === 'env';
      assert.ok(!directProcessEnv && !directEnvCall, filename);
      ts.forEachChild(node, inspect);
    };
    inspect(tree);
  }
});
