// Throwaway settings let Strapi load configuration while compiling its admin UI.
// They are scoped to this child process, never installed as runtime image ENV.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const settings = require('../config/container-build.json');
const result = spawnSync(process.execPath, [
  path.resolve(__dirname, '../node_modules/@strapi/strapi/bin/strapi.js'), 'build',
], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...settings }, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
