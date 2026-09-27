const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('container uses supported Node and a locked dependency install', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /ARG NODE_IMAGE=node:22/);
  assert.match(dockerfile, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(dockerfile, /npm install -g|node:18/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /RUN chown node:node \/opt\/app/);
});

test('container sends only explicit source paths and excludes private material', () => {
  const rules = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/).filter(row => row && !row.startsWith('#'));
  assert.equal(rules[0], '**');
  const allowed = rules.filter(rule => rule.startsWith('!'));
  assert.deepEqual(allowed, ['!package.json', '!package-lock.json', '!tsconfig.json', '!config/', '!config/**',
    '!src/', '!src/**', '!types/', '!types/**', '!database/', '!database/migrations/', '!database/migrations/**',
    '!scripts/', '!scripts/container-build.cjs', '!public/', '!public/robots.txt', '!favicon.png']);
  for (const rule of ['**/.env*', '**/*.db*', '**/*.sqlite*', '**/*.key', '**/*.pem', '**/CREDENTIALS.md', '**/memory/**']) {
    assert.ok(rules.includes(rule), `Missing exclusion: ${rule}`);
  }
});

test('build placeholders are explicitly fake and never runtime Docker environment', () => {
  const settings = require('../../config/container-build.json');
  for (const key of ['APP_KEYS', 'ADMIN_JWT_SECRET', 'API_TOKEN_SALT', 'TRANSFER_TOKEN_SALT', 'ENCRYPTION_KEY', 'JWT_SECRET']) {
    assert.ok(settings[key].startsWith('test-key'));
  }
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /(?:ARG|ENV)\s+(?:APP_KEYS|ADMIN_JWT_SECRET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)/);
});
