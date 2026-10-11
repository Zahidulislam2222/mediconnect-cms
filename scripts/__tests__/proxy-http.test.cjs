const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const createKoaApp = require(path.join(path.dirname(require.resolve('@strapi/core')), 'services/server/koa.js'));
const configure = require('../../local-tests/runtime-build/config/server.js').default;

for (const trust of [false, true]) test(`installed Strapi Koa HTTP forwarded-header trust is explicit (${trust})`, async () => {
  const values = {
    APP_KEYS: 'test-key-one,test-key-two', ADMIN_JWT_SECRET: 'test-key',
    API_TOKEN_SALT: 'test-key', TRANSFER_TOKEN_SALT: 'test-key', ENCRYPTION_KEY: 'test-key',
    JWT_SECRET: 'test-key', AWS_REGION: 'us-east-1', AWS_BUCKET: 'synthetic-bucket',
    CMS_PUBLIC_URL: 'https://cms.example.test', CMS_TRUST_PROXY: String(trust),
  };
  const config = configure({ env: key => values[key] });
  const app = createKoaApp({ proxy: config.proxy.koa, keys: config.app.keys });
  app.use(ctx => { ctx.body = { protocol: ctx.protocol, host: ctx.host, ip: ctx.ip }; });
  const server = http.createServer(app.callback());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { headers: {
      'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'cms.example.test',
      'X-Forwarded-For': '198.51.100.22',
    } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.protocol, trust ? 'https' : 'http');
    assert.equal(result.host, trust ? 'cms.example.test' : `127.0.0.1:${server.address().port}`);
    assert.equal(result.ip, trust ? '198.51.100.22' : '127.0.0.1');
    assert.equal(config.url, 'https://cms.example.test');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
